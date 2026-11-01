import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, type LanguageModelUsage, type ModelMessage, type StepResult, type ToolSet, type UIMessage } from 'ai'
import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { createSavoir } from '@savoir/sdk'
import { useLogger } from 'evlog'
import { createSourceAgent, createAdminAgent, setAIGatewayMetadata, INVALID_RESPONSE_MESSAGE, generateFinalAnswer, buildChatSystemPrompt, ADMIN_SYSTEM_PROMPT, researchTools } from '@savoir/agent'
import { completeResponseStream } from '../../utils/chat/complete-response'
import { forwardAuthHeaders } from '../../utils/chat/forward-auth'
import { generateTitle } from '../../utils/chat/generate-title'
import { getAgentConfig } from '../../utils/agent-config'
import { KV_KEYS } from '../../utils/sandbox/types'
import { adminTools } from '../../utils/chat/admin-tools'
import { checkRateLimit, incrementRateLimit, isRateLimited, isServiceAccount } from '../../utils/rate-limit'
import { buildSourcesChunk, labelCitedSources, sourcesFromToolResults, type ToolResultLike } from '../../utils/chat/collect-sources'
import { libraryAttributions } from '../../utils/attribution'
import { appKvGet, appKvSet } from '../../utils/app-kv'

defineRouteMeta({
  openAPI: {
    description: 'Chat with AI about the available sources.',
    tags: ['ai'],
  },
})

export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  const requestId = crypto.randomUUID().slice(0, 8)

  requestLog.set({
    requestId,
    path: '/api/chats/[id]',
    method: 'POST',
  })

  try {
    const { user } = await requireAuthorizedUser(event)
    requestLog.set({ userId: user.id })
    setAIGatewayMetadata({ userId: user.id, tags: ['web-chat'] })

    const { id } = await getValidatedRouterParams(event, z.object({
      id: z.string(),
    }).parse)
    requestLog.set({ chatId: id })

    const { model, messages } = await readValidatedBody(event, z.object({
      model: z.string(),
      messages: z.array(z.custom<UIMessage>()),
    }).parse)
    requestLog.set({ model, messageCount: messages.length })

    const chat = await db.query.chats.findFirst({
      where: () => and(
        eq(schema.chats.id, id as string),
        eq(schema.chats.userId, user.id),
      ),
      with: { messages: true },
    })
    if (!chat) {
      requestLog.error(new Error('Chat not found'))
      requestLog.set({ outcome: 'error' })
      throw createError({ statusCode: 404, statusMessage: 'Chat not found', data: { why: 'No chat exists with this ID for your user account', fix: 'Verify the chat ID is correct' } })
    }
    requestLog.set({ existingMessages: chat.messages.length, chatMode: chat.mode })

    const isAdminChat = chat.mode === 'admin'

    if (isAdminChat && user.role !== 'admin') {
      throw createError({ statusCode: 403, statusMessage: 'Admin access required', data: { why: 'This chat is in admin mode and requires the admin role', fix: 'Contact an administrator to be granted access' } })
    }

    const serviceAccount = isServiceAccount(user.email)
    if (serviceAccount) {
      // Acuity.Search relays questions for its own users; it names them with an opaque id.
      const onBehalfOf = getHeader(event, 'x-acuity-on-behalf-of')?.slice(0, 120)
      requestLog.set({ serviceAccount: true, ...(onBehalfOf && { onBehalfOf }) })
    }

    let rateLimitInfo: { allowed: boolean, remaining: number, limit: number } | undefined
    if (isRateLimited(user)) {
      rateLimitInfo = await checkRateLimit(user.id)
      if (!rateLimitInfo.allowed) {
        throw createError({ statusCode: 429, statusMessage: 'Rate limit exceeded', data: { why: `You have reached the daily limit of ${rateLimitInfo.limit} messages`, fix: 'Wait until tomorrow or contact an administrator' } })
      }
    }

    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'user' && messages.length > 1) {
      await db.insert(schema.messages).values({
        id: lastMessage.id,
        chatId: id as string,
        role: 'user',
        parts: lastMessage.parts,
      })
    }

    let effectiveModel = model

    // One sandbox session per chat: concurrent chats must not share a shell or its working state.
    const sandboxKey = KV_KEYS.chatSandboxSession(chat.id)
    const existingSessionId = await appKvGet<string>(sandboxKey)
    if (existingSessionId) {
      requestLog.set({ sandboxSessionId: existingSessionId })
    }

    const savoir = createSavoir({
      apiUrl: getRequestURL(event).origin,
      headers: forwardAuthHeaders(getHeaders(event)),
      sessionId: existingSessionId || undefined,
    })

    let researchMessages: ModelMessage[] = []
    const toolResults: ToolResultLike[] = []
    const onStepFinish = (step: StepResult<ToolSet>) => {
      researchMessages = step.response.messages
      for (const result of step.toolResults ?? []) {
        toolResults.push({ toolName: result.toolName, output: (result as { output?: unknown }).output })
      }
    }
    const agent = isAdminChat
      ? createAdminAgent({
        tools: adminTools,
        onStepFinish,
      })
      : createSourceAgent({
        tools: savoir.tools,
        getAgentConfig,
        onStepFinish,
        messages,
        defaultModel: model,
        requestId,
        onRouted: ({ routerConfig, agentConfig, effectiveModel: routedModel, effectiveMaxSteps }) => {
          effectiveModel = routedModel
          requestLog.set({
            routerComplexity: routerConfig.complexity,
            routerMaxSteps: routerConfig.maxSteps,
            effectiveMaxSteps,
            stepsMultiplier: agentConfig.maxStepsMultiplier,
            routerReasoning: routerConfig.reasoning,
          })
        },
      })

    const requestStartTime = Date.now()

    const abortController = new AbortController()
    event.node.res.once('close', () => {
      if (!event.node.res.writableFinished) {
        abortController.abort()
      }
    })

    const titleTask = (!chat.title && messages[0])
      ? generateTitle({
        firstMessage: messages[0],
        chatId: id as string,
        requestId,
      })
      : null

    let usagePromise: PromiseLike<LanguageModelUsage> | undefined
    let recoveryUsage: LanguageModelUsage | undefined
    let responseFailed = false
    const onResponseError = (error: unknown) => {
      responseFailed = true
      requestLog.error(error instanceof Error ? error : new Error(String(error)))
      return error instanceof Error && error.message === INVALID_RESPONSE_MESSAGE
        ? INVALID_RESPONSE_MESSAGE
        : 'The response could not be completed. Please try again.'
    }
    const stream = createUIMessageStream({
      onError: onResponseError,
      execute: async ({ writer }) => {
        const modelMessages = await convertToModelMessages(messages)
        const result = await agent.stream({
          messages: modelMessages,
          options: { model },
          abortSignal: abortController.signal,
        })
        usagePromise = result.totalUsage
        let answerText = ''
        // Emits the structured sources (acuity.agent-sources.v1) just before `finish`, so they are
        // persisted with the assistant message and visible to API callers in the stream and in GET.
        const withSources = new TransformStream<any, any>({
          transform(chunk, controller) {
            if (chunk?.type === 'text-delta' && typeof chunk.delta === 'string') answerText += chunk.delta
            if (chunk?.type === 'finish' && !isAdminChat) {
              try {
                const sources = labelCitedSources(sourcesFromToolResults(toolResults, libraryAttributions()), answerText)
                if (sources.length) controller.enqueue(buildSourcesChunk(sources))
                requestLog.set({ sourcesCollected: sources.length, sourcesCited: sources.filter(source => source.cited).length })
              } catch (error) {
                requestLog.set({ sourcesError: error instanceof Error ? error.message : String(error) })
              }
            }
            controller.enqueue(chunk)
          },
        })
        writer.merge(completeResponseStream({
          stream: result.toUIMessageStream({ onError: onResponseError }),
          abortSignal: abortController.signal,
          onError: onResponseError,
          recover: async () => {
            requestLog.set({ synthesisRecovery: true, completedResearchMessages: researchMessages.length })
            const config = isAdminChat ? undefined : await getAgentConfig()
            const final = await generateFinalAnswer({
              model: effectiveModel,
              messages: [...modelMessages, ...researchMessages],
              tools: (isAdminChat ? adminTools : { ...savoir.tools, ...researchTools }) as ToolSet,
              system: isAdminChat ? ADMIN_SYSTEM_PROMPT : buildChatSystemPrompt(config!),
              temperature: config?.temperature,
              abortSignal: abortController.signal,
            })
            recoveryUsage = final.totalUsage
            if (final.text.trim()) responseFailed = false
            return final.text
          },
        }).pipeThrough(withSources))

        const title = await titleTask
        if (title) {
          writer.write({ type: 'data-chat-title', data: { title }, transient: true })
        }
      },
      onFinish: async ({ messages: responseMessages }) => {
        const dbStartTime = Date.now()
        const totalDurationMs = Date.now() - requestStartTime
        const usage = await Promise.resolve(usagePromise).catch(() => undefined)
        const usageMessageIndex = responseMessages.findLastIndex(message => message.role === 'assistant')

        if (responseMessages.length) await db.insert(schema.messages).values(responseMessages.map((message: UIMessage, index: number) => ({
          id: message.id,
          chatId: chat.id,
          role: message.role as 'user' | 'assistant',
          parts: message.parts,
          ...(message.role === 'assistant' && {
            model: effectiveModel,
            durationMs: totalDurationMs,
            inputTokens: index === usageMessageIndex ? (usage?.inputTokens ?? 0) + (recoveryUsage?.inputTokens ?? 0) : undefined,
            outputTokens: index === usageMessageIndex ? (usage?.outputTokens ?? 0) + (recoveryUsage?.outputTokens ?? 0) : undefined,
          }),
        })))
        const dbDurationMs = Date.now() - dbStartTime

        if (!isAdminChat) {
          const currentSessionId = savoir.getSessionId()
          if (currentSessionId) {
            await appKvSet(sandboxKey, currentSessionId, { ttl: 60 * 60 })
          }
        }

        if (isRateLimited(user)) {
          await incrementRateLimit(user.id)
        }

        requestLog.set({
          outcome: responseFailed ? 'error' : 'success',
          responseMessageCount: responseMessages.length,
          dbInsertMs: dbDurationMs,
          totalDurationMs,
        })
      },
    })

    if (rateLimitInfo) {
      setHeader(event, 'X-RateLimit-Limit', String(rateLimitInfo.limit))
      setHeader(event, 'X-RateLimit-Remaining', String(rateLimitInfo.remaining - 1))
    }

    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    requestLog.error(error instanceof Error ? error : new Error(String(error)))
    requestLog.set({ outcome: 'error' })
    throw error
  }
})
