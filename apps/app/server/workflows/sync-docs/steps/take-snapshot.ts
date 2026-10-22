/**
 * Step: Take Snapshot
 *
 * Records the current knowledge base revision so the agent and admin UI
 * can report which content is live.
 */

import { log } from 'evlog'
import { getLocalSandbox } from '../../../utils/sandbox/context'
import { setCurrentSnapshot } from '../../../utils/sandbox/snapshot'
import { getSnapshotRepoConfig } from '../../../utils/sandbox/snapshot-config'

export interface TakeSnapshotResult {
  snapshotId: string
}

export async function stepTakeSnapshot(_sandboxId: string): Promise<TakeSnapshotResult> {
  log.info('sync', '[take-snapshot] Recording knowledge base revision')

  const { snapshotId } = await getLocalSandbox().snapshot()
  const { snapshotRepo } = await getSnapshotRepoConfig()

  await setCurrentSnapshot({
    snapshotId,
    createdAt: Date.now(),
    sourceRepo: snapshotRepo,
    commitSha: snapshotId.startsWith('local-') ? undefined : snapshotId,
  })

  log.info('sync', `[take-snapshot] Snapshot recorded: ${snapshotId}`)

  return { snapshotId }
}
