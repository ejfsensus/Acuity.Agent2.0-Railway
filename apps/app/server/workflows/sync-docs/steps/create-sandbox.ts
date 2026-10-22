/**
 * Step: Prepare Knowledge Base
 *
 * Clones or fast-forwards the local knowledge base from the snapshot repository.
 */

import { log } from 'evlog'
import type { SyncConfig } from '../types'
import { createSandbox } from '../../../utils/sandbox/context'

export interface CreateSandboxResult {
  sandboxId: string
}

export async function stepCreateSandbox(config: SyncConfig): Promise<CreateSandboxResult> {
  log.info('sync', `[create-sandbox] Preparing knowledge base from ${config.snapshotRepo}#${config.snapshotBranch}`)

  const sandbox = await createSandbox(config)

  log.info('sync', `[create-sandbox] Knowledge base ready: ${sandbox.sandboxId}`)

  return { sandboxId: sandbox.sandboxId }
}
