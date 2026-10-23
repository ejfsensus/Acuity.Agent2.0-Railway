# Railway deployment and initialization

The app runs as one long-lived Node service with managed Postgres, a persistent knowledge volume, and an S3-compatible upload bucket. Vercel Sandbox, Workflow, Blob and OIDC are not used.

## Resources

| Resource | Configuration |
| --- | --- |
| Project | `0f03b727-d7a2-4dff-ac76-d615d5dfacdf` |
| Production environment | `d9da38ee-76b3-4b5e-867b-1ff3ee04dc7a` |
| App service | `64a05cf2-3bc5-4921-a754-68e6d354bb7d` |
| Postgres service | `9828c827-ee88-42cf-a3bf-81c6259af9b7` |
| Knowledge volume | `/vercel/sandbox`, writable by uid 1001; one replica |
| Upload bucket | `acuity-uploads`, region `ams` |
| Public origin | `https://agent.acuity.institute` |

The historical `/vercel/sandbox` path is retained for compatibility with published SDK clients. Agent commands run in the pinned `just-bash` virtual shell with a read-only library filesystem, no network, and no host-process commands. Trusted Git synchronization uses a separate native executor with a scrubbed child environment. This is not a separate VM.

## Build and startup

The Docker builder contains both Node 20 and pinned Bun 1.3.14. Bun installs the locked workspaces and runs the shared package build; Nuxt then builds the Node server. `NUXT_HUB_DB_DRIVER=postgres-js` must remain set in the builder so NuxtHub uses external Postgres at runtime instead of embedding PGlite. Database URLs and real secrets must not be baked into the image.

Startup applies the SQL migration journal, initializes the knowledge library, recovers interrupted sync status, and optionally starts a configured Discord gateway. Postgres stores authentication, chats, sources, usage and application KV state. Auth migration `0004_auth_id_defaults` supplies the database-generated IDs required by Better Auth UUID mode.

## Knowledge library and Git revisions

The Docker library stage downloads `Texts/sacred_texts_archive` from this repository at the pinned `LIBRARY_REVISION` commit. The large archive is excluded from CLI uploads and Docker context; Railway downloads it during the build. Update that Docker build argument when publishing a new bundled library revision. The repository must remain readable by Railway's builder.

Startup copies the library to `docs/sacred-texts` on the volume, using `LIBRARY_STAMP` to skip unchanged copies. It is available even before a remote repository is configured. Its snapshot identifier begins with `local-`.

In Admin → Sandbox, select an existing GitHub repository and branch. Public repositories support unauthenticated pulls. Private repositories need a GitHub App installed on that repository or `NUXT_GITHUB_TOKEN`. Saving the configuration starts a pull; **Sync now** explicitly fetches the latest revision. The snapshot ID is the actual checked-out commit SHA, not a Vercel snapshot image ID.

Pulling an existing library does not create or modify its GitHub repository. Credentials are passed only to trusted Git child processes and are not written to `.git/config`. Pulls fast-forward the current branch and refuse divergence instead of discarding unpublished commits. Shared-clone operations are serialized. No broad cleanup removes unrelated records or the bundled library.

To aggregate additional sources, add them in Admin → Sources and run source sync. Publishing the aggregated snapshot requires a write-capable GitHub credential. Each GitHub source resolves credentials for its own repository. Source refreshes replace only that source's text files; uploads remain in object storage for retries. A failed source or Git push fails the job without claiming a successful snapshot.

Sync runs in the app process. Progress is persisted in Postgres, but work does not resume automatically after process termination. Interrupted jobs are marked failed on startup and can be rerun from Admin.

## Runtime variables

| Function | Variables |
| --- | --- |
| Database | `POSTGRES_URL` referencing the attached Postgres service |
| Authentication | Matching `BETTER_AUTH_SECRET` and `NUXT_BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://agent.acuity.institute`, `NUXT_PUBLIC_SITE_URL=https://agent.acuity.institute`, `AUTHORIZED_USER_EMAILS` |
| AI | `AI_PROVIDER=openai-compatible`, `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_MODELS`, `OPENAI_COMPATIBLE_DEFAULT_MODEL` |
| Model picker | `NUXT_PUBLIC_AI_MODELS`, `NUXT_PUBLIC_AI_DEFAULT_MODEL`, `NUXT_PUBLIC_AI_PROVIDER_NAME` |
| Uploads | `AWS_ENDPOINT_URL`, `AWS_REGION`, `AWS_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| Web search | `BRAVE_API_KEY` |
| Git library | `NUXT_GITHUB_SNAPSHOT_REPO`, `NUXT_GITHUB_SNAPSHOT_BRANCH`, optional `NUXT_GITHUB_TOKEN` or GitHub App credentials |
| YouTube listing | `NUXT_YOUTUBE_API_KEY` |
| GitHub bot | `NUXT_GITHUB_APP_ID`, `NUXT_GITHUB_APP_PRIVATE_KEY`, `NUXT_GITHUB_WEBHOOK_SECRET`, app name/trigger |
| Discord bot | `NUXT_DISCORD_BOT_TOKEN`, `NUXT_DISCORD_PUBLIC_KEY`, `NUXT_DISCORD_APPLICATION_ID`; optional `DISCORD_GATEWAY_ENABLED=true` |
| Durable bot state | `REDIS_URL`; application KV already persists in Postgres without Redis |

Email/password sign-in works without GitHub OAuth. An allowlisted email is an access rule, not a created account. Public signup is disabled. Optional bot and YouTube integrations stay unconfigured until their service credentials and external webhook subscriptions exist. Do not enable outbound bot replies as a deployment smoke test.

GitHub sign-in uses `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and the runtime flag `NUXT_PUBLIC_GITHUB_LOGIN_ENABLED=true`. Its callback URL is `https://agent.acuity.institute/api/auth/callback/github`. Apply saved variable changes with a successful deployment; failed builds leave the previous container and its old origin settings running.

DeepSeek final synthesis retains the tool schemas while sending `tool_choice=none`, adds an explicit final-answer instruction, and disables additional thinking for that step. This avoids ending a research loop with raw tool-call protocol text. The selected chat model is passed explicitly into the agent call.

Attachments are stored in the private bucket and served through signed capability URLs at `/api/files/...`. These URLs allow a model provider to fetch an attachment without receiving the user's authentication cookie. Deleting an object revokes its link. Rotating the file signing secret (or the auth-secret fallback) invalidates old links.

## Deploy and verify

Run from the repository root. The `.railwayignore` file keeps the bundled archive out of the code upload:

```bash
RAILWAY_HTTP_TIMEOUT=600 railway up \
  --project 0f03b727-d7a2-4dff-ac76-d615d5dfacdf \
  --environment d9da38ee-76b3-4b5e-867b-1ff3ee04dc7a \
  --service 64a05cf2-3bc5-4921-a754-68e6d354bb7d \
  --detach -m "Describe the change"
```

Verify build logs, deployment status, `/api/health`, authentication, a read-only sandbox command, snapshot status, and upload/download/delete. A healthy database alone does not prove that the knowledge volume or external integrations are initialized. Check the same snapshot and library after a restart. Tests that send library content to an external AI provider require the owner's authorization.

Use `bun run test`, `bun run typecheck`, `bun run lint` and a production build before deployment. Keep the Docker and SQL changes in the GitHub repository so future source-based deployments and new databases retain them.
