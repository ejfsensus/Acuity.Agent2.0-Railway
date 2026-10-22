/**
 * Step: Push Changes to Git
 *
 * Commits and pushes synced documentation changes to the snapshot repository.
 */

import { log } from 'evlog'
import type { SyncSourceResult } from '../types'
import { generateAuthRepoUrl, generateCommitMessage, pushChanges as gitPushChanges } from '../../../utils/sandbox/git'
import { getLocalSandbox } from '../../../utils/sandbox/context'

export interface PushChangesConfig {
  snapshotRepo: string
  snapshotBranch: string
  githubToken?: string
}

export interface PushChangesResult {
  success: boolean
  hasChanges: boolean
  error?: string
}

export async function stepPushChanges(
  _sandboxId: string,
  config: PushChangesConfig,
  results: SyncSourceResult[],
): Promise<PushChangesResult> {
  log.info('sync', `[push-changes] Pushing changes to ${config.snapshotRepo}#${config.snapshotBranch}`)

  const commitMessage = generateCommitMessage(results)
  const repoUrl = generateAuthRepoUrl(config.snapshotRepo, config.githubToken)

  const pushResult = await gitPushChanges(getLocalSandbox(), {
    branch: config.snapshotBranch,
    repoUrl,
    commitMessage,
  })

  if (pushResult.success && pushResult.hasChanges) {
    log.info('sync', '[push-changes] Changes pushed to repository')
  } else if (pushResult.success && !pushResult.hasChanges) {
    log.info('sync', '[push-changes] No changes to push')
  } else {
    log.error('sync', `[push-changes] Push failed: ${pushResult.error}`)
  }

  return pushResult
}
