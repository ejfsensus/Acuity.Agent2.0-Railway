import { z } from 'zod'
import { createError } from 'h3'
import { getSnapshotRepoConfig, setSnapshotRepoConfig } from '../../utils/sandbox/snapshot-config'
import { KV_KEYS } from '../../utils/sandbox/types'
import { requireAdmin } from '../../utils/admin'
import { appKvDel } from '../../utils/app-kv'
import { getLocalSandbox } from '../../utils/sandbox/context'
import { ensureSandboxRoot, SANDBOX_ROOT } from '../../utils/sandbox/local'
import { generateRepoUrl, gitAuthEnv } from '../../utils/sandbox/git'
import { prepareKnowledgeBase } from '../../utils/sandbox/knowledge-base'

const bodySchema = z.object({
  snapshotRepo: z.string().min(1),
  snapshotBranch: z.string().optional(),
  allowExistingRepo: z.boolean().optional(),
})

/**
 * PUT /api/snapshot/config
 * Updates snapshot repository settings (admin only).
 */
export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  await requireAdmin(event)
  const body = await readValidatedBody(event, data => bodySchema.parse(data))

  const snapshotRepo = body.snapshotRepo.trim()
  const snapshotBranch = body.snapshotBranch?.trim() || 'main'

  const token = await getSnapshotToken(snapshotRepo)
  await ensureSandboxRoot()
  const remote = await getLocalSandbox().runCommand({
    cmd: 'git', args: ['ls-remote', '--exit-code', generateRepoUrl(snapshotRepo), `refs/heads/${snapshotBranch}`],
    cwd: SANDBOX_ROOT, env: gitAuthEnv(token),
  })
  if (remote.exitCode !== 0) throw createError({ statusCode: 400, message: 'Cannot read that repository branch. Check the repository, branch, and GitHub credentials for private content.' })

  const previous = await getSnapshotRepoConfig()
  const next = await setSnapshotRepoConfig({
    snapshotRepo,
    snapshotBranch,
  })

  const changed = previous.snapshotRepo !== next.snapshotRepo || previous.snapshotBranch !== next.snapshotBranch

  if (changed) {
    await appKvDel(
      KV_KEYS.CURRENT_SNAPSHOT,
      KV_KEYS.SNAPSHOT_STATUS_CACHE,
      KV_KEYS.ACTIVE_SANDBOX_SESSION,
    )
  }
  waitUntil(prepareKnowledgeBase(), 'knowledge-base.configure')

  requestLog.set({
    snapshotRepo: next.snapshotRepo,
    snapshotBranch: next.snapshotBranch,
    changed,
  })

  return {
    success: true,
    ...next,
    repositoryEnsured: snapshotRepo,
    repositoryUrl: `https://github.com/${snapshotRepo}`,
    repositoryCreated: false,
    repositoryAdoptedExisting: false,
    changed,
  }
})
