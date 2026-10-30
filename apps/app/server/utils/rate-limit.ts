import { KV_KEYS } from './sandbox/types'
import { appKvGet, appKvSet } from './app-kv'

const DEFAULT_DAILY_MESSAGE_LIMIT = 15

/** Non-admin daily question limit; AGENT_DAILY_MESSAGE_LIMIT overrides the default of 15. */
export function dailyMessageLimit(): number {
  const raw = Number.parseInt(process.env.AGENT_DAILY_MESSAGE_LIMIT || '', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_MESSAGE_LIMIT
}

/**
 * Service accounts (e.g. Acuity.Search's Sacred Texts relay) listed in
 * AGENT_SERVICE_ACCOUNT_EMAILS (comma separated, case-insensitive) are exempt
 * from the per-user daily limit. They are plain members, never admins.
 */
export function isServiceAccount(email: string | null | undefined): boolean {
  const target = email?.trim().toLowerCase()
  if (!target) return false
  return (process.env.AGENT_SERVICE_ACCOUNT_EMAILS || '')
    .split(',')
    .some(entry => entry.trim().toLowerCase() === target)
}

/** Whether a user's questions count against the daily limit. */
export function isRateLimited(user: { role?: string | null, email?: string | null }): boolean {
  return user.role !== 'admin' && !isServiceAccount(user.email)
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function checkRateLimit(userId: string): Promise<{ allowed: boolean, remaining: number, limit: number }> {
  const limit = dailyMessageLimit()
  const date = todayKey()
  const count = await appKvGet<number>(KV_KEYS.rateLimit(userId, date)) ?? 0

  if (count >= limit) {
    return { allowed: false, remaining: 0, limit }
  }

  return { allowed: true, remaining: limit - count, limit }
}

/** Counts one completed question. Called once per question, from POST /api/chats/:id only. */
export async function incrementRateLimit(userId: string): Promise<void> {
  const date = todayKey()
  const key = KV_KEYS.rateLimit(userId, date)
  const count = await appKvGet<number>(key) ?? 0
  await appKvSet(key, count + 1, { ttl: 86400 })
}
