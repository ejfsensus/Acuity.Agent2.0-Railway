import { hasToolProtocol, INVALID_RESPONSE_MESSAGE } from '@savoir/agent'

/** Keep old provider failures readable without rewriting stored research. */
export function readableAssistantMessage<T extends { role: string, parts: unknown }>(message: T): T {
  if (message.role !== 'assistant' || !Array.isArray(message.parts)) return message
  return {
    ...message,
    parts: message.parts.map(part => part?.type === 'text' && typeof part.text === 'string' && hasToolProtocol(part.text)
      ? { ...part, text: INVALID_RESPONSE_MESSAGE }
      : part),
  }
}
