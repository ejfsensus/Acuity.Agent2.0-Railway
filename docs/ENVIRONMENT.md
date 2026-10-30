# Environment variables

Production runs on Railway. See [Railway deployment](RAILWAY-DEPLOYMENT.md) for resource IDs, deployment commands, and verification. Local development loads `apps/app/.env`; Railway loads service variables. Editing a local file does not update the deployed service. Apply Railway variable changes with a successful deployment.

## Authentication and database

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Random session-signing secret; generate with `openssl rand -hex 32`. |
| `NUXT_BETTER_AUTH_SECRET` | Set to the same secret in production. Nuxt uses this runtime variable to replace the image's build placeholder. |
| `BETTER_AUTH_URL` | Canonical origin: `https://agent.acuity.institute` in production. |
| `NUXT_PUBLIC_SITE_URL` | The same canonical origin for browser auth, callbacks, links, and attachments. Use `http://localhost:3000` locally. |
| `PUBLIC_SIGNUP_ENABLED` | Defaults to `false`. Prepared public email/password registration and authenticated-user access; keep closed until BYOK enforcement is implemented. |
| `AUTHORIZED_USER_EMAILS` | Comma-separated access allowlist; defaults to `developments@sensusinvista.ltd`. |
| `POSTGRES_URL` | Railway Postgres connection string. `POSTGRESQL_URL` and `DATABASE_URL` are accepted aliases. |

The allowlist does not create an account. Public signup remains disabled in the deployed environment. See [BYOK and signup rollout](plans/BYOK-AUTH-API.md) before activating the prepared switch. Existing email/password accounts persist in Postgres. Startup applies the migration journal, including authentication ID defaults and application KV tables. PGlite is a development fallback. Production images must build with `NUXT_HUB_DB_DRIVER=postgres-js` as configured in the Dockerfile.

GitHub login is optional and separate from repository synchronization:

| Variable | Purpose |
| --- | --- |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub user authentication credentials (kept as a fallback during unified login). |
| `ACUITY_OIDC_ISSUER`, `ACUITY_OIDC_CLIENT_ID`, `ACUITY_OIDC_CLIENT_SECRET` | Unified login through the Acuity identity provider (`https://auth.acuity.institute/api/auth`). Register the "agent" application in the IdP admin; redirect URI `<BETTER_AUTH_URL>/api/auth/callback/acuity`. New identities need `email_verified` and must pass `AUTHORIZED_USER_EMAILS` (unless public sign-up). Existing accounts link by verified email. |
| `AUTH_LOCAL_LOGIN_ENABLED` | Email/password sign-in fallback. Default on; `false` hides the form and blocks `/api/auth/sign-in/email` only while the Acuity IdP is configured. |
| `NUXT_PUBLIC_GITHUB_LOGIN_ENABLED=true` | Runtime flag displaying GitHub sign-in. |

Configure the GitHub callback as `https://agent.acuity.institute/api/auth/callback/github`. The GitHub App installation ID/private key used for source access does not replace the login client credentials.

## AI provider

The production service uses DeepSeek's OpenAI-compatible API:

| Variable | Production value or purpose |
| --- | --- |
| `AI_PROVIDER` | `openai-compatible` |
| `OPENAI_COMPATIBLE_BASE_URL` | `https://api.deepseek.com` |
| `OPENAI_COMPATIBLE_API_KEY` | Private provider API key. |
| `OPENAI_COMPATIBLE_NAME` | Optional provider namespace; defaults to `openai-compatible`. |
| `OPENAI_COMPATIBLE_MODELS` | `deepseek-flash,deepseek-v4-pro` |
| `OPENAI_COMPATIBLE_DEFAULT_MODEL` | `deepseek-flash` |
| `OPENAI_COMPATIBLE_ROUTER_MODEL` | Optional helper model; defaults to the main model. |
| `NUXT_PUBLIC_AI_MODELS` | The same model IDs for the browser picker. |
| `NUXT_PUBLIC_AI_DEFAULT_MODEL` | `deepseek-flash` |
| `NUXT_PUBLIC_AI_PROVIDER_NAME` | Display label, e.g. `DeepSeek`. |
| `BRAVE_API_KEY` | Optional web search and evidence retrieval. |

Generic aliases `AI_BASE_URL`, `AI_API_KEY`, `AI_MODELS`, `AI_DEFAULT_MODEL`, and `AI_ROUTER_MODEL` are also accepted. Keep model IDs valid for the selected provider. Gateway mode instead requires `AI_GATEWAY_API_KEY` on Railway; Railway does not supply Vercel OIDC credentials.

The selected chat model is passed into the agent call. DeepSeek final synthesis disables further tool use and thinking, and explicitly requests an answer using the retrieved evidence.

## Structured sacred-text retrieval

The agent's `sacred-text-mcp` tool uses the Sacred Text Library REST API alongside local grep. Set `SACRED_TEXT_API_KEY` to that service's `MCP_AUTH_TOKEN` and optionally set `SACRED_TEXT_API_URL` (default `https://sacred-text-mcp-vector.up.railway.app`). Both are server-side Railway service variables; the key must never use a `NUXT_PUBLIC_*` name. The app runs in a different project/environment, so it uses the public HTTPS endpoint rather than the library's private Railway hostname.

The tool supports semantic and exact-phrase searches, balanced tradition comparisons, parallels, passage context, sequential reading, book/tradition discovery and index status. It exposes no ingestion, administration or remote answer-generation operation. Passage IDs, source URLs, citations, scores and pagination are retained for Acuity's final synthesis. The passage index is a subset of the larger mounted corpus; grep remains necessary for other texts, including the Ancient Wisdom Atlas expansion. Requests time out after 60 seconds; failures fall back to grep through the agent's research instructions. Semantic routes share the library's embedding quota; keyword, passage and catalog operations do not use that quota.

## Library and source synchronization

The image downloads the bundled corpus from a pinned commit of this repository. Startup mounts it on the persistent volume at `/vercel/sandbox/docs/sacred-texts`; it is usable before another repository is configured. Its revision is `local-<LIBRARY_STAMP>`.

| Variable | Purpose |
| --- | --- |
| `SANDBOX_ROOT` | Persistent volume root; keep `/vercel/sandbox` for SDK compatibility. |
| `NUXT_GITHUB_SNAPSHOT_REPO` | Optional existing `owner/repo` containing an additional knowledge tree. Also configurable in Admin → Sandbox. |
| `NUXT_GITHUB_SNAPSHOT_BRANCH` | Remote branch; default `main`. |
| `NUXT_GITHUB_TOKEN` | Optional PAT for private pulls and snapshot publishing. |
| `NUXT_GITHUB_APP_ID`, `NUXT_GITHUB_APP_PRIVATE_KEY` | Optional alternative GitHub App authentication. PEM keys may contain literal newlines or be base64-encoded. |
| `NUXT_YOUTUBE_API_KEY` | Required for YouTube source listing. |

Public repositories can be pulled without credentials. Publishing aggregated sources requires write access to the configured snapshot repository. Pull-only configuration does not create a repository. Source failures and push failures mark a sync failed; uploaded originals remain available for retries.

Agent commands run in a read-only virtual filesystem with no host-process execution or network. Trusted Git synchronization uses a separate executor. Run one application replica against the shared volume. Interrupted in-process sync jobs are marked failed on restart and can be rerun.

## Uploads and application state

| Variable | Purpose |
| --- | --- |
| `AWS_ENDPOINT_URL`, `AWS_REGION`, `AWS_BUCKET_NAME` | Railway bucket endpoint, signing region, and bucket name. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Private S3-compatible bucket credentials. |
| `BLOB_SIGNING_SECRET` | Optional independent file-link signing secret; falls back to the auth secret. |
| `EVLOG_TRANSPORT_ENABLED` | Set `true` to retain request logs in the database. |
| `REDIS_URL` | Optional durable bot state. Application KV, rate limits, sandbox sessions, and sync status already persist in Postgres. |

Uploads remain private in object storage. The app serves signed file links at `/api/files/...`; deletion revokes a link. Vercel Blob tokens are not used.

## Optional bots and SDK access

GitHub bot variables are `NUXT_PUBLIC_GITHUB_APP_NAME` (the app slug), optional `NUXT_PUBLIC_GITHUB_BOT_TRIGGER`, `NUXT_GITHUB_APP_ID`, `NUXT_GITHUB_APP_PRIVATE_KEY`, and `NUXT_GITHUB_WEBHOOK_SECRET`. The webhook URL is `https://agent.acuity.institute/api/webhooks/github`. Posting replies requires the relevant GitHub App installation permissions.

Discord uses `NUXT_DISCORD_BOT_TOKEN`, `NUXT_DISCORD_PUBLIC_KEY`, `NUXT_DISCORD_APPLICATION_ID`, optional `NUXT_DISCORD_MENTION_ROLE_IDS`, and optional `NUXT_PUBLIC_DISCORD_BOT_URL`. Enable its gateway only deliberately with `DISCORD_GATEWAY_ENABLED=true`.

See [External API access](EXTERNAL-API.md) for personal keys, JSON corpus retrieval, hosted-agent SSE and caller-owned provider billing.

External SDK clients use `SAVOIR_API_URL=https://agent.acuity.institute` and an administrator-created `SAVOIR_API_KEY`. Never commit real secrets or put them in `NUXT_PUBLIC_*` variables.
