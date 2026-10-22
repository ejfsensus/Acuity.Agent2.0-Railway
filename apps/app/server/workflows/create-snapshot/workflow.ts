/**
 * Create Snapshot
 *
 * Prepares the local knowledge base from a git repository and records the
 * revision. Runs in-process on the Railway service.
 */

import { log } from 'evlog'
import type { SnapshotConfig, SnapshotResult } from './types'
import { stepCreateAndSnapshot } from './steps'

export async function createSnapshot(config: SnapshotConfig): Promise<SnapshotResult> {
  if (!config.snapshotRepo) {
    throw new Error('Snapshot repository is not configured')
  }

  const { snapshotId } = await stepCreateAndSnapshot(config)

  log.info('snapshot', `✓ Snapshot ready: ${snapshotId}`)

  return {
    success: true,
    snapshotId,
    sourceRepo: config.snapshotRepo,
  }
}
