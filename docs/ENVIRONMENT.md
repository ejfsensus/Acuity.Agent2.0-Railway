# Environment Variables

> Back to [README](../README.md) | See also: [Architecture](./ARCHITECTURE.md), [Customization](./CUSTOMIZATION.md)

Copy the example file and fill in the values:

```bash
cp apps/app/.env.example apps/app/.env
```

## Quick Start (minimum required)

| Variable | How to get it |
|----------|---------------|
| `BETTER_AUTH_SECRET` | Run `openssl rand -hex 32` in your terminal |
| `NUXT_PUBLIC_SITE_URL` | Public app URL, for example `https://acuity-agent.vercel.app` |
| `POSTGRES_URL` or `DATABASE_URL` | Attach Neon/Postgres in the Vercel project storage settings |

These variables are all you need for persistent email/password admin login on Vercel. GitHub OAuth login additionally needs `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. For **local development**, you also need `AI_GATEWAY_API_KEY` (see [AI](#ai) below). Everything else is optional.

## Authentication

### `BETTER_AUTH_SECRET` (required)

Random secret used by [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables) to sign sessions and tokens. Generate one with:

```bash
openssl rand -hex 32
```

### `NUXT_PUBLIC_SITE_URL` (required for OAuth)

The public origin Better Auth should use for browser clients and OAuth callbacks. In local dev this can be `http://localhost:3020`; in Vercel set it to the deployed project URL or custom domain.

### `BETTER_AUTH_API_KEY` (optional)

API key for Better Auth Infra / hosted Better Auth app management. Keep it out of git and add it as a Vercel environment variable only if the hosted Better Auth integration needs it at runtime.

### `AUTHORIZED_USER_EMAILS` (optional)

Comma-separated allowlist for users who can access the development app and token-consuming API endpoints. Defaults to `developments@sensusinvista.ltd`.

### `POSTGRES_URL` / `DATABASE_URL` (required on Vercel)

Persistent database URL used by NuxtHub, Better Auth, sources, chats, and usage tables. Attach Neon/Postgres through the Vercel dashboard and redeploy after Vercel adds the database env vars.

Without one of these env vars, production falls back to temporary PGlite storage and accounts or source records should not be considered durable across cold starts.

### `NUXT_PUBLIC_GITHUB_LOGIN_ENABLED` / `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (required for GitHub OAuth)

GitHub OAuth credentials for user login. Keep `NUXT_PUBLIC_GITHUB_LOGIN_ENABLED=false` until both credentials are present and the callback URL is configured. You need a **GitHub App** (not an OAuth App) — the same app can also power the GitHub bot later.

1. Go to [**GitHub Settings → Developer settings → GitHub Apps → New GitHub App**](https://github.com/settings/apps/new)
2. Fill in:
   - **App name**: your bot name (e.g. `my-agent`)
   - **Homepage URL**: your instance URL (or `http://localhost:3000` for dev)
   - **Callback URL**: `<your-url>/api/auth/callback/github`
3. Under **Account permissions**, set **Email addresses** → Read-only
4. Create the app, then from the app settings page:
   - Copy the **Client ID** → `GITHUB_CLIENT_ID`
   - Click **Generate a new client secret** → `GITHUB_CLIENT_SECRET`
   - Set `NUXT_PUBLIC_GITHUB_LOGIN_ENABLED=true`

> See the [Getting Started guide](https://github.com/vercel-labs/knowledge-agent-template/blob/main/apps/app/app/content/docs/getting-started.md#github-app-setup) for the full GitHub App setup with bot permissions.

### `NUXT_SESSION_PASSWORD` (optional)

Session encryption password. Auto-generated if not set.

## AI

### `AI_GATEWAY_API_KEY` (optional — required for local dev only)

API key for [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) (used by `@ai-sdk/gateway` to route to any AI model).

On **Vercel deployments**, this is not needed — the project automatically authenticates via the platform's OIDC token. You only need to set this for **local development**.

1. Go to the [Vercel AI dashboard](https://vercel.com/~/ai)
2. Create a new Gateway (or use an existing one)
3. Copy the API key → `AI_GATEWAY_API_KEY`

### OpenAI-Compatible Endpoints

By default, Acuity.Agent uses Vercel AI Gateway. To point the same app at any OpenAI-compatible endpoint, set:

| Variable | Description |
|----------|-------------|
| `AI_PROVIDER` | Set to `openai-compatible` to force compatible endpoint mode. If `OPENAI_COMPATIBLE_BASE_URL` is present, this is inferred. |
| `OPENAI_COMPATIBLE_BASE_URL` | Base API URL, usually ending in `/v1`. |
| `OPENAI_COMPATIBLE_API_KEY` | API key for the compatible provider. |
| `OPENAI_COMPATIBLE_NAME` | Provider label used internally. Defaults to `openai-compatible`. |
| `OPENAI_COMPATIBLE_MODELS` | Comma-separated model ids exposed to the app, e.g. `gpt-4o-mini,gpt-4o`. |
| `OPENAI_COMPATIBLE_DEFAULT_MODEL` | Main chat model. Defaults to the first configured model. |
| `OPENAI_COMPATIBLE_ROUTER_MODEL` | Model used for routing/title helper calls. Defaults to the main model in compatible mode. |
| `NUXT_PUBLIC_AI_MODELS` | Optional comma-separated model list shown in the model picker. Falls back to `AI_MODELS`/`OPENAI_COMPATIBLE_MODELS` at build time. |
| `NUXT_PUBLIC_AI_DEFAULT_MODEL` | Optional default shown in the model picker. |

Equivalent generic aliases are also supported: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODELS`, `AI_DEFAULT_MODEL`, and `AI_ROUTER_MODEL`.

### Brave Search Tools

| Variable | Description |
|----------|-------------|
| `BRAVE_API_KEY` | Brave Search API key used by the `web_search` and `brave_llm_context` AI SDK tools. |

## Sandbox & Sync

These control how the app syncs knowledge sources into the sandbox. All are optional — you can configure them later from the admin UI.

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_GITHUB_SNAPSHOT_REPO` | — | Snapshot repository in `owner/repo` format. Configurable from admin UI. |
| `NUXT_GITHUB_SNAPSHOT_BRANCH` | `main` | Branch to use for snapshots |
| `NUXT_GITHUB_TOKEN` | — | Fallback PAT for git operations. Only needed if GitHub App tokens are unavailable. |

## GitHub Bot (optional)

To enable the GitHub bot that responds to mentions in issues, add these from your [GitHub App settings page](https://github.com/settings/apps):

| Variable | Where to find it |
|----------|-----------------|
| `NUXT_PUBLIC_GITHUB_APP_NAME` | Your GitHub App name (e.g. `my-agent`) |
| `NUXT_PUBLIC_GITHUB_BOT_TRIGGER` | Override mention trigger (defaults to app name) |
| `NUXT_GITHUB_APP_ID` | App settings → **App ID** |
| `NUXT_GITHUB_APP_PRIVATE_KEY` | App settings → **Generate a private key** (PEM format, can be base64-encoded) |
| `NUXT_GITHUB_WEBHOOK_SECRET` | The secret you set when creating the app's webhook |

The webhook URL should be `<your-url>/api/webhooks/github`. Subscribe to **Issues** and **Issue comments** events.

### Required GitHub App permissions for the bot

| Permission | Access | Why |
|------------|--------|-----|
| Issues | Read & Write | Read issues and post replies |
| Metadata | Read-only | Required by GitHub for all apps |
| Contents | Read & Write | Push synced content (if using snapshot management) |
| Administration | Read & Write | Auto-create snapshot repos (optional, needs org approval) |

## Discord Bot (optional)

To add a Discord bot, create an app in the [Discord Developer Portal](https://discord.com/developers/applications):

| Variable | Where to find it |
|----------|-----------------|
| `NUXT_DISCORD_BOT_TOKEN` | Bot → **Reset Token** → copy |
| `NUXT_DISCORD_PUBLIC_KEY` | General Information → **Public Key** |
| `NUXT_DISCORD_APPLICATION_ID` | General Information → **Application ID** |
| `NUXT_DISCORD_MENTION_ROLE_IDS` | Comma-separated role IDs that can trigger the bot (optional) |

Set the interactions endpoint URL to `<your-url>/api/webhooks/discord`.

## YouTube (optional)

### `NUXT_YOUTUBE_API_KEY`

Required only if syncing YouTube sources (video transcripts).

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a project (or select an existing one)
3. Enable the [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy the key → `NUXT_YOUTUBE_API_KEY`

## Storage (optional)

### `BLOB_READ_WRITE_TOKEN`

[Vercel Blob](https://vercel.com/docs/storage/vercel-blob) token for file uploads. Auto-injected in Vercel deployments.

To get one manually: [Vercel Dashboard](https://vercel.com) → your project → **Storage** → **Blob** → **Connect** → copy the token.

## State (optional)

### `REDIS_URL`

Redis connection URL for durable KV/cache state such as rate limits, sandbox sessions, snapshot sync status, and bot state. Acuity.Agent can deploy without it for the initial branded app, but production knowledge-base workflows should connect a Redis-compatible store so state survives server restarts.

Any Redis-compatible provider works: [Upstash](https://upstash.com), [Redis Cloud](https://redis.io/cloud), etc.

### `VERCEL_OIDC_TOKEN`

Auto-injected in Vercel deployments. No action needed.

## SDK (`@savoir/sdk`)

When using the SDK from an external application:

| Variable | Description |
|----------|-------------|
| `SAVOIR_API_URL` | Base URL of your deployed instance (e.g. `https://your-app.vercel.app`) |
| `SAVOIR_API_KEY` | API key generated from the admin panel at `/admin/api-keys` |

## Database

Migrations run automatically when the application starts — no manual step needed.

```bash
# Generate new migrations after schema changes
bun run db:generate
```
