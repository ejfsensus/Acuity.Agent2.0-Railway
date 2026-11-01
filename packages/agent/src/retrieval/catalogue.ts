import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { parse } from 'yaml'
import { normalize, terms, traditionMatches } from './plan'

export interface LibraryBook {
  id: string
  workId: string
  editionId: string
  title: string
  tradition: string
  edition: string
  translator: string
  language: string
  kind: string
  rights: string
  source_url: string
  path: string
  description: string
  descriptionOrigin: 'metadata' | 'derived-opening'
  readable: boolean
  format: string
  aliases?: string[]
  origin: 'local' | 'remote'
  book?: string
  remotePath?: string
}
interface IndexedBook extends LibraryBook { frequencies: Record<string, number>, length: number }
interface Catalogue { version: number, revision: string, books: IndexedBook[] }
export interface Passage extends LibraryBook {
  text: string
  id: string
  bookId: string
  lineStart?: number
  lineEnd?: number
  chunk_index?: number
  contextVerified: boolean
}
export interface LocalLibrary {
  discover: (request: { query: string, traditions: string[], works: string[], phrase: string, screened?: ScreenedWork[] }, signal?: AbortSignal) => Promise<Array<LibraryBook & { rank: number }>>
  search: (book: LibraryBook, query: string, phrase: string, signal?: AbortSignal) => Promise<Passage[]>
}
export interface ScreenedWork { title: string, remotePath: string, sourceUrl: string, phrase?: string }

/** A discovery hint identifies a catalogue entry; it never substitutes for reading that local edition. */
export function screenedWorkMatches(book: LibraryBook, lead: ScreenedWork): boolean {
  const remote = lead.remotePath.replace(/\.gz$/i, '').replace(/^\/+/, '')
  const local = book.path.replace(/^docs\/sacred-texts\/source1_ista\//, '').replace(/\.gz$/i, '')
  if (remote && local === remote) return true
  if (lead.sourceUrl && book.source_url && lead.sourceUrl.replace(/\/$/, '') === book.source_url.replace(/\/$/, '')) return true
  const title = normalize(lead.title)
  return title.length > 4 && [book.title, ...(book.aliases ?? [])].some(value => normalize(value) === title)
}
const VERSION = 1
const FORMATS = new Set(['.md', '.txt', '.html', '.htm', '.usx', '.pdf', '.epub', '.docx'])
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 24)
const scalar = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : ''

async function safePath(root: string, path: string): Promise<string> {
  const base = await realpath(root)
  const target = await realpath(resolve(base, path))
  if (!target.startsWith(`${base}${sep}`)) throw new Error('Library path is outside the corpus')
  return target
}
function eligible(path: string): boolean {
  return FORMATS.has(extname(path).toLowerCase()) && !path.split('/').some(segment => segment.startsWith('.'))
    && !/(^|\/)(readme|manifest|attribution|rights_notice|download_list|download_links|license)(\.|$)/i.test(path)
    && (!path.startsWith('source2_openbible/') || path.includes('American-Standard-Version-Bible/usx/'))
}
async function walk(root: string, dir = ''): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const path = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (path.startsWith('source2_openbible/') && !path.includes('American-Standard-Version-Bible')) continue
      out.push(...await walk(root, path))
    } else if (entry.isFile() && eligible(path)) out.push(path)
  }
  return out.sort()
}
async function indexBook(root: string, path: string): Promise<IndexedBook> {
  const file = await safePath(root, path)
  const readable = ['.md', '.txt', '.html', '.htm', '.usx'].includes(extname(path).toLowerCase())
  let head = ''
  const frequencies: Record<string, number> = Object.create(null)
  let length = 0
  if (readable) {
    const handle = await open(file, 'r')
    try {
      const buffer = Buffer.alloc(32_768)
      const { bytesRead } = await handle.read(buffer)
      head = clean(buffer.subarray(0, bytesRead).toString('utf8'))
    } finally {
      await handle.close()
    }
    const stream = createReadStream(file, { encoding: 'utf8' })
    const lines = createInterface({ input: stream, crlfDelay: Infinity })
    try {
      for await (const line of lines) {
        for (const term of terms(line.replace(/<[^>]*>/g, ' '))) {
          frequencies[term] = (frequencies[term] ?? 0) + 1
          length++
        }
      }
    } finally {
      lines.close()
      stream.destroy()
    }
  }
  let meta: Record<string, unknown> = {}
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head)
  if (front) {
    try {
      meta = parse(front[1]!, { maxAliasCount: 0 }) ?? {}
    } catch { /* Preserve original header when metadata cannot be parsed. */ }
  }
  const provenance = meta.provenance as Record<string, unknown> | undefined
  const rights = meta.rights as Record<string, unknown> | undefined
  const title = scalar(meta.title) || head.split('\n').find(line => /^#\s+/.test(line))?.replace(/^#\s+/, '')
    || head.split('\n').slice(0, 12).find(line => line.trim().length > 5 && !/^(https?:|at sacred|\[)/i.test(line.trim()))?.trim().slice(0, 180)
    || path.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')
  const body = front ? head.slice(front[0].length) : head
  const description = scalar(meta.description) || body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 900)
  const tradition = scalar(meta.tradition) || (path.startsWith('source1_ista/') ? path.split('/')[1] : path.split('/')[1]) || 'unspecified'
  const sourceUrl = scalar(provenance?.source_url) || (path.startsWith('source1_ista/') ? `https://sacred-texts.com/${path.slice(13)}` : '')
  const edition = scalar(provenance?.edition) || head.split('\n').slice(0, 16).join(' ').slice(0, 600)
  const translator = scalar(provenance?.translator)
  const id = `local:${hash(path)}`
  return {
    id, editionId: id, workId: `work:${hash(normalize(title))}`, origin: 'local', path: `docs/sacred-texts/${path}`, title,
    tradition, source_url: sourceUrl, edition, translator, language: scalar(meta.text_language) || 'unspecified',
    kind: scalar(meta.source_type) || 'unclassified; inspect the text', rights: scalar(rights?.status) || 'See collection ATTRIBUTION.txt',
    aliases: Array.isArray(meta.alternate_titles) ? meta.alternate_titles.map(scalar).filter(Boolean) : [],
    description, descriptionOrigin: scalar(meta.description) ? 'metadata' : 'derived-opening', readable, format: extname(path).slice(1),
    frequencies, length,
  }
}

export async function buildLocalCatalogue(root: string, cacheFile: string): Promise<Catalogue> {
  const revision = (await readFile(join(root, 'LIBRARY_STAMP'), 'utf8').catch(() => 'unversioned')).trim()
  const cached = await readFile(cacheFile, 'utf8').then(text => JSON.parse(text) as Catalogue).catch(() => undefined)
  if (cached?.version === VERSION && cached.revision === revision && revision !== 'unversioned') return cached
  const books: IndexedBook[] = []
  for (const path of await walk(root)) books.push(await indexBook(root, path))
  const catalogue = { version: VERSION, revision, books }
  await mkdir(dirname(cacheFile), { recursive: true })
  const temp = `${cacheFile}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(catalogue), { mode: 0o600 })
  await rename(temp, cacheFile)
  return catalogue
}

function bm25(books: IndexedBook[], query: string): Map<string, number> {
  const tokens = [...new Set(terms(query))]
  const average = books.reduce((sum, book) => sum + book.length, 0) / Math.max(1, books.length)
  const scores = new Map<string, number>()
  for (const token of tokens) {
    const df = books.filter(book => book.frequencies[token]).length
    const idf = Math.log(1 + (books.length - df + 0.5) / (df + 0.5))
    for (const book of books) {
      const tf = book.frequencies[token] ?? 0
      const score = idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * book.length / Math.max(1, average)))
      const titleBonus = normalize(`${book.title} ${book.description} ${book.translator}`).includes(token) ? 2 : 0
      scores.set(book.id, (scores.get(book.id) ?? 0) + score + titleBonus)
    }
  }
  return scores
}

export function createLocalLibrary(root: string, cacheFile: string): LocalLibrary {
  async function search(book: LibraryBook, query: string, phrase: string, signal?: AbortSignal): Promise<Passage[]> {
    if (!book.readable || book.origin !== 'local' || !book.path.startsWith('docs/sacred-texts/')) return []
    const file = await safePath(root, book.path.slice('docs/sacred-texts/'.length))
    if ((await stat(file)).size > 64_000_000) throw new Error('Text exceeds the supported per-file size')
    const stream = createReadStream(file, { encoding: 'utf8', signal })
    const lines = createInterface({ input: stream, crlfDelay: Infinity })
    const needles = [...new Set(terms(query))]
    const windows: Array<{ lines: string[], start: number, score: number }> = []
    const previous: string[] = []
    let number = 0
    let inFrontMatter = false
    let pending: { lines: string[], start: number, score: number } | undefined
    try {
      for await (const raw of lines) {
        signal?.throwIfAborted()
        number++
        const line = clean(raw)
        if (number === 1 && line.trim() === '---') {
          inFrontMatter = true
          continue
        }
        if (inFrontMatter) {
          if (line.trim() === '---') inFrontMatter = false
          continue
        }
        if (pending) {
          pending.lines.push(line)
          if (number >= pending.start + 6) {
            windows.push(pending)
            pending = undefined
          }
        }
        const lower = normalize(line)
        const score = !query && !phrase ? (line.trim() ? 1 : 0) : phrase ? (line.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()) ? 100 : 0)
          : needles.reduce((sum, needle) => sum + (lower.split(' ').includes(needle) ? 1 : 0), 0)
        if (score && !pending) pending = { lines: [...previous, line], start: Math.max(1, number - previous.length), score }
        previous.push(line)
        if (previous.length > 3) previous.shift()
        if (windows.length > 80) windows.sort((a, b) => b.score - a.score).splice(30)
      }
      if (pending) windows.push(pending)
    } finally {
      lines.close()
      stream.destroy()
    }
    return windows.filter(window => !query || phrase || needles.filter(needle => normalize(window.lines.join(' ')).split(' ').includes(needle)).length >= Math.min(2, needles.length)).sort((a, b) => b.score - a.score || a.start - b.start).slice(0, 2).map(window => {
      const full = window.lines.join('\n')
      const at = phrase ? full.toLowerCase().indexOf(phrase.toLowerCase()) : Math.max(0, ...needles.map(term => full.toLowerCase().indexOf(term)).filter(index => index >= 0).slice(0, 1))
      const offset = full.length > 4000 ? Math.max(0, at - 800) : 0
      return {
        ...book, bookId: book.id, id: `${book.path}:L${window.start}-${window.start + window.lines.length - 1}`,
        lineStart: window.start, lineEnd: window.start + window.lines.length - 1,
        text: full.slice(offset, offset + 4000), contextVerified: true,
      }
    })
  }
  return {
    search,
    discover: async ({ query, traditions, works, phrase, screened = [] }, signal) => {
      const catalogue = await buildLocalCatalogue(root, cacheFile)
      const scoped = catalogue.books.filter(book => (!traditions.length || traditions.some(t => traditionMatches(book.tradition, t)))
        && (!works.length || works.some(work => normalize(`${book.title} ${(book.aliases ?? []).join(' ')}`).includes(normalize(work)) || normalize(book.path).includes(normalize(work)))))
      const scores = bm25(scoped, query)
      let ranked = scoped.map(book => {
        const screen = screened.findIndex(lead => screenedWorkMatches(book, lead))
        return { ...book, rank: (scores.get(book.id) ?? 0) + (screen >= 0 ? 10_000 / (screen + 1) : 0) }
      }).sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id))
      if (phrase) {
        const matches: typeof ranked = []
        const screenedBooks = ranked.filter(book => screened.some(lead => screenedWorkMatches(book, lead)))
        const screenedIds = new Set(screenedBooks.map(book => book.id))
        const pools = screenedBooks.length ? [screenedBooks, ranked.filter(book => !screenedIds.has(book.id))] : [ranked]
        for (const pool of pools) {
          for (const book of pool) {
            signal?.throwIfAborted()
            if ((await search(book, query, phrase, signal)).length) matches.push({ ...book, rank: book.rank + 100 })
            if (matches.length >= 12) break
          }
          if (matches.length) break
        }
        ranked = matches
      }
      return ranked.filter(book => book.rank > 0 || works.length).slice(0, 18).map(({ frequencies: _frequencies, length: _length, ...book }) => book)
    },
  }
}
