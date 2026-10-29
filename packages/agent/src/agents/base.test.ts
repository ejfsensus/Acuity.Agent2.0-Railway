import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MockLanguageModelV3 } from 'ai/test'
import { tool } from 'ai'
import { z } from 'zod'
import { enterAIContext } from '../core/observe'
import { createAgent } from './base'

test('a bounded research loop keeps tool definitions and requests a final answer', async () => {
  let calls = 0
  const selected: string[] = []
  const model = new MockLanguageModelV3({
    doGenerate: (options) => {
      calls++
      const final = options.toolChoice?.type === 'none'
      if (final) {
        assert.ok(options.tools?.some(tool => tool.type === 'function' && tool.name === 'lookup'))
        assert.ok(options.prompt.some(message => message.role === 'system' && message.content.includes('research phase is complete')))
      }
      return Promise.resolve({
        content: final ? [{ type: 'text', text: 'Wisdom guides practice; practice produces transformation. [fixture.txt]' }] : [{ type: 'tool-call', toolCallId: `call-${calls}`, toolName: 'lookup', input: '{}' }],
        finishReason: { unified: final ? 'stop' : 'tool-calls', raw: final ? 'stop' : 'tool_calls' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        warnings: [],
      })
    },
  })
  enterAIContext((id) => {
    selected.push(id)
    return model
  })
  try {
    const agent = createAgent({
      tools: { lookup: tool({ inputSchema: z.object({}), execute: () => 'Synthetic fixture: wisdom guides action, repeated action changes habits.' }) },
      getAgentConfig: () => Promise.resolve({ id: 'fixture', name: 'fixture', additionalPrompt: null, responseStyle: 'concise', language: 'en', defaultModel: 'configured-model', maxStepsMultiplier: 1, temperature: 0.7, searchInstructions: null, citationFormat: 'inline', isActive: true }),
      route: () => Promise.resolve({ complexity: 'simple', model: 'routed-model', maxSteps: 4, reasoning: 'fixture' }),
      buildPrompt: () => 'Use the fixture to answer the question.',
    })
    const result = await agent.generate({ messages: [{ role: 'user', content: 'Explain wisdom, practice and transformation using the synthetic fixture.' }], options: { model: 'selected-model' } })
    assert.equal(calls, 5)
    assert.match(result.text, /Wisdom guides practice/)
    assert.equal(selected.at(-1), 'selected-model')
  } finally {
    enterAIContext(id => id)
  }
})
