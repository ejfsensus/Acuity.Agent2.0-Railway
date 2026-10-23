import type { ModelMessage, StepResult, ToolSet } from 'ai'

export function finalAnswerMessages(messages: ModelMessage[]): ModelMessage[] {
  return [
    ...messages, {
      role: 'system',
      content: 'The research phase is complete. Tools are now disabled. Answer the user\'s original question using the evidence already retrieved, with source file citations. If evidence is insufficient, explain that limitation. Do not request more searches, describe future actions, or output tool-call markup. Provide the final user-facing answer now.',
    }
  ]
}

export function countConsecutiveToolSteps(steps: StepResult<ToolSet>[]): number {
  let streak = 0
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (!step) break
    if (step.toolCalls && step.toolCalls.length > 0) {
      streak++
      continue
    }
    break
  }
  return streak
}

export function shouldForceTextOnlyStep({
  stepNumber,
  maxSteps,
  steps,
}: {
  stepNumber: number
  maxSteps: number
  steps: StepResult<ToolSet>[]
}): boolean {
  // Always reserve the last 2 steps for final user-facing output.
  if (stepNumber >= maxSteps - 2) return true

  const toolStreak = countConsecutiveToolSteps(steps)
  const pastMidpoint = stepNumber >= Math.max(3, Math.floor(maxSteps * 0.6))

  // If the model is stuck in a tool-only streak deep in the loop, force synthesis.
  if (pastMidpoint && toolStreak >= 4) return true

  return false
}
