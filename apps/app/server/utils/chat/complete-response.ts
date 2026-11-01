import type { UIMessageChunk } from 'ai'
import { isSubstantiveAnswer, SYNTHESIS_FAILURE_MESSAGE } from '@savoir/agent'

export { SYNTHESIS_FAILURE_MESSAGE }

/** Hold the finish event until an answer follows the last research tool result. */
export function completeResponseStream({ stream, recover, onError, abortSignal, synthesizeAfterResearch = false, hasPreparedResearch = () => false }: {
  stream: ReadableStream<UIMessageChunk>
  recover: () => Promise<string | { text: string, finishReason: 'stop' | 'error' }>
  onError: (error: unknown) => void
  abortSignal?: AbortSignal
  synthesizeAfterResearch?: boolean
  hasPreparedResearch?: () => boolean
}): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader()
      let finish: Extract<UIMessageChunk, { type: 'finish' }> | undefined
      let answer = ''
      let failed = false
      let started = false
      let aborted = false
      let stepOpen = false
      let researched = false
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value.type === 'finish') {
            finish = value
            continue
          }
          if (value.type === 'error') {
            failed = true
            onError(new Error(value.errorText))
            continue
          }
          if (value.type === 'start') started = true
          if (value.type === 'start-step') stepOpen = true
          if (value.type === 'finish-step') stepOpen = false
          if (value.type === 'abort') {
            aborted = true
            if (synthesizeAfterResearch && !abortSignal?.aborted) {
              failed = true
              continue
            }
          }
          if (value.type.startsWith('tool-')) {
            researched = true
            answer = ''
          }
          if (value.type === 'text-delta') answer += value.delta
          // Research narration must never be persisted or displayed as the answer.
          if (synthesizeAfterResearch && (value.type.startsWith('text-') || value.type.startsWith('reasoning-'))) continue
          controller.enqueue(value)
        }
      } catch (error) {
        failed = true
        onError(error)
      } finally {
        reader.releaseLock()
      }

      if (abortSignal?.aborted || (aborted && !synthesizeAfterResearch)) {
        controller.close()
        return
      }

      const needsSynthesis = failed || !isSubstantiveAnswer(answer) || (finish !== undefined && finish.finishReason !== 'stop')
        || (synthesizeAfterResearch && (researched || hasPreparedResearch()))
      if (needsSynthesis || synthesizeAfterResearch) {
        let text = answer
        let finishReason: 'stop' | 'error' = 'stop'
        try {
          if (needsSynthesis) {
            const result = await recover()
            text = typeof result === 'string' ? result : result.text
            finishReason = typeof result === 'string' ? 'stop' : result.finishReason
          }
          if (!isSubstantiveAnswer(text)) throw new Error('Synthesis returned no substantive answer')
        } catch (error) {
          if (abortSignal?.aborted) {
            controller.close()
            return
          }
          onError(error)
          text = SYNTHESIS_FAILURE_MESSAGE
          finishReason = 'error'
        }
        if (abortSignal?.aborted) {
          controller.close()
          return
        }
        if (!started) controller.enqueue({ type: 'start' })
        if (stepOpen) controller.enqueue({ type: 'finish-step' })
        const id = crypto.randomUUID()
        controller.enqueue({ type: 'start-step' })
        controller.enqueue({ type: 'text-start', id })
        controller.enqueue({ type: 'text-delta', id, delta: text })
        controller.enqueue({ type: 'text-end', id })
        controller.enqueue({ type: 'finish-step' })
        finish = { ...finish, type: 'finish', finishReason }
      }
      controller.enqueue(finish ?? { type: 'finish', finishReason: 'stop' })
      controller.close()
    },
  })
}
