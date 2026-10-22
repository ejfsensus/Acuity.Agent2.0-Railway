import { log } from 'evlog'

/**
 * Replacement for `waitUntil` from `@vercel/functions`.
 *
 * On Vercel this kept a promise alive past the serverless response. On a
 * long-running Railway service the process does not exit between requests, so
 * detaching the task is enough — we only need to make sure a rejection cannot
 * crash the process or go unnoticed.
 */
export function waitUntil(task: Promise<unknown>, label = 'background-task'): void {
  task.catch((error) => {
    log.error({
      event: `${label}.failed`,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}
