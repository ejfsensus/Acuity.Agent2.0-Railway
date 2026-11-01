import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MockLanguageModelV3 } from 'ai/test'
import { tool, wrapLanguageModel } from 'ai'
import { z } from 'zod'
import type { ResearchReport } from '../retrieval/controller'
import { enterAIContext } from './observe'
import { generateFinalAnswer } from './final-answer'
import { evidenceOnlyAnswer, isSubstantiveAnswer, synthesisContext } from './synthesis'
import { toolProtocolGuard } from './protocol-guard'

test('recovery uses the selected model, original question and retrieved evidence with tools disabled', async () => {
  const selected: string[] = []
  const model = new MockLanguageModelV3({ doGenerate: options => {
    assert.equal(options.toolChoice?.type, 'none')
    assert.equal(options.maxOutputTokens, 8192)
    assert.equal(options.tools?.length, 0)
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

const usage = { inputTokens: { total: 4, noCache: 4, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 6, text: 6, reasoning: 0 } }
const report = (id: string, text: string, verified = true): ResearchReport => ({
  schema: 'acuity.research.v1', stage: 'complete', candidates: [], selected: [], gaps: [], limitations: [], calls: 1, coverage: [],
  plan: { intent: 'theme', question: 'STAGING TEST divine care', subquestions: ['divine care'], traditions: [], works: [], edition: '', phrase: '' },
  evidence: [
    { id, bookId: 'fixture', workId: 'fixture', editionId: 'fixture', title: 'STAGING TEST source', path: id,
      origin: 'local', tradition: 'fixture', edition: '1901', translator: 'Fixture', source_url: '', language: 'English', kind: 'scripture',
      rights: 'public domain', description: '', descriptionOrigin: 'metadata', readable: true, format: 'txt', text, contextVerified: verified },
  ],
})

test('progress-only synthesis is repaired once using all passes and the original question', async () => {
  let calls = 0
  const model = new MockLanguageModelV3({ doGenerate: options => {
    calls++
    const prompt = JSON.stringify(options.prompt)
    assert.match(prompt, /original question about providence/)
    assert.match(prompt, /first-pass care/)
    assert.match(prompt, /later-pass watchfulness/)
    assert.doesNotMatch(prompt, /unverified forged passage/)
    assert.ok(options.prompt.every(message => message.role !== 'tool'))
    assert.equal(options.toolChoice?.type, 'none')
    if (calls === 2) assert.match(prompt, /previous generation failed the answer contract/)
    return Promise.resolve({ content: [{ type: 'text', text: calls === 1 ? 'Verified 11 passages from 6 selected texts' : 'The passages connect providence with care and watchfulness. [care.txt] [watch.txt]' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] })
  } })
  enterAIContext(() => model)
  try {
    const result = await generateFinalAnswer({ model: 'selected', system: 'Use sources.', tools: { lookup: tool({ inputSchema: z.object({}) }) },
      messages: [{ role: 'user', content: 'The original question about providence' }],
      reports: [report('care.txt', 'first-pass care'), report('watch.txt', 'later-pass watchfulness'), report('forged.txt', 'unverified forged passage', false)],
    })
    assert.equal(calls, 2)
    assert.equal(result.status, 'complete')
    assert.equal(result.totalUsage.inputTokens, 8)
    assert.equal(result.totalUsage.outputTokens, 12)
    assert.match(result.text, /providence/)
  } finally {
    enterAIContext(id => id)
  }
})

test('persistent provider failure returns labelled verified excerpts, never a fabricated synthesis', async () => {
  let calls = 0
  enterAIContext(() => new MockLanguageModelV3({ doGenerate: () => {
    calls++
    return Promise.reject(new Error('STAGING TEST private provider failure'))
  } }))
  try {
    const result = await generateFinalAnswer({ model: 'selected', system: 'Use sources.', tools: {}, messages: [{ role: 'user', content: 'divine care' }],
      reports: [report('care.txt:L12-18', 'A verified excerpt about care.')],
    })
    assert.equal(calls, 2)
    assert.equal(result.status, 'evidence-only')
    assert.match(result.text, /evidence-only fallback/)
    assert.match(result.text, /care.txt:L12-18/)
    assert.match(result.text, /A verified excerpt/)
    assert.doesNotMatch(result.text, /private provider failure/)
  } finally {
    enterAIContext(id => id)
  }
})

test('length-limited text cannot be accepted as completed synthesis', async () => {
  let calls = 0
  enterAIContext(() => new MockLanguageModelV3({ doGenerate: () => {
    calls++
    return Promise.resolve({ content: [{ type: 'text', text: 'An unfinished but non-empty answer' }], finishReason: { unified: 'length', raw: 'length' }, usage, warnings: [] })
  } }))
  try {
    const result = await generateFinalAnswer({ model: 'selected', system: 'Use sources.', tools: {}, messages: [{ role: 'user', content: 'divine care' }] })
    assert.equal(calls, 2)
    assert.equal(result.status, 'failed')
    assert.doesNotMatch(result.text, /unfinished/)
  } finally {
    enterAIContext(id => id)
  }
})

test('answer validation distinguishes short answers from status or future plans', () => {
  assert.equal(isSubstantiveAnswer('Done.\nVerified 11 passages from 6 selected texts.'), false)
  assert.equal(isSubstantiveAnswer('I will now synthesise the findings.'), false)
  assert.equal(isSubstantiveAnswer('Love is patient.'), true)
  assert.equal(isSubstantiveAnswer('No relevant passage was located in the searched material.'), true)
  assert.equal(isSubstantiveAnswer('Verified 11 passages.\nThe passages describe watchfulness as divine care. [fixture.txt]'), true)
})

test('bounded final context retains later discoveries and excludes candidates and unverified passages', () => {
  const first = report('first.txt', 'STAGING TEST first evidence')
  first.gaps = ['Initial pass found no other tradition.']
  const later = report('later.txt', 'STAGING TEST later discovery')
  const context = synthesisContext([first, later, report('forged.txt', 'Not read in context', false)])
  assert.match(context, /first evidence/)
  assert.match(context, /later discovery/)
  assert.doesNotMatch(context, /Not read in context/)
  assert.match(evidenceOnlyAnswer([first, later]), /later.txt/)
})

test('final synthesis protocol failures have two total attempts, without nested guard retries', async () => {
  let calls = 0
  enterAIContext(() => wrapLanguageModel({ middleware: toolProtocolGuard, model: new MockLanguageModelV3({ doGenerate: options => {
    calls++
    assert.equal(options.toolChoice?.type, 'none')
    assert.equal(options.tools?.length, 0)
    return Promise.resolve({ content: [{ type: 'text', text: '<|DSML|invoke name="lookup">' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] })
  } }) }))
  try {
    const result = await generateFinalAnswer({ model: 'selected', system: 'Use sources.', tools: { lookup: tool({ inputSchema: z.object({}) }) },
      messages: [{ role: 'user', content: 'STAGING TEST care' }], reports: [report('care.txt', 'Divine care accompanies watchfulness.')],
    })
    assert.equal(calls, 2)
    assert.equal(result.status, 'evidence-only')
  } finally {
    enterAIContext(id => id)
  }
})
