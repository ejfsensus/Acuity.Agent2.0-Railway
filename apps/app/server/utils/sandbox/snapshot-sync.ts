import { log } from 'evlog'
import { createError } from 'h3'
import { getSnapshotToken } from '../github-auth'
import { appKvDel, appKvGet, appKvSet } from '../app-kv'
import type { SnapshotMetadata } from './types'
import { KV_KEYS } from './types'
import { getLocalSandbox } from './context'
import { SANDBOX_ROOT, ensureSandboxRoot } from './local'
import { prepareKnowledgeBase } from './knowledge-base'
import { getCurrentSnapshot, setCurrentSnapshot } from './snapshot'
import { getSnapshotRepoConfig } from './snapshot-config'
import { generateRepoUrl, gitAuthEnv } from './git'
import type { SnapshotSyncStatus } from '#shared/types/snapshot'

const CACHE_TTL_MS = 60 * 1000

interface CachedSnapshotStatus {
  latestSnapshotId: string | null
  latestCreatedAt: number | null
  cachedAt: number
}

/**
 * A "snapshot" is now a git revision of the knowledge base repository rather than
 * a Vercel Sandbox microVM image. The remote branch head plays the role the
 * platform snapshot list used to: it is the newest content available to adopt.
 */
export interface KnowledgeSnapshot {
  id: string
  createdAt: number
  sourceSandboxId: string
}

async function readRemoteHead(repoUrl: string, branch: string, token?: string): Promise<string | null> {
  await ensureSandboxRoot()
  const sandbox = getLocalSandbox()
  const result = await sandbox.runCommand({
    cmd: 'git',
    args: ['ls-remote', repoUrl, `refs/heads/${branch}`],
    cwd: SANDBOX_ROOT,
    env: gitAuthEnv(token),
  })

  if (result.exitCode !== 0) {
    log.warn('snapshot', `Could not read remote head for ${branch}: ${(await result.stderr()).trim()}`)
    return null
  }

  const line = (await result.stdout()).trim().split('\n')[0] || ''
  return line.split(/\s+/)[0] || null
}

/** Returns the newest available revision of the snapshot repository. */
export async function getLatestSnapshot(): Promise<KnowledgeSnapshot | null> {
  const { snapshotRepo, snapshotBranch } = await getSnapshotRepoConfig()
  if (!snapshotRepo) return null

  const token = await getSnapshotToken()
  const head = await readRemoteHead(generateRepoUrl(snapshotRepo), snapshotBranch || 'main', token)
  if (!head) return null

  return { id: head, createdAt: Date.now(), sourceSandboxId: 'local-knowledge-base' }
}

/** Kept for API compatibility; there is at most one candidate revision now. */
export async function listSnapshots(): Promise<KnowledgeSnapshot[]> {
  const latest = await getLatestSnapshot()
  return latest ? [latest] : []
}

async function getCachedLatestSnapshot(): Promise<CachedSnapshotStatus> {
  const cached = await appKvGet<CachedSnapshotStatus>(KV_KEYS.SNAPSHOT_STATUS_CACHE)

  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached
  }

  let latest: KnowledgeSnapshot | null = null
  try {
    latest = await getLatestSnapshot()
  } catch (error) {
    log.warn('snapshot', `Failed to resolve latest knowledge base revision: ${error instanceof Error ? error.message : String(error)}`)
  }

  const freshCache: CachedSnapshotStatus = {
    latestSnapshotId: latest?.id ?? null,
    latestCreatedAt: latest?.createdAt ?? null,
    cachedAt: Date.now(),
  }

  await appKvSet(KV_KEYS.SNAPSHOT_STATUS_CACHE, freshCache, { ttl: Math.ceil(CACHE_TTL_MS / 1000) })

  return freshCache
}

export async function getSnapshotSyncStatus(): Promise<SnapshotSyncStatus> {
  const [current, cached] = await Promise.all([
    getCurrentSnapshot(),
    getCachedLatestSnapshot(),
  ])

  const currentSnapshotId = current?.snapshotId ?? null
  const { latestSnapshotId, latestCreatedAt } = cached
  const needsSync = latestSnapshotId !== null && latestSnapshotId !== currentSnapshotId

  return {
    currentSnapshotId,
    latestSnapshotId,
    needsSync,
    latestCreatedAt,
  }
}

/** Fast-forwards the local knowledge base and records the revision as current. */
export async function syncToSnapshot(snapshotId?: string): Promise<SnapshotMetadata> {
  const snapshotConfig = await getSnapshotRepoConfig()

  if (!snapshotConfig.snapshotRepo) {
    throw createError({
      statusCode: 503,
      message: 'No snapshot repository is configured',
      data: { why: 'The local knowledge base has nothing to sync from', fix: 'Set the snapshot repository in Admin > Sandbox, then run a sync' },
    })
  }

  await prepareKnowledgeBase()

  const sandbox = getLocalSandbox()
  const { snapshotId: activeId } = await sandbox.snapshot()
  if (snapshotId && snapshotId !== activeId) throw new Error('Requested revision is not the checked out knowledge base revision')
  const resolvedId = activeId

  const metadata: SnapshotMetadata = {
    snapshotId: resolvedId,
    createdAt: Date.now(),
    sourceRepo: snapshotConfig.snapshotRepo,
    commitSha: resolvedId.startsWith('local-') ? undefined : resolvedId,
  }

  await setCurrentSnapshot(metadata)
  await appKvDel(KV_KEYS.SNAPSHOT_STATUS_CACHE)

  log.info('snapshot', `Knowledge base synced to ${resolvedId}`)

  return metadata
}
