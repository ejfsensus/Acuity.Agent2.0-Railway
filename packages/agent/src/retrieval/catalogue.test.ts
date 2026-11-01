import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildLocalCatalogue, createLocalLibrary } from './catalogue'
import { LibraryResearch } from './controller'
import { fallbackPlan } from './plan'

async function fixture(run: (root: string, cache: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'acuity-research-'))
  const root = join(dir, 'library')
  await mkdir(join(root, 'source6_ancient_wisdom_atlas/hinduism'), { recursive: true })
  const text = (translator: string) => `---\ntitle: STAGING TEST Dawn\ntradition: Hinduism\ntext_language: English\nprovenance:\n  translator: ${translator}\n  edition: 1901\nrights:\n  status: public_domain\n---\n\nA quiet opening.\nThe divine light awakens the soul.\nThe seeker returns to the source.\nA gentle ending.\n`
  await writeFile(join(root, 'LIBRARY_STAMP'), 'STAGING TEST rev1')
  await writeFile(join(root, 'source6_ancient_wisdom_atlas/hinduism/a.md'), text('Alpha'))
  await writeFile(join(root, 'source6_ancient_wisdom_atlas/hinduism/b.md'), text('Beta'))
  await mkdir(join(root, 'source2_openbible/Bible-Passage-Reference-Parser'), { recursive: true })
  await writeFile(join(root, 'source2_openbible/Bible-Passage-Reference-Parser/test.txt'), 'divine light parser fixture')
  await writeFile(join(root, 'source6_ancient_wisdom_atlas/hinduism/scan.pdf'), 'STAGING TEST fake binary')
  await symlink('/etc/passwd', join(root, 'source6_ancient_wisdom_atlas/hinduism/escape.txt'))
  try {
    await run(root, join(dir, 'catalogue.json'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('versioned content catalogue excludes parser data, distinguishes editions and flags scans', async () => {
  await fixture(async (root, cache) => {
    const catalogue = await buildLocalCatalogue(root, cache)
    assert.equal(catalogue.books.length, 3)
    const editions = catalogue.books.filter(book => book.format === 'md')
    assert.equal(editions[0]!.workId, editions[1]!.workId)
    assert.notEqual(editions[0]!.editionId, editions[1]!.editionId)
    assert.equal(editions[0]!.translator, 'Alpha')
    assert.ok(catalogue.books.some(book => book.format === 'pdf' && !book.readable))
    const library = createLocalLibrary(root, cache)
    const found = await library.discover({ query: 'divine light', traditions: ['Hinduism'], works: [], phrase: '' })
    assert.equal(found.length, 2)
    assert.ok(!('frequencies' in found[0]!))
    const passages = await library.search(found[0]!, 'divine light', '')
    assert.equal(passages.length, 1)
    assert.match(passages[0]!.text, /divine light/)
    assert.ok(passages[0]!.lineStart! > 10)
    const wrongEdition = await library.search(found[0]!, 'Beta', 'Beta')
    assert.equal(wrongEdition.length, 0, 'front matter is not passage evidence')
    await assert.rejects(library.search({ ...found[0]!, path: 'docs/sacred-texts/../../etc/passwd' }, 'root', ''), /ENOENT|outside/)
  })
})

test('known quotation discovery treats regex and shell syntax as literal text', async () => {
  await fixture(async (root, cache) => {
    const library = createLocalLibrary(root, cache)
    assert.equal((await library.discover({ query: 'divine light', traditions: [], works: [], phrase: 'DIVINE LIGHT' })).length, 2)
    assert.equal((await library.discover({ query: 'divine light', traditions: [], works: [], phrase: '.*$(touch /tmp/acuity-pwned)' })).length, 0)
  })
})

test('external screening maps a work before local literal search and context verification', async () => {
  await fixture(async (root, cache) => {
    await mkdir(join(root, 'source1_ista/chr'), { recursive: true })
    await writeFile(join(root, 'source1_ista/chr/watch.txt'), '# STAGING TEST Watchfulness\n\nWatchfulness governs both dawn and evening.\nThe seeker listens.\n')
    const calls: string[] = []
    const engine = new LibraryResearch({ local: createLocalLibrary(root, cache), remote: input => {
      calls.push(input.action)
      if (input.action === 'list_books') return Promise.resolve({ books: [{ book: 'watch', path: 'chr/watch.txt.gz', title: 'STAGING TEST Watchfulness', tradition: 'Christianity', status: 'done' }] })
      if (input.action === 'search_texts') return Promise.resolve({ results: [{ book: 'watch', id: 'chr/watch.txt.gz#00001', text: 'Watchfulness governs both dawn and evening.' }] })
      throw new Error('The external service is only allowed to screen candidates')
    } })
    const report = await engine.initial(fallbackPlan('providence'))
    assert.deepEqual(calls, ['list_books', 'search_texts'])
    assert.equal(report.selected.length, 1)
    assert.equal(report.evidence.length, 1)
    assert.equal(report.evidence[0]?.origin, 'local')
    assert.match(report.evidence[0]!.id, /source1_ista\/chr\/watch.txt:L\d+-\d+$/)
    assert.match(report.evidence[0]!.text, /Watchfulness governs/)
    assert.match(report.selected[0]!.reason, /External content screening/)
  })
})

test('literal discovery greps screened local works first and widens only after a miss', async () => {
  await fixture(async (root, cache) => {
    await mkdir(join(root, 'source1_ista/chr'), { recursive: true })
    await writeFile(join(root, 'source1_ista/chr/care.txt'), '# Candidate Care\n\nThe divine light awakens the soul.\n')
    await writeFile(join(root, 'source1_ista/chr/miss.txt'), '# Candidate Miss\n\nThe traveller rests.\n')
    const library = createLocalLibrary(root, cache)
    const request = { query: 'divine light', traditions: [], works: [], phrase: 'divine light' }
    const missing = await library.discover({ ...request, screened: [{ title: 'Candidate Miss', remotePath: 'chr/miss.txt.gz', sourceUrl: '' }] })
    assert.equal(missing.length, 3, 'a screening miss retains local discovery')
    await rm(join(root, 'source6_ancient_wisdom_atlas/hinduism/b.md'))
    const found = await library.discover({ ...request, screened: [{ title: 'Candidate Care', remotePath: 'chr/care.txt.gz', sourceUrl: '' }] })
    assert.equal(found.length, 1, 'a verified screened match avoids reading unrelated files')
    assert.match(found[0]!.path, /chr\/care.txt$/)
  })
})
