# Railway Deployment

> Back to [README](../README.md) | See also: [Environment](./ENVIRONMENT.md), [Architecture](./ARCHITECTURE.md)

Status, the fix that had to land before this could ship, and the exact protocol to run once Railway accepts deploys again.

---

## 1. Status snapshot

**As of 2026-10-21 — deployment BLOCKED by Railway. Code is deploy-ready.**

| Item | State |
|------|-------|
| Code review | Complete |
| Critical DB-driver bug | Found, fixed, verified by local production build |
| Production build | Passes (`✨ Build complete!`, 55.2 MB output) |
| Railway project `acuity-agent` | **Not created** — API rejects project creation |
| Postgres / volume / variables | **Not provisioned** |
| Deployed service | **None** — nothing to roll back or clean up |

### The blocker

`railway init` exits `1` and creates nothing:

```
> Select a workspace SensusInVista
> Project Name acuity-agent
Deploys have been paused temporarily
```

Reproduced three times, including with `--json` and an explicit workspace ID
(`b1a660bb-3eca-475c-8d76-6b0d0d089f6e`). This is server-side, not local:

- Reads succeed — `railway whoami` and `railway project list --json` both work and return all 24 SensusInVista projects, so auth is valid.
- The string `Deploys have been paused` appears in neither the CLI's JS wrapper nor its 13 MB native binary, so it is returned by Railway's API.
- Railway CLI in use: `5.71.0`.

No workaround was attempted that would leave stray resources in the account. Retry `railway init` periodically; everything below is ready to run the moment it succeeds.

---

## 2. The fix that had to land first (critical)

**Symptom it prevented:** a service that reports *healthy* while silently running on an embedded database that is wiped on every redeploy.

NuxtHub resolves the database driver **at build time** and bakes the choice into the server bundle. The Docker builder sets no `POSTGRES_URL`, so `apps/app/nuxt.config.ts` fell through to its PGlite branch and the production image shipped:

```js
// BEFORE — apps/app/.output/server/node_modules/@nuxthub/db/db.mjs
import { drizzle } from 'drizzle-orm/pglite'
const db = drizzle({ connection: {"dataDir":".data/db/pglite","url":""}, schema })
```

`url` is frozen as `""`. The runtime `POSTGRES_URL` that Railway injects is **never read** — the only reference to it in the entire server bundle was the boot-migration plugin's boolean. Consequences if this had shipped:

1. All users, sessions, chats, sources, and usage rows live in PGlite inside the container filesystem.
2. The managed Postgres sits provisioned and unused.
3. `/api/health` runs `SELECT 1` against PGlite, which succeeds → returns **200** → Railway marks the service healthy and the `ON_FAILURE` restart policy never trips.
4. Every redeploy or restart destroys all data.

**The fix** — two files:

- `Dockerfile` (builder stage) now sets `NUXT_HUB_DB_DRIVER=postgres-js`.
- `apps/app/nuxt.config.ts` forces the `postgres-js` driver but **deliberately omits `connection.url`** when forced.

Omitting the URL matters. NuxtHub inlines `connection.url` into the bundle when it is present, so passing a build-time URL would freeze a placeholder into the image (and leak a real secret if one were set). Left unset, NuxtHub emits the lazy runtime-env client:

```js
// AFTER
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
const url = process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL, POSTGRES_URL, or POSTGRESQL_URL required')
```

Now a missing connection string fails loudly and `/api/health` returns **503**, instead of silently passing on the wrong database.

**Verified** by rebuilding with the Dockerfile's exact env:

```
[info] [nuxt:hub] `hub:db` using `postgresql` database with `postgres-js` driver
✨ Build complete!
```

> Cosmetic, no action needed: NuxtHub's internal `defu` still spreads an inert `dataDir` (an absolute build path) into the `postgres()` options. The `postgres` package ignores unknown keys. It does embed a build path in the bundle.

**Invariant going forward:** `NUXT_HUB_DB_DRIVER=postgres-js` must be present in the *builder* stage. It is not needed at runtime — the driver is compiled in. If the Dockerfile build stage is ever restructured, keep it.

---

## 3. What is already prepared in-repo

| File | Role |
|------|------|
| `railway.json` | `DOCKERFILE` builder, start `node .output/server/index.mjs`, healthcheck `/api/health` (300 s), `ON_FAILURE` ×5, `numReplicas: 1` |
| `Dockerfile` | `oven/bun:1.3.14` builder → `node:20-bookworm-slim` runtime; non-root uid 1001; `EXPOSE 3000`; container `HEALTHCHECK` via curl |
| `.dockerignore` | Excludes `node_modules`, `.env*`, `docs`, `*.md` (this file never ships) |

Reviewed and correct as-is:

- The Dockerfile copies exactly the three workspace members present in `bun.lock` (`packages/sdk`, `packages/agent`, `packages/github`). `packages/cli` is empty and absent from the lockfile, so omitting it is right.
- Playwright declares no install script (`scripts: {}`), so no browser download stalls the build.
- Runtime env baked into the image: `NITRO_PRESET=node-server`, `NITRO_HOST=0.0.0.0`, `NITRO_PORT=3000`, `SANDBOX_ROOT=/vercel/sandbox`, `DATABASE_MIGRATIONS_DIR=/app/migrations/postgresql`.
- The read-only shell allow-list the agent needs (`bash`, `git`, `grep`, `sed`, `gawk`, `findutils`, `tree`, `file`, …) is installed in the runtime image.
- Migrations run at **boot** via `server/plugins/00-database-migrations.ts`, tracked in an `_acuity_migrations` table and idempotent on "already exists" errors. Four migrations: `0000_wild_vin_gonzales`, `0001_apikey_v2`, `0002_elite_absorbing_man`, `0003_chemical_dorian_gray`.

---

## 4. Deployment protocol

Run from the repo root. Telemetry prefixes are omitted for readability; add them if you want the calls attributed to the skill.

### Step 0 — Preflight

```bash
cd /Users/ethanjfarrell/workspace/acuity-agent
railway --version          # 5.71.0 known-good
railway whoami --json      # confirm SensusInVista is reachable
```

### Step 1 — Create the project

```bash
railway init --name acuity-agent --workspace SensusInVista
```

Create it as a **new** project. Do not reuse the pre-existing, unrelated `acuity-institute` project (`c1e91880-9c91-49c9-ab3a-6dd52be8edea`).

Confirm the link took — `railway init` has previously printed the project name and still exited `1`:

```bash
railway status --json
```

### Step 2 — Provision Postgres

```bash
railway add --database postgres
railway service list --json    # note the exact service name; refs are case-sensitive
```

Wire it to the app service (adjust `Postgres` if the service was named differently):

```bash
railway variable set POSTGRES_URL='${{Postgres.DATABASE_URL}}' --service <app-service>
```

Use single quotes so Railway expands the reference server-side rather than the shell.

### Step 3 — Attach the volume (dashboard only)

The CLI has **no** `volume` subcommand — verified against `railway --help`. In the dashboard: service → Settings → Mount Volume, mount path `/vercel/sandbox`.

This keeps the cloned knowledge base across restarts, which is what `SANDBOX_ROOT` expects. `/api/health` reports `knowledgeBase: "empty"` until a repo is cloned into it, and `"ready"` once `<SANDBOX_ROOT>/.git` exists.

> A volume pins the service to **one replica**. Keep `numReplicas: 1` in `railway.json`; scaling out will fail to schedule.

### Step 4 — Required variables

```bash
railway variable set \
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  AUTHORIZED_USER_EMAILS=developments@sensusinvista.ltd \
  --service <app-service>
```

`BETTER_AUTH_SECRET` **must be at least 32 characters or the build fails** — `@onmax/nuxt-better-auth` throws `BETTER_AUTH_SECRET must be at least 32 characters for security` during `nuxt build`. The Dockerfile's build-time placeholder is 42 characters and is replaced at runtime; do not shorten it.

`NUXT_PUBLIC_SITE_URL` can be left unset initially — `nuxt.config.ts` derives it from `RAILWAY_PUBLIC_DOMAIN`. Set it explicitly in Step 6 once the domain is known, since Better Auth uses it for OAuth callbacks.

### Step 5 — Deploy

This directory is **not a git repo** (no `.git`), so a GitHub-source service is not an option. Deploy by CLI upload:

```bash
railway up --detach -m "initial deploy (postgres-js driver fix)"
railway logs --lines 200        # watch the build, then boot migrations
```

Upload respects `.gitignore`/`.railwayignore`; `node_modules` and `.env*` are already excluded. The build runs in Railway's Docker builder, so the local `.output` is irrelevant — it is not uploaded or used.

### Step 6 — Domain and site URL

```bash
railway domain                        # generate/list the public hostname
railway variable set NUXT_PUBLIC_SITE_URL=https://<hostname> --service <app-service>
```

Setting a variable triggers a redeploy; that is expected.

### Step 7 — Verify (do not skip)

A green health check is **not** sufficient on its own — that is precisely how the PGlite bug would have hidden. Confirm the app is really on Postgres:

```bash
curl -s https://<hostname>/api/health
# expect: {"status":"ok",...,"checks":{"database":"ok"},...}

railway logs --lines 200 | grep -i migration
# expect: "Applying 4 pending migration(s)" then "Applied migration ..."
```

Then prove the tables exist in **Postgres**, not in an embedded DB. `railway connect` opens an interactive psql shell, so run it yourself:

```bash
railway connect          # then: \dt
```

You should see `_acuity_migrations` alongside the Better Auth tables (`user`, `session`, `apikey`, …). If Postgres is empty while `/api/health` returns `ok`, the image reverted to PGlite — re-check that `NUXT_HUB_DB_DRIVER=postgres-js` is in the Dockerfile builder stage and rebuild.

---

## 5. AI provider variables (pending)

Decision: an **OpenAI-compatible** endpoint. Vercel AI Gateway OIDC does not exist on Railway, and without credentials the app boots healthy but every chat request fails. `getAIProviderKind()` in `packages/agent/src/router/schema.ts` switches to compatible mode when `AI_PROVIDER=openai-compatible` or when `OPENAI_COMPATIBLE_BASE_URL` is set.

```bash
railway variable set \
  AI_PROVIDER=openai-compatible \
  OPENAI_COMPATIBLE_BASE_URL=<base-url> \
  OPENAI_COMPATIBLE_API_KEY=<key> \
  OPENAI_COMPATIBLE_MODELS=<model-a,model-b> \
  OPENAI_COMPATIBLE_DEFAULT_MODEL=<model-a> \
  --service <app-service>
```

Optional: `OPENAI_COMPATIBLE_ROUTER_MODEL` (falls back to the default model) and `OPENAI_COMPATIBLE_NAME` (provider label surfaced in the UI).

---

## 6. Optional extras (declined for now)

| Feature | Enable with | Notes |
|---------|-------------|-------|
| File uploads | `railway bucket create <name> --region <r>`, then set `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`, `AWS_REGION` | `hub.blob` is `false`; `server/utils/blob.ts` is an S3 shim with `forcePathStyle: true` for Railway Buckets |
| Durable KV / cache | Provision Redis, set `REDIS_URL` | `hub.kv` is enabled only when `REDIS_URL` is present |
| Web search | `BRAVE_API_KEY` | Powers the `web_search` tool |
| GitHub OAuth login | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NUXT_PUBLIC_GITHUB_LOGIN_ENABLED=true` | Login otherwise falls back to the email allowlist |

---

## 7. Constraints and gotchas

- **Not a git repo.** No `.git` directory, so no repo-based deploys or CI. Also, invoking `git` on this machine triggers an `xcode-select` developer-tools install prompt and fails — avoid `git` here until Command Line Tools are installed.
- **One replica only** while the `/vercel/sandbox` volume is attached.
- **Driver is build-time.** Changing `POSTGRES_URL` at runtime cannot switch drivers; a rebuild is required if `NUXT_HUB_DB_DRIVER` is ever dropped.
- **Build secret length.** `BETTER_AUTH_SECRET` ≥ 32 chars at build time or `nuxt build` aborts.
- **`railway init` is not trustworthy on its own output.** Always confirm with `railway status --json` / `railway project list --json`.
- **`.dockerignore` excludes `docs` and `*.md`** (except `README.md`), so this file is never in the image.

## 8. Troubleshooting

| Symptom | Cause / action |
|---------|----------------|
| `Deploys have been paused temporarily` on `railway init` | Railway platform-side block. Wait and retry; reads still work so auth is not the issue. |
| Build fails: `BETTER_AUTH_SECRET must be at least 32 characters` | Build-time placeholder shortened. Restore a ≥32-char value in the Dockerfile builder stage. |
| `/api/health` returns 503 with `checks.database: "error"` | `POSTGRES_URL` unset or unreachable. Verify the variable reference and that the Postgres service is running. |
| Health `ok` but Postgres has no tables | Image built on PGlite. Confirm `NUXT_HUB_DB_DRIVER=postgres-js` in the builder stage, rebuild, redeploy. |
| `Could not initialise sandbox root at /vercel/sandbox` | Volume not mounted or not writable by uid 1001. Re-check the mount path and permissions. |
| Chat requests fail while the app is otherwise healthy | AI variables missing — see section 5. |
| Deployment crash-loops | `restartPolicyMaxRetries: 5` then stops. Read `railway logs` for the boot-migration or auth error before retrying. |
