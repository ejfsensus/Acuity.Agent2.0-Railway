# syntax=docker/dockerfile:1

# Download the full records library on Railway rather than uploading it with
# every CLI deployment. Pin the commit so builds use a reproducible library.
FROM node:20-bookworm-slim AS library
ARG LIBRARY_REVISION=57630aed3acc90a90cf0d71d4e8ce47396b058f4
ADD https://codeload.github.com/ejfsensus/Acuity.Agent2.0-Railway/tar.gz/${LIBRARY_REVISION} /tmp/library.tar.gz
RUN mkdir -p /library \
 && tar -xzf /tmp/library.tar.gz -C /library --strip-components=2 --wildcards '*/Texts/sacred_texts_archive/*' \
 && test -s /library/sacred_texts_archive/LIBRARY_STAMP \
 && rm /tmp/library.tar.gz

# ---------------------------------------------------------------------------
# Builder — Bun monorepo build (packages/* then apps/app)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14 AS bun

FROM node:20-bookworm-slim AS builder
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
WORKDIR /app

# Placeholders so the build does not require runtime secrets.
# Migrations are deferred to boot (applyMigrationsDuringBuild: false), so the
# database is never contacted during the image build.
# NUXT_HUB_DB_DRIVER keeps the bundle on postgres-js: without it NuxtHub sees no
# POSTGRES_URL here and bakes in an embedded PGlite client that would ignore the
# real database at runtime while still reporting a healthy /api/health.
# These must be set before install: apps/app postinstall runs `nuxt prepare`.
ENV HUSKY=0 \
    CI=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    BETTER_AUTH_SECRET=build-time-placeholder-replaced-at-runtime \
    NITRO_PRESET=node-server \
    NUXT_HUB_DB_DRIVER=postgres-js \
    NODE_OPTIONS=--max-old-space-size=4096

# Full source first. `bun install` runs the root prepare script
# (`turbo run build --filter=./packages/*`), which needs turbo.json and the
# package sources. Installing from manifests alone fails with
# "Could not find turbo.json or turbo.jsonc".
COPY . .

RUN bun install --frozen-lockfile
RUN cd apps/app && bun run build

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
      util-linux \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/apps/app/.output ./.output
COPY --from=builder /app/apps/app/server/db/migrations/postgresql ./migrations/postgresql
COPY --from=library /library/sacred_texts_archive /app/library/sacred-texts

# Knowledge base clone lives on a mounted Railway volume so restarts do not
# re-clone. Created here so the app works before a volume is attached.
RUN mkdir -p /vercel/sandbox

EXPOSE 3000

# The process starts as root so the entrypoint can chown the Railway volume,
# then drops to nodeapp. The image USER stays root for that reason.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --home /app nodeapp \
 && chown -R nodeapp:nodejs /app /vercel/sandbox

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
