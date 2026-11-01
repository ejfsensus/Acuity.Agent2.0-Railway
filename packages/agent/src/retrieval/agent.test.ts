import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MockLanguageModelV3 } from 'ai/test'
import { tool } from 'ai'
import { z } from 'zod'
import { createAgent } from '../agents/base'
import { enterAIContext } from '../core/observe'
import { fallbackPlan } from './plan'

const config = { id: 'fixture', name: 'fixture', additionalPrompt: null, responseStyle: 'concise' as const, language: 'en', defaultModel: null, maxStepsMultiplier: 1, temperature: 0, searchInstructions: null, citationFormat: 'inline' as const, isActive: true }

test('automatic research runs before generation and raw shell/legacy REST tools are unavailable', async () => {
  let discovered = false
  let reported = false
  const model = new MockLanguageModelV3({ doGenerate: options => {
    assert.ok(discovered && reported)
    const names = options.tools?.map(t => t.type === 'function' ? t.name : '') ?? []
    assert.deepEqual(names, ['refine_library'])
    assert.ok(options.prompt.some(m => m.role === 'system' && m.content.includes('No context-verified passages')))
    return Promise.resolve({ content: [{ type: 'text', text: 'The requested passage could not be established from the available sources.' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] })
  } })
  enterAIContext(() => model)
  try {
    const agent = createAgent({
      tools: { bash: tool({ inputSchema: z.object({}), execute: () => 'Forbidden raw shell' }) },
      getAgentConfig: () => Promise.resolve(config),
      route: () => Promise.resolve({ complexity: 'moderate', maxSteps: 100, model: 'fixture', reasoning: 'STAGING TEST', plan: fallbackPlan('divine light') }),
      buildPrompt: () => 'Answer from sources.',
      research: { local: { discover: async () => {
        await Promise.resolve()
        discovered = true
        return []
      }, search: () => Promise.resolve([]) }, remote: () => Promise.resolve({}), onReport: () => {
        reported = true
      } },
    })
    const result = await agent.generate({ prompt: 'divine light', options: {} })
    assert.match(result.text, /could not be established/)
  } finally {
    enterAIContext(id => id)
  }
})

test('research progress and citations survive the actual UI message stream', async () => {
  const { createUIMessageStream, readUIMessageStream } = await import('ai')
  const model = new MockLanguageModelV3({ doStream: () => Promise.resolve({
    stream: new ReadableStream({ start(controller) {
      controller.enqueue({ type: 'text-start', id: 'answer' })
      controller.enqueue({ type: 'text-delta', id: 'answer', delta: 'No verified supporting passage was found.' })
      controller.enqueue({ type: 'text-end', id: 'answer' })
      controller.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } })
      controller.close()
    } }),
  }) })
  enterAIContext(() => model)
  try {
    const stream = createUIMessageStream({ execute: async ({ writer }) => {
      const agent = createAgent({ tools: {}, getAgentConfig: () => Promise.resolve(config),
        route: () => Promise.resolve({ complexity: 'simple', maxSteps: 4, model: 'fixture', reasoning: 'STAGING TEST', plan: fallbackPlan('divine light') }),
        buildPrompt: () => 'Answer from evidence.',
        research: { local: { discover: () => Promise.resolve([]), search: () => Promise.resolve([]) }, remote: () => Promise.resolve({}),
          onProgress: event => writer.write({ type: 'data-research', id: 'research-progress', data: event }),
        },
      })
      const result = await agent.stream({ prompt: 'divine light', options: {} })
      writer.merge(result.toUIMessageStream())
    } })
    let final: any
    for await (const message of readUIMessageStream({ stream })) final = message
    assert.ok(final.parts.some((p: any) => p.type === 'data-research' && p.data.stage === 'complete'))
    assert.ok(final.parts.some((p: any) => p.type === 'text' && p.text.includes('No verified')))
  } finally {
    enterAIContext(id => id)
  }
})
