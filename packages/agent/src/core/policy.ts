import type { ModelMessage, StepResult, ToolSet } from 'ai'

export function finalAnswerMessages(messages: ModelMessage[]): ModelMessage[] {
  return [
    ...messages, {
      role: 'system',
      content: 'The research phase is complete. Tools are now disabled. Answer the user\'s original question using the evidence already retrieved, with source file citations. If evidence is insufficient, explain that limitation. Do not request more searches, describe future actions, or output tool-call markup. Provide the final user-facing answer now.',
    }
  ]
}

export function researchStepBudget(routedSteps: number, multiplier: number): number {
  return Math.max(1, Math.min(120, Math.round(routedSteps * multiplier)))
}

export function shouldForceTextOnlyStep({
  stepNumber,
  maxSteps,
}: {
  stepNumber: number
  maxSteps: number
  steps?: StepResult<ToolSet>[]
}): boolean {
  return stepNumber >= maxSteps
}
