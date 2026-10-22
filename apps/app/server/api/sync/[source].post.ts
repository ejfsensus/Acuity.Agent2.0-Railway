import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { blob } from '../../utils/blob'
import { startSync } from '../../utils/sync-runner'
import type { Source } from '../../workflows/sync-docs'
import type { FileSourceEntry } from '../../workflows/sync-docs/types'
import { getSnapshotRepoConfig } from '../../utils/sandbox/snapshot-config'

const paramsSchema = z.object({
  source: z.string().min(1),
})

/**
 * POST /api/sync/:source
 * Sync a specific source to the Railway knowledge base (admin only).
 */
export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  await requireAdmin(event)
  const { source: sourceId } = await getValidatedRouterParams(event, paramsSchema.parse)
  requestLog.set({ sourceId })
  const config = useRuntimeConfig()
  const snapshotConfig = await getSnapshotRepoConfig()

  const dbSource = await db.query.sources.findFirst({
    where: eq(schema.sources.id, sourceId),
  })

  if (!dbSource) {
    throw createError({
      statusCode: 404,
      message: `Source not found: ${sourceId}`,
      data: { why: 'No source exists with this ID in the database', fix: 'Verify the source ID from the sources list' },
    })
  }

  let source: Source
  if (dbSource.type === 'github') {
    source = {
      id: dbSource.id,
      type: 'github',
      label: dbSource.label,
      basePath: dbSource.basePath || '/docs',
      repo: dbSource.repo || '',
      branch: dbSource.branch || 'main',
      contentPath: dbSource.contentPath || '',
      outputPath: dbSource.outputPath || dbSource.id,
      readmeOnly: dbSource.readmeOnly ?? false,
    }
  } else if (dbSource.type === 'file') {
    const prefix = `sources/${dbSource.id}/`
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


    source = {
      id: dbSource.id,
      type: 'file',
      label: dbSource.label,
      basePath: dbSource.basePath || '/files',
      outputPath: dbSource.outputPath || dbSource.id,
      files,
    }
  } else {
    source = {
      id: dbSource.id,
      type: 'youtube',
      label: dbSource.label,
      basePath: dbSource.basePath || '/docs',
      channelId: dbSource.channelId || '',
      handle: dbSource.handle || '',
      maxVideos: dbSource.maxVideos || 50,
      outputPath: dbSource.outputPath || dbSource.id,
    }
  }

  const githubToken = await getSnapshotToken()
  if (!snapshotConfig.snapshotRepo) {
    throw createError({
      statusCode: 400,
      message: 'Snapshot repository is not configured',
      data: {
        why: 'Sync needs a GitHub repository where the aggregated knowledge base snapshot can be written',
        fix: 'Set NUXT_GITHUB_SNAPSHOT_REPO in Railway or configure the snapshot repository in Admin > Sandbox',
      },
    })
  }

  if (!githubToken) {
    throw createError({
      statusCode: 400,
      message: 'GitHub write token is not configured',
      data: {
        why: 'Sync must push the aggregated knowledge base into the snapshot repository',
        fix: 'Install/configure the GitHub App for the snapshot repository or set NUXT_GITHUB_TOKEN in Railway',
      },
    })
  }

  const syncConfig = {
    githubToken,
    youtubeApiKey: config.youtube?.apiKey,
    snapshotRepo: snapshotConfig.snapshotRepo,
    snapshotBranch: snapshotConfig.snapshotBranch,
  }

  const started = startSync(syncConfig, [source], `source:${source.label}`)

  if (!started.started) {
    throw createError({
      statusCode: 409,
      message: started.reason || 'A sync is already running',
      data: { why: 'Only one sync can write to the knowledge base at a time', fix: 'Wait for the current sync to finish, then retry' },
    })
  }

  requestLog.set({ type: source.type, label: source.label })

  return {
    status: 'started',
    message: `Sync started for "${source.label}".`,
    source: source.id,
  }
})
