import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { log } from 'evlog'

/**
 * Applies Drizzle migrations at boot.
 *
 * NuxtHub normally applies migrations during the build, but the production
 * database is not reachable from the Docker build, so `applyMigrationsDuringBuild`
 * is disabled and the work happens here instead.
 *
 * The migration list is read from Drizzle's journal rather than hardcoded: the
 * previous version enumerated files by hand and had silently fallen behind the
 * journal, leaving `app_kv` (sessions, rate limits, sync status) uncreated.
 */

const hasExternalDatabase = Boolean(process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || process.env.DATABASE_URL)
const pgliteDataDir = process.env.NUXT_HUB_PGLITE_DIR || '.data/db/pglite'

interface JournalEntry {
  idx: number
  tag: string
}

/** Postgres error states meaning "this object already exists" — safe to skip. */
const ALREADY_EXISTS_CODES = new Set([
  '42P07', // duplicate_table
  '42710', // duplicate_object
  '42701', // duplicate_column
  '42P16', // invalid_table_definition
  '42723', // duplicate_function
])

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: string })?.code
  if (code && ALREADY_EXISTS_CODES.has(code)) return true
  return /already exists/i.test(error instanceof Error ? error.message : String(error))
}

function splitMigration(migration: string): string[] {
  return migration
    .split('--> statement-breakpoint')
    .map(statement => statement.trim())
    .filter(Boolean)
}

function resolveMigrationDir(): string | null {
  const candidates = [
    process.env.DATABASE_MIGRATIONS_DIR,
    join(process.cwd(), 'server/db/migrations/postgresql'),
    join(process.cwd(), 'db/migrations/postgresql'),
    join(process.cwd(), 'apps/app/server/db/migrations/postgresql'),
  ].filter((path): path is string => Boolean(path))

  return candidates.find(candidate => existsSync(join(candidate, 'meta', '_journal.json'))) ?? null
}

async function readJournal(dir: string): Promise<JournalEntry[]> {
  const journal = JSON.parse(await readFile(join(dir, 'meta', '_journal.json'), 'utf8')) as { entries?: JournalEntry[] }
  return (journal.entries ?? []).slice().sort((a, b) => a.idx - b.idx)
}

async function ensureMigrationTable(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "_acuity_migrations" (
      "name" text PRIMARY KEY NOT NULL,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )
  `))
}

async function appliedMigrations(): Promise<Set<string>> {
  const result = await db.execute(sql.raw('SELECT "name" FROM "_acuity_migrations"')) as unknown
  const rows = Array.isArray(result)
    ? result
    : ((result as Record<string, unknown>)['rows'] as unknown[] | undefined) ?? []

  return new Set(rows.map(row => (row as Record<string, unknown>).name as string))
}

export default defineNitroPlugin(async () => {
  if (hasExternalDatabase) {
    await mkdir(pgliteDataDir, { recursive: true }).catch(() => {})
  } else {
    await mkdir(pgliteDataDir, { recursive: true })
  }

  const migrationDir = resolveMigrationDir()
  if (!migrationDir) {
    log.warn('db', 'No Drizzle migrations found; skipping boot-time migration')
    return
  }

  const entries = await readJournal(migrationDir)
  await ensureMigrationTable()
  const applied = await appliedMigrations()

  const pending = entries.filter(entry => !applied.has(entry.tag))
  if (pending.length === 0) {
    log.info('db', `Database schema up to date (${entries.length} migrations)`)
    return
  }

  log.info('db', `Applying ${pending.length} pending migration(s): ${pending.map(e => e.tag).join(', ')}`)

  for (const entry of pending) {
    const migration = await readFile(join(migrationDir, `${entry.tag}.sql`), 'utf8')

    for (const statement of splitMigration(migration)) {
      try {
        await db.execute(sql.raw(statement))
      } catch (error) {
        // Better Auth and a previous partial run can both pre-create objects.
        // Skipping "already exists" keeps boot idempotent; anything else is fatal.
        if (!isAlreadyExists(error)) {
          log.error('db', `Migration ${entry.tag} failed: ${error instanceof Error ? error.message : String(error)}`)
          throw error
        }
        log.warn('db', `Migration ${entry.tag}: skipped existing object`)
      }
    }

    await db.execute(sql`INSERT INTO "_acuity_migrations" ("name") VALUES (${entry.tag}) ON CONFLICT DO NOTHING`)
    log.info('db', `Applied migration ${entry.tag}`)
  }
})
