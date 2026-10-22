/**
 * Step: Create and Snapshot
 *
 * Prepares the local knowledge base from the snapshot repository and records
 * the resulting revision.
 */

import { log } from 'evlog'
import type { SnapshotConfig } from '../types'
import { createSandbox } from '../../../utils/sandbox/context'

export interface SnapshotResult {
  snapshotId: string
  sandboxId: string
}

export async function stepCreateAndSnapshot(config: SnapshotConfig): Promise<SnapshotResult> {
  log.info('snapshot', `[create-and-snapshot] Preparing knowledge base from ${config.snapshotRepo}#${config.snapshotBranch}`)

  const sandbox = await createSandbox({
    snapshotRepo: config.snapshotRepo,
    snapshotBranch: config.snapshotBranch,
    githubToken: config.githubToken,
  })
  log.info('snapshot', `[create-and-snapshot] Knowledge base ready: ${sandbox.sandboxId}`)

  const snapshot = await sandbox.snapshot()
  log.info('snapshot', `[create-and-snapshot] Snapshot recorded: ${snapshot.snapshotId}`)

  return {
    snapshotId: snapshot.snapshotId,
    sandboxId: sandbox.sandboxId,
  }
}
