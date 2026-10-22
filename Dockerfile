# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Builder — Bun monorepo build (packages/* then apps/app)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14 AS builder
WORKDIR /app

ENV HUSKY=0 \
    CI=1

# Dependency manifests first for layer caching
COPY package.json bun.lock ./
COPY patches ./patches
COPY apps/app/package.json ./apps/app/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/agent/package.json ./packages/agent/
COPY packages/github/package.json ./packages/github/

RUN bun install --frozen-lockfile

COPY . .

# Placeholders so the build does not require runtime secrets.
# Migrations are deferred to boot (applyMigrationsDuringBuild: false), so the
# database is never contacted during the image build.
# NUXT_HUB_DB_DRIVER keeps the bundle on postgres-js: without it NuxtHub sees no
# POSTGRES_URL here and bakes in an embedded PGlite client that would ignore the
# real database at runtime while still reporting a healthy /api/health.
ENV BETTER_AUTH_SECRET=build-time-placeholder-replaced-at-runtime \
    NITRO_PRESET=node-server \
    NUXT_HUB_DB_DRIVER=postgres-js \
    NODE_OPTIONS=--max-old-space-size=4096

RUN bun run prepare \
 && cd apps/app \
 && bun run build

# ---------------------------------------------------------------------------
# Runtime — long-lived Node service
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NITRO_PRESET=node-server \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    PORT=3000 \
    SANDBOX_ROOT=/vercel/sandbox \
    SACRED_TEXTS_DIR=/app/library/sacred-texts \
    DATABASE_MIGRATIONS_DIR=/app/migrations/postgresql

# The agent searches the knowledge base with a fixed allow-list of read-only
# shell tools (find/grep/cat/tree/awk/sed/...). They must exist in the image,
# otherwise sandboxed commands fail with "command not found".
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      git \
      grep \
      sed \
      gawk \
      findutils \
      diffutils \
      coreutils \
      tree \
      file \
      less \
      bsdextrautils \
      procps \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/apps/app/.output ./.output
COPY --from=builder /app/apps/app/server/db/migrations/postgresql ./migrations/postgresql
COPY --from=builder /app/Texts/sacred_texts_archive /app/library/sacred-texts

# Knowledge base clone lives on a mounted Railway volume so restarts do not
# re-clone. Created here so the app works before a volume is attached.
RUN mkdir -p /vercel/sandbox

EXPOSE 3000

# Non-root runtime; the sandbox root must be writable by this user.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --home /app nodeapp \
 && chown -R nodeapp:nodejs /app /vercel/sandbox
USER nodeapp

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", ".output/server/index.mjs"]
