import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AGENT_SOURCES_SCHEMA, buildSourcesChunk, labelCitedSources, parseAttribution, publicUrlFor, sourcesFromBash, sourcesFromSacredText, sourcesFromToolResults } from './collect-sources'

const ATTR = `Collections
-----------

source1_ista/
  Internet Sacred Text Archive (sacred-texts.com).
  Downloaded from https://sacred-texts.com/download.htm

source3_getbible/berean_bible/
  Berean Standard Bible. The text file is bsb.txt.
  The Berean Bible and Majority Bible texts were dedicated to the public domain
`

test('parseAttribution reads collection blocks', () => {
  const a = parseAttribution(ATTR)
  assert.equal(a.length, 2)
  assert.equal(a[0]!.collection, 'source1_ista')
  assert.equal(a[0]!.url, 'https://sacred-texts.com/download.htm')
  assert.equal(a[1]!.collection, 'source3_getbible/berean_bible')
  assert.match(a[1]!.licence!, /public domain/)
})

test('sourcesFromSacredText extracts nested hits', () => {
  const text = JSON.stringify({ groups: [{ tradition: 'Gnostic', results: [{ id: 'p1', title: 'Gospel of Thomas', tradition: 'Gnostic', book: 'thomas', chunk_index: 3, source_url: 'https://x/thomas', text: 'Saying 77' }] }] })
  const s = sourcesFromSacredText({ status: 'done', success: true, text })
  assert.equal(s.length, 1)
  assert.equal(s[0]!.passageId, 'p1')
  assert.equal(s[0]!.bookCode, 'thomas')
  assert.equal(s[0]!.chunkIndex, 3)
  assert.equal(s[0]!.origin, 'sacred-text-index')
  assert.deepEqual(sourcesFromSacredText({ status: 'done', success: false, text }), [])
  assert.deepEqual(sourcesFromSacredText({ status: 'done', success: true, text: 'not json' }), [])
})

test('sourcesFromBash groups grep lines per file and reads sed ranges', () => {
  const attributions = parseAttribution(ATTR)
  const out = sourcesFromBash({ commands: [
    { command: 'grep -rn light docs/sacred-texts', exitCode: 0, stdout: 'docs/sacred-texts/source1_ista/chr/thomas.txt:10:the light\ndocs/sacred-texts/source1_ista/chr/thomas.txt:14:light again\n' },
    { command: 'sed -n \'20,30p\' docs/sacred-texts/source3_getbible/berean_bible/bsb.txt', exitCode: 0, stdout: 'In the beginning' },
    { command: 'cat docs/sacred-texts/a.txt', exitCode: 1, stdout: 'x' },
  ] }, attributions)
  assert.equal(out.length, 2)
  assert.equal(out[0]!.lineStart, 10)
  assert.equal(out[0]!.lineEnd, 14)
  assert.equal(out[0]!.sourceUrl, 'https://sacred-texts.com/chr/thomas.txt')
  assert.equal(out[0]!.category, 'source1_ista')
  assert.equal(out[1]!.lineStart, 20)
  assert.match(out[1]!.licence!, /public domain/)
})

test('labels cited sources in order of first mention, dedupes, strips control chars', () => {
  const sources = sourcesFromToolResults([
    { toolName: 'bash', output: { commands: [{ command: 'cat docs/sacred-texts/source1_ista/a/first.txt', stdout: 'one\u0007' }] } },
    { toolName: 'bash', output: { commands: [{ command: 'cat docs/sacred-texts/source1_ista/b/second.txt', stdout: 'two' }] } },
    { toolName: 'bash', output: { commands: [{ command: 'cat docs/sacred-texts/source1_ista/b/second.txt', stdout: 'two' }] } },
    { toolName: 'other', output: {} },
  ])
  assert.equal(sources.length, 2)
  assert.equal(sources[0]!.text, 'one')
  const labelled = labelCitedSources(sources, 'See source1_ista/b/second.txt and then docs/sacred-texts/source1_ista/a/first.txt.')
  assert.equal(labelled[1]!.label, 'S1')
  assert.equal(labelled[0]!.label, 'S2')
  assert.ok(labelled.every(s => s.cited))
  const none = labelCitedSources(sources, 'No citations.')
  assert.ok(none.every(s => !s.cited && !s.label))
})

test('buildSourcesChunk uses the v1 schema', () => {
  const chunk = buildSourcesChunk([])
  assert.equal(chunk.type, 'data-sources')
  assert.equal(chunk.data.schema, AGENT_SOURCES_SCHEMA)
  assert.equal(publicUrlFor('docs/sacred-texts/source2_openbible/x'), undefined)
})

test('housekeeping files are not sources', () => {
  const out = sourcesFromToolResults([{ toolName: 'bash', output: { commands: [{ command: 'cat docs/sacred-texts/ATTRIBUTION.txt', stdout: 'x' }] } }])
  assert.equal(out.length, 0)
})

test('staged research contributes only verified passages, retaining local edition and line locators', () => {
  const report = { candidates: [{ title: 'Discovery metadata must not become evidence' }], evidence: [
    { id: 'docs/sacred-texts/atlas.md:L10-16', origin: 'local', title: 'STAGING TEST Atlas', path: 'docs/sacred-texts/atlas.md', tradition: 'Hinduism', edition: '1901', translator: 'Fixture', rights: 'public_domain', lineStart: 10, lineEnd: 16, text: 'Divine light in the soul.', contextVerified: true },
    { id: 'unverified', title: 'Probe snippet', text: 'Not read in context.', contextVerified: false },
  ] }
  const sources = sourcesFromToolResults([{ toolName: 'library_research', output: { status: 'done', success: true, text: JSON.stringify(report) } }])
  assert.equal(sources.length, 1)
  assert.equal(sources[0]?.origin, 'local-corpus')
  assert.equal(sources[0]?.translator, 'Fixture')
  assert.equal(sources[0]?.lineStart, 10)
})
