import type { ModelMessage, StepResult, ToolSet } from 'ai'

export function finalAnswerMessages(messages: ModelMessage[]): ModelMessage[] {
  return [
    ...messages, {
      role: 'system',
      content: 'The research phase is complete. Tools are now disabled. Answer the user\'s original question using the evidence accumulated across every successful research pass, with precise source citations. An earlier search miss does not invalidate evidence found later. If evidence is insufficient, provide the supported findings and explain the remaining limitation. A passage count, progress update, source list or promise to synthesise is not an answer. Do not request more searches, describe future actions, or output tool-call markup. Provide the substantive final user-facing answer now.',
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
