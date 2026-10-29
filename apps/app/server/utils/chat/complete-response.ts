import type { UIMessageChunk } from 'ai'

export const SYNTHESIS_FAILURE_MESSAGE = 'The search finished, but the model service could not complete the synthesis. The retrieved results are retained above. Please retry this question to generate the answer.'

/** Hold the finish event until an answer follows the last research tool result. */
export function completeResponseStream({ stream, recover, onError, abortSignal }: {
  stream: ReadableStream<UIMessageChunk>
  recover: () => Promise<string>
  onError: (error: unknown) => void
  abortSignal?: AbortSignal
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
          if (value.type === 'abort') aborted = true
          if (value.type.startsWith('tool-')) answer = ''
          if (value.type === 'text-delta') answer += value.delta
          controller.enqueue(value)
        }
      } catch (error) {
        failed = true
        onError(error)
      } finally {
        reader.releaseLock()
      }

      if (aborted || abortSignal?.aborted) {
        controller.close()
        return
      }

      if (!answer.trim() || failed) {
        let text: string
        try {
          text = await recover()
          if (!text.trim()) throw new Error('Synthesis returned no answer text')
        } catch (error) {
          if (abortSignal?.aborted) {
            controller.close()
            return
          }
          onError(error)
          text = SYNTHESIS_FAILURE_MESSAGE
        }
        if (!started) controller.enqueue({ type: 'start' })
        if (stepOpen) controller.enqueue({ type: 'finish-step' })
        const id = crypto.randomUUID()
        controller.enqueue({ type: 'start-step' })
        controller.enqueue({ type: 'text-start', id })
        controller.enqueue({ type: 'text-delta', id, delta: text })
        controller.enqueue({ type: 'text-end', id })
        controller.enqueue({ type: 'finish-step' })
        finish = { ...finish, type: 'finish', finishReason: text === SYNTHESIS_FAILURE_MESSAGE ? 'error' : 'stop' }
      }
      controller.enqueue(finish ?? { type: 'finish', finishReason: 'stop' })
      controller.close()
    },
  })
}
