import { log } from 'evlog'
import type { SyncConfig } from '../../workflows/sync-docs/types'
import type { SandboxLike } from './types'
import { LocalSandbox, ensureSandboxRoot } from './local'
import { prepareKnowledgeBase } from './knowledge-base'

/** Shared local sandbox — one clone of the knowledge base serves every caller. */
const localSandbox = new LocalSandbox('local-knowledge-base')

export function getLocalSandbox(): SandboxLike {
  return localSandbox
}

/**
 * Prepares the local knowledge base and returns the shared sandbox.
 *
 * Stands in for `Sandbox.create({ source: git })`: rather than booting a microVM
 * from a repository, we clone/fast-forward that repository on the attached volume.
 */
export async function createSandbox(config: SyncConfig): Promise<SandboxLike> {
  await ensureSandboxRoot()
  log.info('sandbox', `Preparing knowledge base from ${config.snapshotRepo}#${config.snapshotBranch}`)
  await prepareKnowledgeBase()
  return localSandbox
}
