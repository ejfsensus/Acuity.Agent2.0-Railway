import { createSnapshot } from '../../workflows/create-snapshot'
import { getSnapshotRepoConfig } from '../../utils/sandbox/snapshot-config'

export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  await requireAdmin(event)

  const snapshotConfig = await getSnapshotRepoConfig()

  // Runs in-process now: preparing the local knowledge base is a git
  // fetch/checkout, so it is fast enough to await rather than queue.
  const result = await createSnapshot({
    githubToken: await getSnapshotToken(),
    snapshotRepo: snapshotConfig.snapshotRepo,
    snapshotBranch: snapshotConfig.snapshotBranch,
  })

  requestLog.set({ snapshotId: result.snapshotId })

  return {
    status: 'complete',
    success: result.success,
    snapshotId: result.snapshotId,
    sourceRepo: result.sourceRepo,
  }
})
