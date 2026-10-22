import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

interface AppKvSetOptions {
  ttl?: number
}

export async function appKvGet<T>(key: string): Promise<T | null> {
  const now = new Date()
  const row = await db.query.appKv.findFirst({
    where: and(
      eq(schema.appKv.key, key),
      or(isNull(schema.appKv.expiresAt), gt(schema.appKv.expiresAt, now)),
    ),
  })

  return row ? row.value as T : null
}

export async function appKvSet(key: string, value: unknown, options?: AppKvSetOptions): Promise<void> {
  const now = new Date()
  const expiresAt = options?.ttl ? new Date(now.getTime() + options.ttl * 1000) : null

  await db.insert(schema.appKv)
    .values({
      key,
      value,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.appKv.key,
      set: {
        value,
        expiresAt,
        updatedAt: now,
      },
    })
}

export async function appKvDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return

  await db.delete(schema.appKv)
    .where(inArray(schema.appKv.key, keys))
}
