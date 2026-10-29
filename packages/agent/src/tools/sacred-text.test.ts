import { strict as assert } from 'node:assert'
import { afterEach, beforeEach, test } from 'node:test'
import { z } from 'zod'
import { sacredTextInputSchema, sacredTextMcpTool } from './sacred-text'
import { researchTools } from './research'

const originalFetch = globalThis.fetch
const originalKey = process.env.SACRED_TEXT_API_KEY
const originalUrl = process.env.SACRED_TEXT_API_URL
const hit = { id: 'eso/pym/pym.txt.gz#00005', title: 'The Divine Pymander', tradition: 'Esoteric', book: 'pym', chunk_index: 5, score: 0.47, source_url: 'https://example.org/pym.txt.gz', text: 'The divine light within the soul.', citation: 'The Divine Pymander, (Esoteric), passage 5. [source](https://example.org/pym.txt.gz)' }

beforeEach(() => {
  process.env.SACRED_TEXT_API_KEY = 'fixture-private-key'
  process.env.SACRED_TEXT_API_URL = 'https://sacred.example.org'
})
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.SACRED_TEXT_API_KEY
  else process.env.SACRED_TEXT_API_KEY = originalKey
  if (originalUrl === undefined) delete process.env.SACRED_TEXT_API_URL
  else process.env.SACRED_TEXT_API_URL = originalUrl
})

async function run(input: z.input<typeof sacredTextInputSchema>, abortSignal?: AbortSignal) {
  const updates: Array<{ status: string, success?: boolean, text?: string, error?: string, sources?: Array<{ title: string, url: string }> }> = []
  const result = sacredTextMcpTool.execute!(input, { toolCallId: 'fixture', messages: [], abortSignal })
  for await (const update of result as AsyncIterable<(typeof updates)[number]>) updates.push(update)
  assert.equal(updates[0]?.status, 'loading')
  assert.equal(updates.at(-1)?.status, 'done')
  return updates.at(-1)!
}

test('semantic retrieval preserves filters, citation metadata and weak scores without exposing the bearer', async () => {
  globalThis.fetch = (url, options) => {
    assert.equal(String(url), 'https://sacred.example.org/v1/search')
    assert.equal(options?.method, 'POST')
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer fixture-private-key')
    assert.equal(options?.redirect, 'error')
    assert.deepEqual(JSON.parse(String(options?.body)), { query: 'the light within the soul', tradition: ['Islam', 'Mysticism'], book: ['pym'], k: 8, contains: 'Light', exclude_book: 'th1', max_chars: 1500 })
    return Promise.resolve(Response.json({ count: 1, results: [{ ...hit, score: 0.25 }] }))
  }
  const result = await run({ action: 'search_texts', query: 'the light within the soul', tradition: ['Islam', 'Mysticism'], book: ['pym'], contains: 'Light', exclude_book: 'th1' })
  assert.equal(result.success, true)
  assert.equal(JSON.parse(result.text!).results[0].citation, hit.citation)
  assert.equal(JSON.parse(result.text!).results[0].score, 0.25)
  assert.deepEqual(result.sources, [{ title: hit.title, url: hit.source_url }])
  assert.ok(!JSON.stringify(result).includes('fixture-private-key'))
})

test('keyword searches retain exact case and return pagination with an empty match set', async () => {
  globalThis.fetch = (_url, options) => {
    assert.deepEqual(JSON.parse(String(options?.body)), { phrase: 'AIN SOPH', tradition: 'Judaism', k: 20, offset: 20 })
    return Promise.resolve(Response.json({ phrase: 'AIN SOPH', count: 0, has_more: false, results: [] }))
  }
  const result = await run({ action: 'keyword_search', phrase: 'AIN SOPH', tradition: 'Judaism', offset: 20 })
  assert.equal(result.success, true)
  assert.deepEqual(JSON.parse(result.text!), { phrase: 'AIN SOPH', count: 0, has_more: false, results: [] })
})

test('comparison keeps balanced groups and parallels send one source reference', async () => {
  const seen: string[] = []
  globalThis.fetch = (url, options) => {
    seen.push(new URL(String(url)).pathname)
    const body = JSON.parse(String(options?.body))
    if (seen.length === 1) {
      assert.deepEqual(body, { query: 'union with God', traditions: ['Islam', 'Christianity'], k_per_tradition: 2 })
      return Promise.resolve(Response.json({ traditions: [{ tradition: 'Islam', results: [hit] }, { tradition: 'Christianity', results: [] }] }))
    }
    assert.deepEqual(body, { id: hit.id, traditions: ['Christianity'], k: 6, exclude_same_tradition: true })
    return Promise.resolve(Response.json({ source: hit, results: [] }))
  }
  const comparison = await run({ action: 'compare_traditions', query: 'union with God', traditions: ['Islam', 'Christianity'], k_per_tradition: 2 })
  assert.equal(JSON.parse(comparison.text!).traditions.length, 2)
  assert.equal(comparison.sources?.length, 1)
  assert.equal((await run({ action: 'find_parallels', id: hit.id, traditions: ['Christianity'], k: 6 })).success, true)
  assert.deepEqual(seen, ['/v1/compare', '/v1/parallels'])
})

test('passage IDs preserve their encoded fragment and reading retains next_start', async () => {
  const seen: string[] = []
  globalThis.fetch = (url, options) => {
    seen.push(String(url))
    assert.equal(options?.method, 'GET')
    assert.equal(options?.body, undefined)
    return Promise.resolve(Response.json({ ...hit, next_start: 10, next_id: 'eso/pym/pym.txt.gz#00006', context: [{ id: hit.id, text: hit.text }] }))
  }
  assert.equal((await run({ action: 'get_passage', id: hit.id, neighbors: 2 })).success, true)
  const page = await run({ action: 'read_book', book: 'eso/pym/pym.txt.gz', start: 5, count: 5 })
  assert.equal(JSON.parse(page.text!).next_start, 10)
  assert.deepEqual(seen, ['https://sacred.example.org/v1/passages/eso/pym/pym.txt.gz%2300005?neighbors=2', 'https://sacred.example.org/v1/books/eso/pym/pym.txt.gz/read?start=5&count=5'])
})

test('catalog and status use their fixed read-only endpoints, including comma-separated tradition filters', async () => {
  const seen: string[] = []
  globalThis.fetch = url => {
    seen.push(String(url))
    return Promise.resolve(Response.json({ count: 0, books: [] }))
  }
  const inputs: z.input<typeof sacredTextInputSchema>[] = [
    { action: 'book_info', book: 'Divine Pymander' },
    { action: 'list_traditions' },
    { action: 'list_books', tradition: ['Judaism', 'Esoteric'], query: 'Hermes', status: '' },
    { action: 'index_status' },
  ]
  for (const input of inputs) assert.equal((await run(input)).success, true)
  assert.deepEqual(seen, ['https://sacred.example.org/v1/books/Divine%20Pymander/info', 'https://sacred.example.org/v1/traditions', 'https://sacred.example.org/v1/books?tradition=Judaism%2CEsoteric&query=Hermes&status=', 'https://sacred.example.org/v1/status'])
})

test('invalid operations and incomplete inputs are rejected without network requests', async () => {
  globalThis.fetch = () => {
    throw new Error('Unexpected network request') 
  }
  assert.equal(sacredTextInputSchema.safeParse({ action: 'start_ingest' }).success, false)
  assert.equal(sacredTextInputSchema.safeParse({ action: 'ask', query: 'Generate an answer' }).success, false)
  for (const input of [
    { action: 'search_texts' },
    { action: 'keyword_search', phrase: ' ' },
    { action: 'compare_traditions', query: 'wisdom', traditions: ['Islam', 'islam'] },
    { action: 'find_parallels', id: hit.id, text: 'outside text' },
    { action: 'find_parallels', text: 'outside text', k: 26 },
    { action: 'read_book', book: ['pym', 'th1'] },
    { action: 'get_passage', id: '../status' },
  ] as z.input<typeof sacredTextInputSchema>[]) assert.equal((await run(input)).success, false)
})

test('missing credentials and insecure service URLs fail without leaking secrets', async () => {
  globalThis.fetch = () => {
    throw new Error('Unexpected network request') 
  }
  delete process.env.SACRED_TEXT_API_KEY
  assert.match((await run({ action: 'list_traditions' })).error!, /SACRED_TEXT_API_KEY is not set/)
  process.env.SACRED_TEXT_API_KEY = 'fixture-private-key'
  process.env.SACRED_TEXT_API_URL = 'http://external.example.org'
  assert.match((await run({ action: 'list_traditions' })).error!, /HTTPS service origin/)
})

test('auth, unknown traditions, throttling and provider failures remain explicit and preserve grep fallback', async () => {
  for (const [status, detail, expected] of [
    [401, 'Unauthorized', /SACRED_TEXT_API_KEY/],
    [400, 'unknown tradition; use Islam', /unknown tradition/],
    [429, 'quota reached', /wait 30 seconds/],
    [503, 'fixture-private-key', /503/],
  ] as const) {
    globalThis.fetch = () => Promise.resolve(Response.json({ detail }, { status, headers: { 'retry-after': '30' } }))
    const result = await run({ action: 'search_texts', query: 'wisdom' })
    assert.equal(result.success, false)
    assert.match(result.error!, expected)
    assert.ok(!JSON.stringify(result).includes('fixture-private-key'))
  }
})

test('request cancellation, oversized responses and network failures produce completed error updates', async () => {
  const controller = new AbortController()
  controller.abort()
  globalThis.fetch = (_url, options) => {
    options?.signal?.throwIfAborted()
    throw new Error('Unexpected fetch')
  }
  assert.equal((await run({ action: 'list_traditions' }, controller.signal)).success, false)
  globalThis.fetch = () => Promise.resolve(new Response('x'.repeat(1_000_001)))
  assert.match((await run({ action: 'list_traditions' })).error!, /too large/)
  globalThis.fetch = () => {
    throw new Error('fetch failed fixture-private-key') 
  }
  assert.ok(!(await run({ action: 'list_traditions' })).error!.includes('fixture-private-key'))
  assert.equal(researchTools['sacred-text-mcp'], sacredTextMcpTool)
})
