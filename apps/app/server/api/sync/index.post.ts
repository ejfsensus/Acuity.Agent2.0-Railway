import { z } from 'zod'
import { db } from '@nuxthub/db'
import { blob } from '../../utils/blob'
import { startSync } from '../../utils/sync-runner'
import type { Source } from '../../workflows/sync-docs'
import type { FileSourceEntry } from '../../workflows/sync-docs/types'
import { KV_KEYS } from '../../utils/sandbox/types'
import { getSnapshotRepoConfig } from '../../utils/sandbox/snapshot-config'
import { appKvSet } from '../../utils/app-kv'

const bodySchema = z
  .object({
    sourceFilter: z.string().optional(),
  })
  .optional()

/**
 * POST /api/sync
 * Sync all sources using Vercel Sandbox (admin only).
 *
 * Body (optional):
 * - sourceFilter: string - Only sync a specific source
 */
export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  await requireAdmin(event)
  const body = await readValidatedBody(event, data => bodySchema.parse(data))
  const config = useRuntimeConfig()
  const snapshotConfig = await getSnapshotRepoConfig()

  requestLog.set({ sourceFilter: body?.sourceFilter })

  const dbSources = await db.query.sources.findMany()

  let sources: Source[] = await Promise.all(dbSources.map(async (s): Promise<Source> => {
    if (s.type === 'github') {
      return {
        id: s.id,
        type: 'github' as const,
        label: s.label,
        basePath: s.basePath || '/docs',
        repo: s.repo || '',
        branch: s.branch || 'main',
        contentPath: s.contentPath || '',
        outputPath: s.outputPath || s.id,
        readmeOnly: s.readmeOnly ?? false,
      }
    }

    if (s.type === 'file') {
      const prefix = `sources/${s.id}/`
      const { blobs } = await blob.list({ prefix })

      const files: FileSourceEntry[] = []
      for (const blobItem of blobs) {
        const response = await blob.get(blobItem.pathname)
        if (response) {
          files.push({
            filename: blobItem.pathname.replace(prefix, ''),
            content: await response.text(),
          })
        }
      }

      // Clean up blob — content is now embedded in the workflow payload
      if (blobs.length > 0) {
        await blob.del(blobs.map(b => b.pathname))
      }

      return {
        id: s.id,
        type: 'file' as const,
        label: s.label,
        basePath: s.basePath || '/files',
        outputPath: s.outputPath || s.id,
        files,
      }
    }

    return {
      id: s.id,
      type: 'youtube' as const,
      label: s.label,
      basePath: s.basePath || '/docs',
      channelId: s.channelId || '',
      handle: s.handle || '',
      maxVideos: s.maxVideos || 50,
      outputPath: s.outputPath || s.id,
    }
  }))

  if (body?.sourceFilter) {
    sources = sources.filter(s => s.id === body.sourceFilter)
    if (sources.length === 0) {
      throw createError({
        statusCode: 404,
        message: `Source not found: ${body.sourceFilter}`,
        data: { why: 'The specified source filter does not match any configured source', fix: 'Check the source ID and try again' },
      })
    }
  }

  if (sources.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No sources to sync',
      data: { why: 'No sources have been configured yet', fix: 'Add at least one source in the admin panel before syncing' },
    })
  }

  const githubToken = await getSnapshotToken()
  if (!snapshotConfig.snapshotRepo) {
    throw createError({
      statusCode: 400,
      message: 'Snapshot repository is not configured',
      data: {
        why: 'Sync needs a GitHub repository where the aggregated knowledge base snapshot can be written',
        fix: 'Set NUXT_GITHUB_SNAPSHOT_REPO in Vercel or configure the snapshot repository in Admin > Sandbox',
      },
    })
  }

  if (!githubToken) {
    throw createError({
      statusCode: 400,
      message: 'GitHub write token is not configured',
      data: {
        why: 'Sync must push the aggregated knowledge base into the snapshot repository',
        fix: 'Install/configure the GitHub App for the snapshot repository or set NUXT_GITHUB_TOKEN in Vercel',
      },
    })
  }

  const syncConfig = {
    githubToken,
    youtubeApiKey: config.youtube?.apiKey,
    snapshotRepo: snapshotConfig.snapshotRepo,
    snapshotBranch: snapshotConfig.snapshotBranch,
  }

  const started = startSync(syncConfig, sources, body?.sourceFilter ? `source:${body.sourceFilter}` : 'all')

  if (!started.started) {
    throw createError({
      statusCode: 409,
      message: started.reason || 'A sync is already running',
      data: { why: 'Only one sync can write to the knowledge base at a time', fix: 'Wait for the current sync to finish, then retry' },
    })
  }

  await appKvSet(KV_KEYS.LAST_SOURCE_SYNC, Date.now())

  requestLog.set({ sourceCount: sources.length })

  return {
    status: 'started',
    message: `Sync started for ${sources.length} source(s).`,
  }
})
