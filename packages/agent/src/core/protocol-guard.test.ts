import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { tool, wrapLanguageModel } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { z } from 'zod'
import { createAgent } from '../agents/base'
import { enterAIContext } from './observe'
import { hasToolProtocol, INVALID_RESPONSE_MESSAGE, toolProtocolGuard } from './protocol-guard'

const malformed = 'Let me search again. <｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="lookup">{}</｜｜DSML｜｜invoke></｜｜DSML｜｜tool_calls>'
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }
const finish = (tools = false): LanguageModelV3StreamPart => ({ type: 'finish', usage, finishReason: { unified: tools ? 'tool-calls' : 'stop', raw: tools ? 'tool_calls' : 'stop' } })
const stream = (chunks: LanguageModelV3StreamPart[]) => new ReadableStream<LanguageModelV3StreamPart>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(chunk)
  controller.close() 
} })

test('nine successful research steps followed by split DSML are retried before reaching the chat', async () => {
  let calls = 0
  let executions = 0
  const model = wrapLanguageModel({
    middleware: toolProtocolGuard,
    model: new MockLanguageModelV3({
      doStream: (options) => {
        calls++
        if (calls <= 9) {
          assert.notEqual(options.toolChoice?.type, 'none')
          const id = `lookup-${calls}`
          return Promise.resolve({ stream: stream([
            { type: 'tool-input-start', id, toolName: 'lookup' },
            { type: 'tool-input-delta', id, delta: '{}' },
            { type: 'tool-input-end', id },
            { type: 'tool-call', toolCallId: id, toolName: 'lookup', input: '{}' },
            finish(true),
          ]) })
        }
        assert.equal(options.toolChoice?.type, 'none')
        const text = calls === 10 ? malformed : 'Practice supports inner peace. [fixture.txt]'
        return Promise.resolve({ stream: stream([
          { type: 'text-start', id: 'answer' },
          { type: 'text-delta', id: 'answer', delta: text.slice(0, 25) },
          { type: 'text-delta', id: 'answer', delta: text.slice(25, 34) },
          { type: 'text-delta', id: 'answer', delta: text.slice(34) },
          { type: 'text-end', id: 'answer' },
          finish(),
        ]) })
      },
    }),
  })
  enterAIContext(() => model)
  try {
    const agent = createAgent({
      tools: { lookup: tool({ inputSchema: z.object({}), execute: () => {
        executions++
        return 'Synthetic fixture: repeated calm attention supports inner peace.' 
      } }) },
      getAgentConfig: () => Promise.resolve({ id: 'fixture', name: 'fixture', additionalPrompt: null, responseStyle: 'concise', language: 'en', defaultModel: 'fixture', maxStepsMultiplier: 1, temperature: 0.7, searchInstructions: null, citationFormat: 'inline', isActive: true }),
      route: () => Promise.resolve({ complexity: 'moderate', model: 'fixture', maxSteps: 15, reasoning: 'fixture' }),
      buildPrompt: () => 'Answer from the synthetic fixture.',
    })
    const result = await agent.stream({ options: {}, messages: [{ role: 'user', content: 'Explain inner peace from the fixture.' }] })
    const visible: string[] = []
    for await (const part of result.fullStream) if (part.type === 'text-delta') visible.push(part.text)
    assert.equal(visible.join(''), 'Practice supports inner peace. [fixture.txt]')
    assert.equal(executions, 9)
    assert.equal(calls, 11)
    assert.equal((await result.steps).length, 10)
    assert.equal((await result.totalUsage).inputTokens, 11)
  } finally {
    enterAIContext(id => id)
  }
})

test('persistent invalid output fails after bounded retries without executing text as a tool', async () => {
  let calls = 0
  const model = wrapLanguageModel({ middleware: toolProtocolGuard, model: new MockLanguageModelV3({ doGenerate: (options) => {
    calls++
    if (calls === 3) assert.equal(options.toolChoice?.type, 'none')
    return Promise.resolve({ content: [{ type: 'text', text: malformed }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] })
  } }) })
  await assert.rejects(Promise.resolve(model.doGenerate({ prompt: [{ role: 'system', content: 'Fixture' }] })), { message: INVALID_RESPONSE_MESSAGE })
  assert.equal(calls, 3)
})

test('a tool call returned despite tool_choice none is rejected', async () => {
  const model = wrapLanguageModel({
    middleware: toolProtocolGuard,
    model: new MockLanguageModelV3({
      doStream: () => Promise.resolve({ stream: stream([
        { type: 'tool-call', toolCallId: 'unexpected', toolName: 'lookup', input: '{}' },
        finish(true),
      ]) }),
    }),
  })
  await assert.rejects(Promise.resolve(model.doStream({ prompt: [], toolChoice: { type: 'none' } })), { message: INVALID_RESPONSE_MESSAGE })
})

test('old malformed assistant text is removed from model history while user text is preserved', async () => {
  const model = wrapLanguageModel({ middleware: toolProtocolGuard, model: new MockLanguageModelV3({ doGenerate: (options) => {
    assert.deepEqual(options.prompt[0], { role: 'user', content: [{ type: 'text', text: malformed }] })
    assert.deepEqual(options.prompt[1], { role: 'assistant', content: [{ type: 'text', text: INVALID_RESPONSE_MESSAGE }] })
    return Promise.resolve({ content: [{ type: 'text', text: 'Clean answer.' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] })
  } }) })
  await model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: malformed }] }, { role: 'assistant', content: [{ type: 'text', text: malformed }] }] })
  assert.equal(hasToolProtocol('Ordinary discussion of peace.'), false)
  assert.equal(hasToolProtocol('<｜DSML｜tool_calls>'), true)
  assert.equal(hasToolProtocol('<|DSML|invoke name="lookup">'), true)
})
