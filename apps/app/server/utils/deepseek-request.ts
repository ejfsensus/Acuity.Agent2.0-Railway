/** OpenAI-compatible options cannot express DeepSeek's thinking toggle. */
export function transformDeepSeekRequest(body: Record<string, unknown>): Record<string, unknown> {
  if (body.tool_choice !== 'none' && body.reasoning_effort !== 'none') return body
  const { reasoning_effort: reasoningEffort, ...rest } = body
  return {
    ...rest,
    ...(reasoningEffort && reasoningEffort !== 'none' ? { reasoning_effort: reasoningEffort } : {}),
    thinking: { type: 'disabled' },
  }
}
