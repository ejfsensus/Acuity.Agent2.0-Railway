import { KV_KEYS } from './sandbox/types'
import { appKvGet, appKvSet } from './app-kv'

const DAILY_MESSAGE_LIMIT = 15

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function checkRateLimit(userId: string): Promise<{ allowed: boolean, remaining: number, limit: number }> {
  const date = todayKey()
  const count = await appKvGet<number>(KV_KEYS.rateLimit(userId, date)) ?? 0

  if (count >= DAILY_MESSAGE_LIMIT) {
    return { allowed: false, remaining: 0, limit: DAILY_MESSAGE_LIMIT }
  }

  return { allowed: true, remaining: DAILY_MESSAGE_LIMIT - count, limit: DAILY_MESSAGE_LIMIT }
}

export async function incrementRateLimit(userId: string): Promise<void> {
  const date = todayKey()
  const key = KV_KEYS.rateLimit(userId, date)
  const count = await appKvGet<number>(key) ?? 0
  await appKvSet(key, count + 1, { ttl: 86400 })
}
