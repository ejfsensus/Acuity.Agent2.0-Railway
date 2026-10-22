import { db, schema } from '@nuxthub/db'
import { asc } from 'drizzle-orm'
import { KV_KEYS } from '../../utils/sandbox/types'
import { getSnapshotRepoConfig } from '../../utils/sandbox/snapshot-config'
import { appKvGet } from '../../utils/app-kv'

/**
 * GET /api/sources
 * List all sources grouped by type
 *
 * Response format matches SourcesResponse from @savoir/sdk
 */
export default defineEventHandler(async (event) => {
  await requireAuthorizedUser(event)

  const config = useRuntimeConfig()
  const hasYouTubeApiKey = !!config.youtube?.apiKey

  const [allSources, lastSyncAt, snapshotConfig] = await Promise.all([
    db.select().from(schema.sources).orderBy(asc(schema.sources.label)),
    appKvGet<number>(KV_KEYS.LAST_SOURCE_SYNC),
    getSnapshotRepoConfig(),
  ])

  const github = allSources.filter(s => s.type === 'github')
  const youtube = hasYouTubeApiKey ? allSources.filter(s => s.type === 'youtube') : []
  const file = allSources.filter(s => s.type === 'file')

  const snapshotRepo = snapshotConfig.snapshotRepo || null
  const snapshotBranch = snapshotConfig.snapshotBranch || 'main'

  return {
    total: github.length + youtube.length + file.length,
    lastSyncAt,
    youtubeEnabled: hasYouTubeApiKey,
    snapshotRepo,
    snapshotBranch,
    snapshotRepoUrl: snapshotRepo ? `https://github.com/${snapshotRepo}` : null,
    github: {
      count: github.length,
      sources: github,
    },
    youtube: {
      count: youtube.length,
      sources: youtube,
    },
    file: {
      count: file.length,
      sources: file,
    },
  }
})
