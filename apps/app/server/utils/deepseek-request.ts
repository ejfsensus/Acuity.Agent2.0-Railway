/** OpenAI-compatible options cannot express DeepSeek's thinking toggle. */
export function transformDeepSeekRequest(body: Record<string, unknown>): Record<string, unknown> {
  const thinking = body.thinking as { type?: string } | undefined
  const disabled = thinking?.type === 'disabled' || body.tool_choice === 'none' || body.reasoning_effort === 'none'
  const { reasoning_effort: reasoningEffort, temperature, top_p: topP, presence_penalty: presencePenalty, frequency_penalty: frequencyPenalty, ...rest } = body
  if (!disabled) {
    return { ...rest, ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}), ...(topP !== undefined ? { top_p: topP } : {}), thinking: { type: 'enabled' } }
  }
  return {
    ...rest,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { top_p: topP } : {}),
    ...(presencePenalty !== undefined ? { presence_penalty: presencePenalty } : {}),
    ...(frequencyPenalty !== undefined ? { frequency_penalty: frequencyPenalty } : {}),
    thinking: { type: 'disabled' },
  }
}
