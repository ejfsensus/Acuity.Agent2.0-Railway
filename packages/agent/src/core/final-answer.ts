import { generateText, type LanguageModelUsage, type ModelMessage, type ToolSet } from 'ai'
import { buildProviderOptions } from '../router/schema'
import { resolveGatewayMetadata, resolveModelWrapper } from './observe'
import { finalAnswerMessages } from './policy'

export async function generateFinalAnswer({ model, messages, tools, system, abortSignal }: {
  model: string
  messages: ModelMessage[]
  tools: ToolSet
  system: string
  abortSignal?: AbortSignal
}): Promise<{ text: string, totalUsage: LanguageModelUsage }> {
  const result = await generateText({
    model: resolveModelWrapper()(model),
    system,
    messages: finalAnswerMessages(messages),
    tools,
    toolChoice: 'none',
    maxOutputTokens: 8192,
    providerOptions: buildProviderOptions(model, resolveGatewayMetadata(), true),
    abortSignal,
  })
  return { text: result.text, totalUsage: result.totalUsage }
}
