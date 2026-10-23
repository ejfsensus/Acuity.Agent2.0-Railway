import { AsyncLocalStorage } from 'node:async_hooks'

const owner = new AsyncLocalStorage<boolean>()
let pending: Promise<unknown> = Promise.resolve()

/** Serializes writes to the shared clone, including nested workflow steps. */
export function withKnowledgeBaseLock<T>(task: () => Promise<T>): Promise<T> {
  if (owner.getStore()) return task()
  const run = pending.then(() => owner.run(true, task))
  pending = run.catch(() => {})
  return run
}
