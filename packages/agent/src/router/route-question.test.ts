import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MockLanguageModelV3 } from 'ai/test'
import { enterAIContext } from '../core/observe'
import { fallbackPlan } from '../retrieval/plan'
import { routeQuestion, routingConversation } from './route-question'

const messages = [
  { id: '1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'What do Sufi texts say about the divine light?' }] },
  { id: '2', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'An answer with edition details.' }] },
  { id: '3', role: 'user' as const, parts: [{ type: 'text' as const, text: 'And in the Upanishads?' }] },
]
test('routing receives bounded conversation context and returns a constrained research plan', async () => {
  const plan = { ...fallbackPlan('divine light in the Upanishads'), intent: 'named_work' as const, works: ['Upanishads'] }
  const model = new MockLanguageModelV3({ doGenerate: options => {
    assert.ok(options.prompt.some(m => m.role === 'user' && JSON.stringify(m.content).includes('Sufi texts')))
    return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ complexity: 'moderate', model: 'fixture', maxSteps: 120, reasoning: 'STAGING TEST follow-up', plan }) }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] })
  } })
  enterAIContext(() => model)
  try {
    const result = await routeQuestion(messages, 'STAGING TEST')
    assert.equal(result.plan?.question, plan.question)
    assert.deepEqual(result.plan?.works, ['Upanishads'])
    assert.equal(result.maxSteps, 6)
    assert.equal(JSON.parse(routingConversation(messages)).length, 3)
  } finally {
    enterAIContext(id => id)
  }
})
