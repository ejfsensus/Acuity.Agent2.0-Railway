import { log } from 'evlog'
import { syncDocumentation } from '../workflows/sync-docs'
import type { Source, SyncConfig, SyncResult } from '../workflows/sync-docs'
import { appKvGet, appKvSet } from './app-kv'
import { KV_KEYS } from './sandbox/types'

export type SyncState = 'idle' | 'running' | 'succeeded' | 'failed'

export interface SyncStatus {
  state: SyncState
  startedAt: number | null
  finishedAt: number | null
  scope: string | null
  error: string | null
  summary: SyncResult['summary'] | null
}

const IDLE_STATUS: SyncStatus = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  scope: null,
  error: null,
  summary: null,
}

/**
 * Guards against overlapping syncs. Every source writes into one shared
 * knowledge base tree, so two concurrent runs would interleave git operations
 * and leave the clone in an inconsistent state.
 */
let inFlight: Promise<SyncResult> | null = null

export async function getSyncStatus(): Promise<SyncStatus> {
  return (await appKvGet<SyncStatus>(KV_KEYS.SYNC_STATUS)) ?? IDLE_STATUS
}

export function isSyncRunning(): boolean {
  return inFlight !== null
}

export async function recoverInterruptedSync(): Promise<void> {
  const status = await getSyncStatus()
  if (status.state === 'running' && !inFlight) {
    await appKvSet(KV_KEYS.SYNC_STATUS, { ...status, state: 'failed', finishedAt: Date.now(), error: 'Sync was interrupted by a service restart. Run sync again.' } satisfies SyncStatus)
  }
}

/**
 * Starts a sync in the background and returns immediately.
 *
 * Replaces `start(syncDocumentation, ...)` from the Vercel Workflow SDK. The
 * Railway service is long-lived, so the job simply runs in-process; status is
 * persisted so the admin UI can poll it across requests and restarts.
 */
export function startSync(
  config: SyncConfig,
  sources: Source[],
  scope: string,
): { started: boolean, reason?: string } {
  if (inFlight) {
    return { started: false, reason: 'A sync is already running' }
  }

  const startedAt = Date.now()

  const run = (async () => {
    await appKvSet(KV_KEYS.SYNC_STATUS, {
      state: 'running',
      startedAt,
      finishedAt: null,
      scope,
      error: null,
      summary: null,
    } satisfies SyncStatus)

    log.info('sync', `Starting sync (${scope}, ${sources.length} source(s))`)
    const result = await syncDocumentation(config, sources)
    if (result.success) await appKvSet(KV_KEYS.LAST_SOURCE_SYNC, Date.now())

    await appKvSet(KV_KEYS.SYNC_STATUS, {
      state: result.success ? 'succeeded' : 'failed',
      startedAt,
      finishedAt: Date.now(),
      scope,
      error: result.success ? null : 'One or more sources failed to sync',
      summary: result.summary,
    } satisfies SyncStatus)

    return result
  })()

  inFlight = run

  // Report failures instead of leaving an unhandled rejection behind.
  run.catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error)
    log.error('sync', `Sync failed (${scope}): ${message}`)
    await appKvSet(KV_KEYS.SYNC_STATUS, {
      state: 'failed',
      startedAt,
      finishedAt: Date.now(),
      scope,
      error: message,
      summary: null,
    } satisfies SyncStatus).catch(() => {})
  }).finally(() => {
    inFlight = null
  })

  return { started: true }
}
