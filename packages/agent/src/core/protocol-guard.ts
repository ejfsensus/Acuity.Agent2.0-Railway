import type { LanguageModelV3CallOptions, LanguageModelV3Middleware, LanguageModelV3StreamPart, LanguageModelV3Usage } from '@ai-sdk/provider'
import { log } from 'evlog'

export const INVALID_RESPONSE_MESSAGE = 'The model returned an invalid tool response. Please regenerate this answer.'

// DeepSeek sometimes emits its internal serialization in content instead of
// returning API tool_calls. Never parse or execute commands from that text.
export function hasToolProtocol(text: string): boolean {
  return /<\/?[｜|]*DSML[｜|]*[^>]*(?:>|$)|<\|(?:tool_calls_section_begin|tool_call_begin)\|>/i.test(text)
}

function cleanPrompt(prompt: LanguageModelV3CallOptions['prompt']) {
  return prompt.map(message => message.role !== 'assistant' ? message : {
    ...message,
    content: message.content.map(part => part.type === 'text' && hasToolProtocol(part.text)
      ? { ...part, text: INVALID_RESPONSE_MESSAGE }
      : part),
  })
}

function retryParams(params: LanguageModelV3CallOptions, attempt: number, empty = false): LanguageModelV3CallOptions {
  const final = empty || params.toolChoice?.type === 'none' || attempt === 2
  return {
    ...params,
    ...(final && { toolChoice: { type: 'none' }, maxOutputTokens: 8192 }),
    prompt: [
      ...params.prompt,
      {
        role: 'system',
        content: final
          ? 'A previous generation failed response validation. Research is complete. Do not call tools or describe future searches. Answer the original question now using the evidence already retrieved, with citations. State any evidence gaps honestly. Return only the final answer in ordinary prose; never output internal tool protocol.'
          : 'A previous generation failed response validation. Use the API structured tool_calls field for any necessary tool invocation. Never write tool protocol or simulated tool calls in the text content. Otherwise answer the original question using the available evidence.',
      },
    ],
  }
}

function totalUsage(current: LanguageModelV3Usage, previous?: LanguageModelV3Usage): LanguageModelV3Usage {
  if (!previous) return current
  const sum = (a?: number, b?: number) => a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)
  return {
    ...current,
    inputTokens: {
      total: sum(current.inputTokens.total, previous.inputTokens.total),
      noCache: sum(current.inputTokens.noCache, previous.inputTokens.noCache),
      cacheRead: sum(current.inputTokens.cacheRead, previous.inputTokens.cacheRead),
      cacheWrite: sum(current.inputTokens.cacheWrite, previous.inputTokens.cacheWrite),
    },
    outputTokens: {
      total: sum(current.outputTokens.total, previous.outputTokens.total),
      text: sum(current.outputTokens.text, previous.outputTokens.text),
      reasoning: sum(current.outputTokens.reasoning, previous.outputTokens.reasoning),
    },
  }
}

/** Validate each complete model step before any part reaches the SDK or UI. */
export const toolProtocolGuard: LanguageModelV3Middleware = {
  specificationVersion: 'v3',
  transformParams: ({ params }) => Promise.resolve({ ...params, prompt: cleanPrompt(params.prompt) }),
  wrapGenerate: async ({ params, model }) => {
    let rejectedUsage: LanguageModelV3Usage | undefined
    let empty = false
    for (let attempt = 0; attempt < 3; attempt++) {
      params.abortSignal?.throwIfAborted()
      const options = attempt ? retryParams(params, attempt, empty) : params
      const result = await model.doGenerate(options)
      const text = result.content.filter(part => part.type === 'text').map(part => part.text).join('')
      const forbiddenCall = options.toolChoice?.type === 'none' && result.content.some(part => part.type === 'tool-call')
      empty = !text.trim() && !result.content.some(part => part.type === 'tool-call')
      if (!hasToolProtocol(text) && !forbiddenCall && !empty) return { ...result, usage: totalUsage(result.usage, rejectedUsage) }
      rejectedUsage = totalUsage(result.usage, rejectedUsage)
      log.warn({ event: 'ai.invalid_tool_protocol', model: model.modelId, attempt: attempt + 1 })
    }
    throw new Error(INVALID_RESPONSE_MESSAGE)
  },
  wrapStream: async ({ params, model }) => {
    let rejectedUsage: LanguageModelV3Usage | undefined
    let empty = false
    for (let attempt = 0; attempt < 3; attempt++) {
      params.abortSignal?.throwIfAborted()
      const options = attempt ? retryParams(params, attempt, empty) : params
      const result = await model.doStream(options)
      const reader = result.stream.getReader()
      const chunks: LanguageModelV3StreamPart[] = []
      let text = ''
      let size = 0
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          size += JSON.stringify(value).length
          if (size > 8_000_000) {
            await reader.cancel()
            throw new Error('The model response exceeded the supported size. Please try a narrower question.')
          }
          chunks.push(value)
          if (value.type === 'text-delta') text += value.delta
        }
      } finally {
        reader.releaseLock()
      }
      const forbiddenCall = options.toolChoice?.type === 'none' && chunks.some(part => part.type === 'tool-call' || part.type === 'tool-input-start')
      empty = !text.trim() && !chunks.some(part => part.type === 'tool-call')
      if (!hasToolProtocol(text) && !forbiddenCall && !empty) {
        const previousUsage = rejectedUsage
        return {
          ...result,
          stream: new ReadableStream<LanguageModelV3StreamPart>({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk.type === 'finish' ? { ...chunk, usage: totalUsage(chunk.usage, previousUsage) } : chunk)
              controller.close()
            },
          }),
        }
      }
      const finish = chunks.findLast(part => part.type === 'finish')
      if (finish) rejectedUsage = totalUsage(finish.usage, rejectedUsage)
      log.warn({ event: 'ai.invalid_tool_protocol', model: model.modelId, attempt: attempt + 1 })
    }
    throw new Error(INVALID_RESPONSE_MESSAGE)
  },
}
