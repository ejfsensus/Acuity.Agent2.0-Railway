/**
 * Step: Cleanup Stale Sources
 *
 * Removes directories from the knowledge base that belong to sources
 * that have been deleted since the last sync.
 */

import { log } from 'evlog'
import type { Source } from '../types'
import { cleanupStaleSources } from '../../../utils/sandbox/source-sync'
import { getLocalSandbox } from '../../../utils/sandbox/context'

export interface CleanupStaleResult {
  removed: string[]
}

export async function stepCleanupStale(
  _sandboxId: string,
  sources: Source[],
): Promise<CleanupStaleResult> {
  log.info('sync', '[cleanup-stale] Cleaning up stale source directories')

  const removed = await cleanupStaleSources(getLocalSandbox(), sources)

  if (removed.length > 0) {
    log.info('sync', `[cleanup-stale] Removed ${removed.length} stale directories: ${removed.join(', ')}`)
  } else {
    log.info('sync', '[cleanup-stale] No stale directories found')
  }

  return { removed }
}
