import { generateText, type LanguageModelUsage, type ModelMessage, type ToolSet } from 'ai'
import { buildGenerationSettings } from '../router/schema'
import type { ResearchReport } from '../retrieval/controller'
import { resolveModelWrapper } from './observe'
import { finalAnswerMessages } from './policy'
import { evidenceOnlyAnswer, isSubstantiveAnswer, synthesisContext, synthesisMessages, verifiedPassages } from './synthesis'

export async function generateFinalAnswer({ model, messages, tools, system, reports = [], abortSignal, temperature }: {
  model: string
  messages: ModelMessage[]
  tools: ToolSet
  system: string
  abortSignal?: AbortSignal
  temperature?: number
  reports?: ResearchReport[]
}): Promise<{ text: string, totalUsage: LanguageModelUsage, status: 'complete' | 'evidence-only' | 'failed' }> {
  const wrap = resolveModelWrapper()
  const signal = AbortSignal.any([...(abortSignal ? [abortSignal] : []), AbortSignal.timeout(90_000)])
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  const totalUsage = (): LanguageModelUsage => ({ inputTokens, outputTokens, totalTokens,
    inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined } })
  for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
    try {
      const result = await generateText({
        model: wrap(model),
        system: system + (reports.length ? synthesisContext(reports) : '') + (attempt ? '\n\nThe previous generation failed the answer contract. Write the actual answer now, including supported findings and limitations. Do not return a passage count, progress update or future plan.' : ''),
        messages: finalAnswerMessages(reports.length ? synthesisMessages(messages) : messages),
        tools,
        activeTools: [],
        toolChoice: 'none',
        ...buildGenerationSettings(model, 'final', temperature),
        maxRetries: 0,
        abortSignal: signal,
      })
      inputTokens += result.totalUsage.inputTokens ?? 0
      outputTokens += result.totalUsage.outputTokens ?? 0
      totalTokens += result.totalUsage.totalTokens ?? 0
      if (result.finishReason === 'stop' && isSubstantiveAnswer(result.text)) {
        return { text: result.text, totalUsage: totalUsage(), status: 'complete' }
      }
    } catch (error) {
      if (abortSignal?.aborted) throw error
    }
  }
  abortSignal?.throwIfAborted()
  return { text: evidenceOnlyAnswer(reports), totalUsage: totalUsage(), status: verifiedPassages(reports).length ? 'evidence-only' : 'failed' }
}
