import { generateText, Output } from 'ai'
import { log } from 'evlog'
import {
  type AgentConfig,
  agentConfigSchema,
  createAgent,
  DEFAULT_MODEL,
  getDefaultConfig,
  fallbackPlan,
  buildGenerationSettings,
  resolveModelWrapper,
  setAIGatewayMetadata,
  ROUTER_MODEL,
  ROUTER_SYSTEM_PROMPT,
  buildBotSystemPrompt,
  buildBotUserMessage,
  generateFinalAnswer,
  isSubstantiveAnswer,
  SYNTHESIS_FAILURE_MESSAGE,
  type ResearchReport,
} from '@savoir/agent'
import { createLibraryResearch } from '../library-research'
import { createInternalSavoir } from './savoir'
import type { ThreadContext } from './types'

function buildRouterInput(question: string, context?: ThreadContext): string {
  const parts: string[] = []

  if (context) {
    parts.push(`Source: ${context.source}`)
    if (context.number) {
      parts.push(`#${context.number}: ${context.title}`)
    } else {
      parts.push(`Thread: ${context.title}`)
    }
    if (context.body) {
      parts.push(`Description: ${context.body.slice(0, 500)}`)
    }
    if (context.labels.length) {
      parts.push(`Labels: ${context.labels.join(', ')}`)
    }
  }

  parts.push(`Question: ${question}`)

  return parts.join('\n')
}

async function routeQuestion(question: string, context?: ThreadContext): Promise<AgentConfig> {
  try {
    const { output } = await generateText({
      model: resolveModelWrapper()(ROUTER_MODEL),
      output: Output.object({ schema: agentConfigSchema }),
      messages: [
        { role: 'system', content: ROUTER_SYSTEM_PROMPT },
        { role: 'user', content: buildRouterInput(question, context) },
      ],
      ...buildGenerationSettings(ROUTER_MODEL, 'router'),
    })

    if (!output) {
      log.warn('bot', 'Router returned no output, using default config')
      return { ...getDefaultConfig(), plan: fallbackPlan(question) }
    }

    log.info('bot', `Router decision: ${output.complexity} (${output.model}, ${output.maxSteps} steps) - ${output.reasoning}`)
    return { ...output, plan: output.plan ?? fallbackPlan(question), maxSteps: Math.min(output.maxSteps, 8) }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log.error('bot', `Router failed: ${errorMessage}, using default config`)
    return { ...getDefaultConfig(), plan: fallbackPlan(question) }
  }
}

export async function generateAIResponse(
  question: string,
  context?: ThreadContext,
  userId?: string,
): Promise<string> {
  const startTime = Date.now()
  const adapterTag = context?.platform ? `${context.platform}-adapter` : 'bot'
  setAIGatewayMetadata({ userId, tags: [adapterTag] })

  try {
    const savoir = createInternalSavoir({
      source: context?.platform ? `${context.platform}-bot` : 'bot',
      sourceId: context?.number ? `issue-${context.number}` : undefined,
    })

    const reports: ResearchReport[] = []
    let effectiveModel = DEFAULT_MODEL
    let finalSystem = 'Answer the original question from the sources actually consulted, with citations.'
    let temperature = 0.2
    const agent = createAgent({
      tools: savoir.tools,
      research: createLibraryResearch({ onReport: report => reports.push(report) }),
      getAgentConfig: savoir.getAgentConfig,
      route: () => routeQuestion(question, context),
      buildPrompt: (routerConfig, agentConfig) => buildBotSystemPrompt(context, routerConfig, agentConfig),
      resolveModel: (routerConfig, agentConfig) => agentConfig.defaultModel || routerConfig.model,
      onRouted: ({ effectiveModel: model, agentConfig, routerConfig }) => {
        effectiveModel = model
        ;({ temperature } = agentConfig)
        finalSystem = buildBotSystemPrompt(context, routerConfig, agentConfig)
      },
    })

    let result: Awaited<ReturnType<typeof agent.generate>> | undefined
    try {
      result = await agent.generate({ prompt: buildBotUserMessage(question, context), options: {} })
    } catch {
      log.warn('bot', 'Research generation failed; attempting final synthesis from retained evidence')
    }

    if (result) savoir.reportUsage(result, {
      startTime,
      metadata: context ? { source: context.source } : undefined,
    }).catch(e => log.debug({ event: 'bot.usage_report.failed', error: e instanceof Error ? e.message : 'Unknown' }))

    if (reports.length || !result || !isSubstantiveAnswer(result.text) || result.finishReason !== 'stop' || result.steps.some(step => step.toolCalls.length)) {
      const final = await generateFinalAnswer({
        model: effectiveModel, system: finalSystem, tools: savoir.tools, reports, temperature,
        messages: [{ role: 'user', content: buildBotUserMessage(question, context) }, ...(reports.length ? [] : result?.response.messages ?? [])],
      })
      log.info({ event: 'bot.synthesis', status: final.status, passes: reports.length })
      savoir.reportUsage({ response: { modelId: effectiveModel }, totalUsage: final.totalUsage }, {
        startTime, metadata: { phase: 'synthesis' },
      }).catch(() => log.debug('bot', 'Synthesis usage report failed'))
      return final.text
    }

    return result.text
  } catch {
    return SYNTHESIS_FAILURE_MESSAGE
  }
}
