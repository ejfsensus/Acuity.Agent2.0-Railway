import { generateText, type LanguageModelUsage, type ModelMessage, type ToolSet } from 'ai'
import { buildGenerationSettings } from '../router/schema'
import { resolveModelWrapper } from './observe'
import { finalAnswerMessages } from './policy'

export async function generateFinalAnswer({ model, messages, tools, system, abortSignal, temperature }: {
  model: string
  messages: ModelMessage[]
  tools: ToolSet
  system: string
  abortSignal?: AbortSignal
  temperature?: number
}): Promise<{ text: string, totalUsage: LanguageModelUsage }> {
  const result = await generateText({
    model: resolveModelWrapper()(model),
    system,
    messages: finalAnswerMessages(messages),
    tools,
    toolChoice: 'none',
    ...buildGenerationSettings(model, 'final', temperature),
    abortSignal,
  })
  return { text: result.text, totalUsage: result.totalUsage }
}
