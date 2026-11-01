import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createUIMessageStream, tool, type UIMessage } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'
import { createAgent, enterAIContext, fallbackPlan, generateFinalAnswer, researchToolResult, type ResearchReport } from '@savoir/agent'
import { completeResponseStream } from './complete-response'
import { buildSourcesChunk, labelCitedSources, sourcesFromToolResults, type ToolResultLike } from './collect-sources'

async function verifyFlow(progressOnly: boolean) {
  const reports: ResearchReport[] = []
  const results: ToolResultLike[] = []
  const question = 'STAGING TEST What do the texts say about divine care?'
  const path = 'docs/sacred-texts/staging-test/care.txt'
  const passage = { id: `${path}:L10-16`, bookId: 'local:care', editionId: 'local:care', workId: 'work:care',
    path, title: 'STAGING TEST Care', origin: 'local' as const, tradition: 'Christianity', edition: '1901', translator: 'Fixture',
    language: 'English', kind: 'scripture', rights: 'public domain', source_url: '', format: 'txt', readable: true,
    description: '', descriptionOrigin: 'metadata' as const, text: 'Divine care accompanies watchfulness.', contextVerified: true }
  let discoveries = 0
  let streamed = 0
  let finalCalls = 0
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }
  const model = new MockLanguageModelV3({
    doStream: () => {
      streamed++
      const refine = streamed === 1
      return Promise.resolve({ stream: new ReadableStream({ start(controller) {
        if (refine) {
          controller.enqueue({ type: 'tool-call', toolCallId: 'refine', toolName: 'refine_library', input: JSON.stringify({ gap: 'Need a passage about divine care', query: 'divine care' }) })
        } else {
          controller.enqueue({ type: 'text-start', id: 'progress' })
          controller.enqueue({ type: 'text-delta', id: 'progress', delta: progressOnly ? 'Verified 11 passages from 6 selected texts' : `The retrieved text connects divine care with watchfulness. [${passage.id}]` })
          controller.enqueue({ type: 'text-end', id: 'progress' })
        }
        controller.enqueue({ type: 'finish', finishReason: { unified: refine ? 'tool-calls' : 'stop', raw: refine ? 'tool_calls' : 'stop' }, usage })
        controller.close()
      } }) })
    },
    doGenerate: options => {
      finalCalls++
      assert.equal(options.toolChoice?.type, 'none')
      const prompt = JSON.stringify(options.prompt)
      assert.match(prompt, /What do the texts say about divine care/)
      assert.match(prompt, /Divine care accompanies watchfulness/)
      assert.doesNotMatch(prompt, /Verified 11 passages/)
      return Promise.resolve({ content: [{ type: 'text', text: `The retrieved text connects divine care with watchfulness. [${passage.id}]` }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] })
    },
  })
  enterAIContext(() => model)
  let saved: UIMessage[] = []
  try {
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const agent = createAgent({ tools: {},
          getAgentConfig: () => Promise.resolve({ id: 'fixture', name: 'fixture', additionalPrompt: null, responseStyle: 'concise', language: 'en', defaultModel: 'selected', maxStepsMultiplier: 1, temperature: 0.2, searchInstructions: null, citationFormat: 'inline', isActive: true }),
          route: () => Promise.resolve({ complexity: 'moderate', model: 'selected', maxSteps: 2, reasoning: 'STAGING TEST', plan: fallbackPlan(question) }),
          buildPrompt: () => 'Answer from the retrieved passages.',
          research: { remote: () => Promise.reject(new Error('STAGING TEST REST unavailable')),
            local: { discover: () => Promise.resolve(++discoveries === 1 ? [] : [{ ...passage, id: passage.bookId, rank: 1 }]), search: () => Promise.resolve([passage]) },
            onReport: report => {
              reports.push(report)
              results.push({ toolName: 'library_research', output: researchToolResult(report) })
            },
            onProgress: event => writer.write({ type: 'data-research', id: 'research', data: event }),
          },
        })
        const result = await agent.stream({ prompt: question, options: {} })
        let answer = ''
        writer.merge(completeResponseStream({ stream: result.toUIMessageStream(), finalAnswerOnly: true,
          onError: error => {
            throw error
          },
          recover: async () => {
            const final = await generateFinalAnswer({ model: 'selected', system: 'Use verified sources.', tools: { lookup: tool({ inputSchema: z.object({}) }) },
              reports, messages: [{ role: 'user', content: question }],
            })
            assert.equal(final.status, 'complete')
            return final.text
          },
        }).pipeThrough(new TransformStream({ transform(chunk, controller) {
          if (chunk.type === 'text-delta') answer += chunk.delta
          if (chunk.type === 'finish') controller.enqueue(buildSourcesChunk(labelCitedSources(sourcesFromToolResults(results), answer)))
          controller.enqueue(chunk)
        } })))
      },
      onFinish: ({ messages }) => {
        saved = messages
      },
    })
    const reader = stream.getReader()
    try {
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    } finally {
      reader.releaseLock()
    }
    assert.equal(reports[0]?.evidence.length, 0)
    assert.equal(reports[1]?.evidence.length, 1)
    assert.equal(finalCalls, progressOnly ? 1 : 0)
    assert.equal(saved.filter(message => message.role === 'assistant').length, 1)
    const text = saved.flatMap(message => message.parts.filter(part => part.type === 'text').map(part => part.text)).join('')
    assert.match(text, /connects divine care with watchfulness/)
    assert.doesNotMatch(text, /Verified 11 passages/)
    assert.equal((text.match(/connects divine care/g) ?? []).length, 1)
    const sources = saved[0]?.parts.find(part => part.type === 'data-sources') as { data: { sources: Array<{ cited: boolean, label: string }> } } | undefined
    assert.equal(sources?.data.sources[0]?.cited, true)
    assert.equal(sources?.data.sources[0]?.label, 'S1')
  } finally {
    enterAIContext(id => id)
  }
}

test('retrieval miss → successful refinement → recovery of missing synthesis → cited, persisted final answer', () => verifyFlow(true))
test('retrieval miss → local refinement → one valid synthesis without another answer generation', () => verifyFlow(false))
