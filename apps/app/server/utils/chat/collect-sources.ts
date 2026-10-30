/**
 * Structured sources for external callers (acuity.agent-sources.v1).
 *
 * Normalises what the agent actually read — sacred-text index hits and local
 * corpus reads (grep/cat/sed in docs/sacred-texts) — into one list, marks the
 * ones the final answer refers to, and labels those S1, S2… in the order they
 * are first mentioned. The chunk is persisted with the assistant message so
 * GET /api/chats/:id returns it too.
 */

export const AGENT_SOURCES_SCHEMA = 'acuity.agent-sources.v1'
const MAX_TEXT = 4000
const MAX_SOURCES = 60
const CORPUS_PREFIX = 'docs/sacred-texts/'

export interface AgentSource {
  ref: string
  origin: 'sacred-text-index' | 'local-corpus'
  title: string
  tradition?: string
  bookCode?: string
  path?: string
  passageId?: string
  chunkIndex?: number
  lineStart?: number
  lineEnd?: number
  sourceUrl?: string
  edition?: string
  translator?: string
  licence?: string
  text: string
  cited: boolean
  label?: string
  /** Legacy SourceChips fields (shared chat page). */
  category: string
  file?: string
}

export interface CollectionAttribution {
  /** Collection directory, e.g. "source1_ista". */
  collection: string
  description: string
  url?: string
  licence?: string
}

 
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
export function cleanText(value: unknown, max = MAX_TEXT): string {
  return (typeof value === 'string' ? value : '').replace(CONTROL, '').slice(0, max)
}

/** Parses ATTRIBUTION.txt blocks ("dir/" followed by indented description lines). */
export function parseAttribution(text: string): CollectionAttribution[] {
  const out: CollectionAttribution[] = []
  let current: CollectionAttribution | null = null
  for (const line of text.split(/\r?\n/)) {
    const head = /^([\w.-]+(?:\/[\w.-]+)*)\/\s*$/.exec(line)
    if (head) {
      current = { collection: head[1]!, description: '' }
      out.push(current)
      continue
    }
    if (current && /^\s{2,}\S/.test(line)) {
      const body = line.trim()
      current.description = current.description ? `${current.description} ${body}` : body
      if (!current.url) current.url = /https?:\/\/\S+/.exec(body)?.[0]?.replace(/[).,]+$/, '')
      if (/public domain|CC0|rights notice/i.test(body) && !current.licence) current.licence = body
      continue
    }
    if (line.trim() === '' || /^[-=]+$/.test(line.trim())) continue
    current = null
  }
  return out
}

function attributionFor(path: string, attributions: CollectionAttribution[]): CollectionAttribution | undefined {
  const rel = path.startsWith(CORPUS_PREFIX) ? path.slice(CORPUS_PREFIX.length) : path
  return attributions
    .filter(a => rel === a.collection || rel.startsWith(`${a.collection}/`))
    .sort((a, b) => b.collection.length - a.collection.length)[0]
}

/** Public page for a corpus file when one is known (sacred-texts.com mirror). */
export function publicUrlFor(path: string): string | undefined {
  const rel = path.startsWith(CORPUS_PREFIX) ? path.slice(CORPUS_PREFIX.length) : path
  const ista = /^source1_ista\/(.+)$/.exec(rel)
  if (ista) return `https://sacred-texts.com/${ista[1]}`
  return undefined
}

function titleFromPath(path: string): string {
  const file = path.split('/').pop() || path
  return file.replace(/\.(txt|md|html?|usx|ya?ml|json)$/i, '').replace(/[_-]+/g, ' ').trim() || path
}

/** Library housekeeping files (attribution, readme, manifests) are not sources. */
export function isHousekeepingFile(path: string): boolean {
  return /(^|\/)(ATTRIBUTION|README|MANIFEST|LIBRARY_STAMP|download_links|download_list)(\.[a-z]+)?$/i.test(path)
}

function corpusSource(path: string, text: string, attributions: CollectionAttribution[], lines?: [number, number]): AgentSource {
  const attribution = attributionFor(path, attributions)
  const ref = lines ? `corpus:${path}:L${lines[0]}-${lines[1]}` : `corpus:${path}`
  const sourceUrl = publicUrlFor(path)
  return {
    ref,
    origin: 'local-corpus',
    title: titleFromPath(path),
    path,
    ...(lines && { lineStart: lines[0], lineEnd: lines[1] }),
    ...(sourceUrl && { sourceUrl }),
    ...(attribution?.description && { edition: attribution.description.slice(0, 300) }),
    ...(attribution?.licence && { licence: attribution.licence.slice(0, 300) }),
    text: cleanText(text),
    cited: false,
    category: attribution?.collection ?? 'sacred-texts',
    file: path,
  }
}

type Hit = Record<string, unknown>
function isHit(value: unknown): value is Hit {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Hit
  return typeof v.text === 'string' && (typeof v.id === 'string' || typeof v.source_url === 'string') && (typeof v.book === 'string' || typeof v.title === 'string')
}

/** Sacred-text index results (sacred-text-mcp /v1 JSON, as returned by the tool's `text`). */
export function sourcesFromSacredText(output: unknown): AgentSource[] {
  const o = output as { status?: string, success?: boolean, text?: unknown } | null
  if (!o || o.status !== 'done' || o.success !== true || typeof o.text !== 'string') return []
  let data: unknown
  try {
    data = JSON.parse(o.text)
  } catch {
    return []
  }
  const hits: Hit[] = []
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || !value || typeof value !== 'object') return
    if (isHit(value)) hits.push(value)
    for (const item of Array.isArray(value) ? value : Object.values(value)) visit(item, depth + 1)
  }
  visit(data, 0)
  return hits.map((hit) => {
    const passageId = typeof hit.id === 'string' ? hit.id : undefined
    const chunkIndex = typeof hit.chunk_index === 'number' ? hit.chunk_index : undefined
    const title = cleanText(hit.title || hit.book, 300) || 'Sacred text passage'
    const tradition = typeof hit.tradition === 'string' ? hit.tradition : undefined
    return {
      ref: passageId ?? `${hit.book ?? title}#${chunkIndex ?? 0}`,
      origin: 'sacred-text-index' as const,
      title,
      ...(tradition && { tradition }),
      ...(typeof hit.book === 'string' && { bookCode: hit.book }),
      ...(passageId && { passageId }),
      ...(chunkIndex !== undefined && { chunkIndex }),
      ...(typeof hit.source_url === 'string' && { sourceUrl: hit.source_url }),
      text: cleanText(hit.text),
      cited: false,
      category: tradition ?? 'sacred-texts',
      file: typeof hit.book === 'string' ? hit.book : undefined,
    }
  })
}

const GREP_LINE = /^(?:\.\/)?((?:docs\/sacred-texts\/)[^:\n]+):(\d+)[:-](.*)$/
const PATH_IN_COMMAND = /(?:^|\s|['"])((?:\.\/)?docs\/sacred-texts\/[^\s'"|;&><]+)/g
const SED_RANGE = /sed\s+-n\s+['"]?(\d+)\s*,\s*(\d+)\s*p/

/** Local corpus reads from the bash tools: `grep -n` lines, and `cat`/`sed -n a,bp` of one file. */
export function sourcesFromBash(output: unknown, attributions: CollectionAttribution[] = []): AgentSource[] {
  const commands = (output as { commands?: unknown })?.commands
  if (!Array.isArray(commands)) return []
  const out: AgentSource[] = []
  for (const entry of commands) {
    const c = entry as { command?: unknown, stdout?: unknown, exitCode?: unknown }
    const command = typeof c.command === 'string' ? c.command : ''
    const stdout = typeof c.stdout === 'string' ? c.stdout : ''
    if (!stdout || (typeof c.exitCode === 'number' && c.exitCode !== 0)) continue

    const grouped = new Map<string, { lines: number[], text: string[] }>()
    for (const line of stdout.split('\n')) {
      const m = GREP_LINE.exec(line)
      if (!m) continue
      const path = m[1]!.replace(/^\.\//, '')
      const g = grouped.get(path) ?? { lines: [], text: [] }
      g.lines.push(Number(m[2]))
      g.text.push(m[3]!)
      grouped.set(path, g)
    }
    if (grouped.size) {
      for (const [path, g] of grouped) out.push(corpusSource(path, g.text.join('\n'), attributions, [Math.min(...g.lines), Math.max(...g.lines)]))
      continue
    }

    // A read of one file (cat / sed -n / head / tail): the stdout is the passage.
    if (!/^\s*(cat|sed|head|tail|awk)\b/.test(command)) continue
    const paths = [...command.matchAll(PATH_IN_COMMAND)].map(m => m[1]!.replace(/^\.\//, ''))
    if (paths.length !== 1) continue
    const range = SED_RANGE.exec(command)
    out.push(corpusSource(paths[0]!, stdout, attributions, range ? [Number(range[1]), Number(range[2])] : undefined))
  }
  return out
}

export interface ToolResultLike { toolName: string, output: unknown }

export function sourcesFromToolResults(results: ToolResultLike[], attributions: CollectionAttribution[] = []): AgentSource[] {
  const byRef = new Map<string, AgentSource>()
  for (const result of results) {
    const found = result.toolName === 'sacred-text-mcp'
      ? sourcesFromSacredText(result.output)
      : (result.toolName === 'bash' || result.toolName === 'bash_batch')
        ? sourcesFromBash(result.output, attributions)
        : []
    for (const source of found) {
      if (!source.text.trim() || (source.path && isHousekeepingFile(source.path))) continue
      if (!byRef.has(source.ref)) byRef.set(source.ref, source)
      if (byRef.size >= MAX_SOURCES) break
    }
  }
  return [...byRef.values()]
}

/** Where the answer first refers to a source (-1 when it does not). */
function firstMention(answer: string, source: AgentSource): number {
  const lower = answer.toLowerCase()
  const needles = [
    source.path,
    source.path?.replace(CORPUS_PREFIX, ''),
    source.passageId,
    source.sourceUrl,
    source.title.length >= 6 ? source.title : undefined,
  ].filter((n): n is string => Boolean(n && n.length >= 4))
  let best = -1
  for (const needle of needles) {
    const at = lower.indexOf(needle.toLowerCase())
    if (at >= 0 && (best < 0 || at < best)) best = at
  }
  return best
}

/** Marks cited sources and labels them S1… in order of first mention in the answer. */
export function labelCitedSources(sources: AgentSource[], answer: string): AgentSource[] {
  const mentions = sources.map((source, index) => ({ index, at: firstMention(answer, source) }))
  const cited = mentions.filter(m => m.at >= 0).sort((a, b) => a.at - b.at || a.index - b.index)
  const labels = new Map(cited.map((m, i) => [m.index, `S${i + 1}`]))
  return sources.map((source, index) => labels.has(index)
    ? { ...source, cited: true, label: labels.get(index) }
    : { ...source, cited: false })
}

export function buildSourcesChunk(sources: AgentSource[]) {
  return {
    type: 'data-sources' as const,
    id: 'sources',
    data: { schema: AGENT_SOURCES_SCHEMA, sources },
  }
}
