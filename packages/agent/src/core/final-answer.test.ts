import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MockLanguageModelV3 } from 'ai/test'
import { tool } from 'ai'
import { z } from 'zod'
import { enterAIContext } from './observe'
import { generateFinalAnswer } from './final-answer'

test('recovery uses the selected model, original question and retrieved evidence with tools disabled', async () => {
  const selected: string[] = []
  const model = new MockLanguageModelV3({ doGenerate: options => {
    assert.equal(options.toolChoice?.type, 'none')
    assert.equal(options.maxOutputTokens, 8192)
    assert.ok(options.tools?.some(tool => tool.type === 'function' && tool.name === 'lookup'))
    assert.match(JSON.stringify(options.prompt), /What is wisdom/)
    assert.match(JSON.stringify(options.prompt), /wisdom follows practice/)
    assert.match(JSON.stringify(options.prompt), /research phase is complete/)
    return Promise.resolve({ content: [{ type: 'text', text: 'Wisdom follows practice. [fixture.md]' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 4, noCache: 4, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 6, text: 6, reasoning: 0 } }, warnings: [] })
  } })
  enterAIContext(id => {
    selected.push(id)
    return model
  })
  try {
    const result = await generateFinalAnswer({
      model: 'selected-model', system: 'Answer from the corpus.',
      tools: { lookup: tool({ inputSchema: z.object({}) }) },
      messages: [
        { role: 'user', content: 'What is wisdom?' },
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'lookup', toolName: 'lookup', input: {} }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'lookup', toolName: 'lookup', output: { type: 'text', value: 'Fixture: wisdom follows practice.' } }] },
      ],
    })
    assert.deepEqual(selected, ['selected-model'])
    assert.equal(result.text, 'Wisdom follows practice. [fixture.md]')
  } finally {
    enterAIContext(id => id)
  }
})
