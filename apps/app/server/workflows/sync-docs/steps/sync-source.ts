/**
 * Step: Sync Single Source
 *
 * Syncs a single source (GitHub, YouTube or file) into the local knowledge base.
 */

import { log } from 'evlog'
import type { Source, SyncSourceResult } from '../types'
import { syncFileSource, syncGitHubSource, syncYouTubeSource } from '../../../utils/sandbox/source-sync'
import { getLocalSandbox } from '../../../utils/sandbox/context'
import { getSnapshotToken } from '../../../utils/github-auth'

export async function stepSyncSource(
  _sandboxId: string,
  source: Source,
  config: { githubToken?: string, youtubeApiKey?: string },
): Promise<SyncSourceResult> {
  log.info('sync', `[sync-source] Syncing source "${source.label}"`)

  const sandbox = getLocalSandbox()
  let result: SyncSourceResult

  if (source.type === 'github') {
    result = await syncGitHubSource(sandbox, source, await getSnapshotToken(source.repo) || config.githubToken)
  } else if (source.type === 'youtube') {
    if (!config.youtubeApiKey) {
      result = {
        sourceId: source.id,
        label: source.label,
        success: false,
        fileCount: 0,
        error: 'YouTube API key not configured',
      }
    } else {
      result = await syncYouTubeSource(sandbox, source, config.youtubeApiKey)
    }
  } else if (source.type === 'file') {
    result = await syncFileSource(sandbox, source)
  } else {
    const unknownSource = source as Source
    result = {
      sourceId: unknownSource.id,
      label: unknownSource.label,
      success: false,
      fileCount: 0,
      error: `Unsupported source type: ${unknownSource.type}`,
    }
  }

  log.info('sync', `[sync-source] Source "${source.label}": ${result.success ? `synced ${result.fileCount} files` : `failed - ${result.error}`}`)

  return result
}
