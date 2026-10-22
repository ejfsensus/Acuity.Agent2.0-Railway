import { createError, log } from 'evlog'
import type { ActiveSandbox, SandboxManagerConfig } from './types'
import { LocalSandbox, SANDBOX_ROOT, ensureSandboxRoot } from './local'
import { getCurrentSnapshot, setCurrentSnapshot } from './snapshot'
import { deleteSandboxSession, generateSessionId, getSandboxSession, setSandboxSession, touchSandboxSession } from './session'
import { getSnapshotRepoConfig } from './snapshot-config'
import { prepareKnowledgeBase } from './knowledge-base'
import type { SnapshotMetadata } from './types'

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000

/**
 * A single process-wide sandbox. The knowledge base is one shared clone and the
 * agent's commands are read-only, so every user and conversation can share it —
 * the same pooling the app already did with Vercel Sandbox.
 */
const sharedSandbox = new LocalSandbox('local-knowledge-base')

let preparing: Promise<void> | null = null

async function getConfig(): Promise<SandboxManagerConfig> {
  const snapshotConfig = await getSnapshotRepoConfig()
  return {
    githubToken: await getSnapshotToken(),
    snapshotRepo: snapshotConfig.snapshotRepo,
    snapshotBranch: snapshotConfig.snapshotBranch,
    sessionTtlMs: DEFAULT_SESSION_TTL_MS,
  }
}

/** Clones or refreshes the knowledge base, collapsing concurrent callers into one run. */
async function ensureKnowledgeBase(): Promise<void> {
  await ensureSandboxRoot()
  if (!preparing) {
    preparing = prepareKnowledgeBase().finally(() => {
      preparing = null
    })
  }
  return preparing
}

/**
 * Records the current knowledge base revision as the active snapshot so the admin
 * UI keeps reporting meaningful ids after the move off Vercel Sandbox images.
 */
async function recordSnapshot(): Promise<string> {
  const { snapshotId } = await sharedSandbox.snapshot()
  const config = await getConfig()

  const metadata: SnapshotMetadata = {
    snapshotId,
    createdAt: Date.now(),
    sourceRepo: config.snapshotRepo,
    commitSha: snapshotId.startsWith('local-') ? undefined : snapshotId,
  }
  await setCurrentSnapshot(metadata)

  return snapshotId
}

export async function getOrCreateSandbox(sessionId?: string): Promise<ActiveSandbox> {
  const config = await getConfig()
  const startTime = Date.now()

  // Reuse an existing session when it is still valid.
  if (sessionId) {
    const session = await getSandboxSession(sessionId)
    if (session && Date.now() <= session.expiresAt) {
      await touchSandboxSession(sessionId, config.sessionTtlMs)
      return { sandbox: sharedSandbox, session, sessionId }
    }
    if (session) await deleteSandboxSession(sessionId)
  }

  try {
    await ensureKnowledgeBase()
  } catch (error) {
    throw createError({
      statusCode: 503,
      message: 'Knowledge base is not available',
      data: {
        why: error instanceof Error ? error.message : String(error),
        fix: 'Configure a snapshot repository in Admin > Sandbox, then trigger a sync',
      },
    })
  }

  const snapshot = await getCurrentSnapshot()
  const snapshotId = snapshot?.snapshotId ?? (await recordSnapshot())

  const newSessionId = sessionId || generateSessionId()
  const session = await setSandboxSession(
    newSessionId,
    { sandboxId: sharedSandbox.sandboxId, snapshotId, createdAt: Date.now() },
    config.sessionTtlMs,
  )

  log.info('sandbox', `Local sandbox ready at ${SANDBOX_ROOT} for session ${newSessionId} (${Date.now() - startTime}ms)`)

  return { sandbox: sharedSandbox, session, sessionId: newSessionId }
}
