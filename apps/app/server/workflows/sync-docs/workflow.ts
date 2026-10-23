/**
 * Sync Documentation
 *
 * Syncs documentation from GitHub/YouTube/file sources into the local knowledge
 * base, pushes the result to the snapshot repository, then records the revision.
 *
 * Previously a Vercel Workflow. On a long-running Railway service the same steps
 * run in-process: the container is not torn down mid-job, so durable replay is
 * not required, and the whole run is idempotent (re-running a sync converges the
 * knowledge base to the same state).
 *
 * Steps run sequentially rather than via Promise.all because every source writes
 * into one shared tree and one container's CPU/IO budget.
 */

import { log } from 'evlog'
import { withKnowledgeBaseLock } from '../../utils/sandbox/lock'
import type { Source, SyncConfig, SyncResult, SyncSourceResult } from './types'
import {
  stepCreateSandbox,
  stepSyncSource,
  stepPushChanges,
  stepTakeSnapshot,
} from './steps'

export function syncDocumentation(config: SyncConfig, sources: Source[]): Promise<SyncResult> {
  return withKnowledgeBaseLock(() => runSync(config, sources))
}

async function runSync(
  config: SyncConfig,
  sources: Source[],
): Promise<SyncResult> {
  if (!config.snapshotRepo) {
    throw new Error('Snapshot repository is not configured')
  }

  if (!sources || sources.length === 0) {
    throw new Error('No sources provided')
  }

  // Step 1: Prepare the local knowledge base
  const { sandboxId } = await stepCreateSandbox(config)

  // Step 2: Sync each source
  const results: SyncSourceResult[] = []
  for (const source of sources) {
    results.push(await stepSyncSource(sandboxId, source, {
      githubToken: config.githubToken,
      youtubeApiKey: config.youtubeApiKey,
    }))
  }

  const failed = results.filter(result => !result.success)
  if (failed.length) throw new Error(failed.map(result => `${result.label}: ${result.error}`).join('; '))

  // Step 4: Push changes to git
  const pushed = await stepPushChanges(
    sandboxId,
    {
      snapshotRepo: config.snapshotRepo,
      snapshotBranch: config.snapshotBranch,
      githubToken: config.githubToken,
    },
    results,
  )
  if (!pushed.success) throw new Error(pushed.error || 'Knowledge base push failed')

  // Step 5: Record the revision that is now live
  const { snapshotId } = await stepTakeSnapshot(sandboxId)

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length
  const totalFiles = results.reduce((sum, r) => sum + (r.fileCount || 0), 0)

  const status = failCount === 0 ? '✓' : '✗'
  log.info('sync', `${status} Done: ${successCount}/${sources.length} sources, ${totalFiles} files`)

  return {
    success: failCount === 0,
    snapshotId,
    summary: {
      total: sources.length,
      success: successCount,
      failed: failCount,
      files: totalFiles,
    },
    results,
  }
}
