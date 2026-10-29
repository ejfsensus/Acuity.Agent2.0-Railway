import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai'
import { completeResponseStream, SYNTHESIS_FAILURE_MESSAGE } from './complete-response'

const source = (chunks: UIMessageChunk[]) => new ReadableStream<UIMessageChunk>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(chunk)
  controller.close()
} })
const unexpected = (error: unknown): never => {
  throw error 
}
const toolChunks: UIMessageChunk[] = [
  { type: 'start' },
  { type: 'start-step' },
  { type: 'text-start', id: 'preamble' },
  { type: 'text-delta', id: 'preamble', delta: 'I will search the corpus.' },
  { type: 'text-end', id: 'preamble' },
  { type: 'tool-input-available', toolCallId: 'search', toolName: 'lookup', input: {} },
  { type: 'tool-output-available', toolCallId: 'search', output: 'Fixture: wisdom follows practice.' },
  { type: 'finish-step' },
  { type: 'finish', finishReason: 'tool-calls' },
]

async function collect(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = []
  const reader = stream.getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return chunks
}

test('a preamble followed by tools gets a final answer in the persisted assistant message', async () => {
  let saved: UIMessage[] = []
  let recoveries = 0
  const stream = createUIMessageStream({
    execute: ({ writer }) => writer.merge(completeResponseStream({
      stream: source(toolChunks),
      recover: () => {
        recoveries++
        return Promise.resolve('Wisdom follows practice. [fixture.md]') 
      },
      onError: unexpected,
    })),
    onFinish: ({ messages }) => {
      saved = messages 
    },
  })
  const chunks = await collect(stream)
  assert.equal(recoveries, 1)
  assert.equal(chunks.filter(chunk => chunk.type === 'finish').length, 1)
  assert.equal(chunks.at(-1)?.type, 'finish')
  assert.equal(saved.length, 1)
  assert.ok(saved[0]?.parts.some(part => part.type === 'text' && part.text.includes('Wisdom follows practice.')))
  assert.ok(saved[0]?.parts.some(part => part.type === 'dynamic-tool' || part.type === 'tool-lookup'))
})

test('a completed synthesis passes through unchanged without another model call', async () => {
  const chunks: UIMessageChunk[] = [
    ...toolChunks.slice(0, -1),
    { type: 'start-step' },
    { type: 'text-start', id: 'answer' },
    { type: 'text-delta', id: 'answer', delta: 'A supported synthesis.' },
    { type: 'text-end', id: 'answer' },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop' },
  ]
  assert.deepEqual(await collect(completeResponseStream({
    stream: source(chunks), recover: () => {
      throw new Error('Unnecessary recovery') 
    }, onError: unexpected,
  })), chunks)
})

test('provider failure during research is recovered before the chat finishes', async () => {
  const errors: unknown[] = []
  const chunks = await collect(completeResponseStream({
    stream: source([...toolChunks.slice(0, -1), { type: 'error', errorText: 'Provider unavailable' }]),
    recover: () => Promise.resolve('A recovered synthesis from retrieved passages.'),
    onError: error => errors.push(error),
  }))
  assert.equal(errors.length, 1)
  assert.ok(chunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('recovered synthesis')))
  assert.ok(!chunks.some(chunk => chunk.type === 'error'))
})

test('persistent model failure produces an explicit visible message rather than an empty answer', async () => {
  const chunks = await collect(completeResponseStream({
    stream: source(toolChunks), recover: () => Promise.reject(new Error('Provider offline')), onError: () => {},
  }))
  assert.ok(chunks.some(chunk => chunk.type === 'text-delta' && chunk.delta === SYNTHESIS_FAILURE_MESSAGE))
  assert.deepEqual(chunks.at(-1), { type: 'finish', finishReason: 'error' })
})

test('a cancelled request does not start a synthesis recovery', async () => {
  const controller = new AbortController()
  controller.abort()
  let recoveries = 0
  await collect(completeResponseStream({
    stream: source(toolChunks), abortSignal: controller.signal,
    recover: () => {
      recoveries++
      return Promise.resolve('Unexpected') 
    }, onError: unexpected,
  }))
  assert.equal(recoveries, 0)
})
