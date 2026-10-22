import type { SnapshotMetadata } from './types'
import { KV_KEYS } from './types'
import { appKvGet, appKvSet } from '../app-kv'

/** Returns current snapshot metadata from KV, null if none exists */
export async function getCurrentSnapshot(): Promise<SnapshotMetadata | null> {
  return await appKvGet<SnapshotMetadata>(KV_KEYS.CURRENT_SNAPSHOT)
}

/** Stores snapshot metadata as current snapshot in KV */
export async function setCurrentSnapshot(metadata: SnapshotMetadata): Promise<void> {
  await appKvSet(KV_KEYS.CURRENT_SNAPSHOT, metadata)
}
