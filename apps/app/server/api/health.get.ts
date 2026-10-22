import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { SANDBOX_ROOT } from '../utils/sandbox/local'

/**
 * GET /api/health
 * Liveness/readiness probe for the container HEALTHCHECK and Railway's health check.
 * Unauthenticated on purpose so the platform can reach it; exposes no internals.
 */
export default defineEventHandler(async (event) => {
  const checks: Record<string, 'ok' | 'error'> = { database: 'ok' }

  try {
    await db.execute(sql`SELECT 1`)
  } catch {
    checks.database = 'error'
  }

  const knowledgeBase = existsSync(join(SANDBOX_ROOT, '.git')) || existsSync(join(SANDBOX_ROOT, 'docs/sacred-texts/ATTRIBUTION.txt')) ? 'ready' : 'empty'

  const healthy = checks.database === 'ok'

  setResponseStatus(event, healthy ? 200 : 503)

  return {
    status: healthy ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    checks,
    knowledgeBase,
  }
})
