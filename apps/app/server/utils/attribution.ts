import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAttribution, type CollectionAttribution } from './chat/collect-sources'

let cached: CollectionAttribution[] | null = null

/** ATTRIBUTION.txt of the bundled sacred-text library, parsed once per process. */
export function libraryAttributions(): CollectionAttribution[] {
  if (cached) return cached
  const candidates = [
    process.env.SACRED_TEXTS_DIR,
    join(process.cwd(), 'Texts/sacred_texts_archive'),
    join(process.cwd(), '../../Texts/sacred_texts_archive'),
  ].filter(Boolean) as string[]
  for (const dir of candidates) {
    try {
      cached = parseAttribution(readFileSync(join(dir, 'ATTRIBUTION.txt'), 'utf8'))
      return cached
    } catch {
      // try the next candidate
    }
  }
  cached = []
  return cached
}
