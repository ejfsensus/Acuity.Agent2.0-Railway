import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildLocalCatalogue, createLocalLibrary } from './catalogue'

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
