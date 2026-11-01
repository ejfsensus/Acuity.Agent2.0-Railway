import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { createLocalLibrary, requestSacredText, type ResearchDependencies } from '@savoir/agent'
import { SacredTextError } from '@savoir/agent'
import { SANDBOX_ROOT } from './sandbox/local'
import { ensureKnowledgeBase } from './sandbox/knowledge-base'
import { appKvGet, appKvSet } from './app-kv'

export function createLibraryResearch(callbacks: Pick<ResearchDependencies, 'onProgress' | 'onReport'> = {}): ResearchDependencies {
  const library = createLocalLibrary(join(SANDBOX_ROOT, 'docs/sacred-texts'), join(SANDBOX_ROOT, '.library-catalogue-v1.json'))
  return {
    ...callbacks,
    local: {
      discover: async (...args) => {
        await ensureKnowledgeBase()
        return library.discover(...args)
      },
      search: (...args) => library.search(...args),
    },
    remote: async (input, signal) => {
      const scope = createHash('sha256').update(`${process.env.SACRED_TEXT_API_URL || 'default'}:${process.env.SACRED_TEXT_API_KEY || ''}:${process.env.SACRED_TEXT_INDEX_REVISION || 'ttl'}`).digest('hex').slice(0, 24)
      const key = `library-discovery:${scope}:${createHash('sha256').update(JSON.stringify(input)).digest('hex')}`
      const catalogue = ['list_books', 'list_traditions', 'book_info'].includes(input.action)
      const semantic = ['search_texts', 'compare_traditions', 'find_parallels'].includes(input.action)
      const cooldown = `library-discovery:${scope}:cooldown`
      if (catalogue) {
        const cached = await appKvGet<unknown>(key).catch(() => null)
        if (cached) return cached
      }
      if (semantic) {
        const until = await appKvGet<number>(cooldown).catch(() => null)
        if (until && until > Date.now()) throw new SacredTextError(429, 'Shared embedding service is cooling down', String(Math.ceil((until - Date.now()) / 1000)))
      }
      try {
        const result = await requestSacredText(input, signal)
        if (catalogue) await appKvSet(key, result, { ttl: 300 }).catch(() => {})
        return result
      } catch (error) {
        if (error instanceof SacredTextError && error.status === 429) {
          const seconds = Number(error.retryAfter)
          const until = error.retryAfter && !Number.isFinite(seconds) ? Date.parse(error.retryAfter) : Date.now() + (seconds || 60) * 1000
          await appKvSet(cooldown, Math.min(Date.now() + 3_600_000, Math.max(Date.now() + 1000, until || Date.now() + 60_000)), { ttl: 3600 }).catch(() => {})
        }
        throw error
      }
    },
  }
}
