# BYOK, signup and external access plan

Prepared 30 October 2026. BYOK is a planned change, not implemented by this document. Signup is prepared behind a disabled switch and must remain closed until the billing boundary below is shipped and verified.

## Product contract

- An administrator defaults to the deployment's existing `.env`/Railway AI configuration. An administrator may also choose a personal connection.
- Every non-admin must configure their own provider, API key and model in Settings before any hosted AI request can run. A missing, invalid, exhausted or removed key must never fall back to the administrator's key or a platform-funded gateway.
- The same rule applies to browser chat and inbound API keys: an API key identifies its owner; it does not select a different billing account.
- The user's chosen provider pays for all LLM stages: routing, research, final synthesis, retries, recovery, titles, and any separately invoked AI processing such as OCR. Optional helper models must belong to the same connection. Use a deterministic router/title when that provider cannot support a helper call.
- BYOK separates LLM inference costs. Railway hosting/storage, Brave searches, library indexing and the Sacred Text service's shared embedding quota remain operator-funded unless separate per-user tool billing is added. Do not advertise those costs as covered by a user's LLM key.

## Settings and provider presets

Add Settings → AI service, available to every authenticated user even before they have AI access. Show provider, API address, a masked API key, model selector, optional helper model, and Test connection / Save / Remove actions. The custom OpenAI option accepts an HTTPS base URL, API key and exact model ID. Never display a saved key again. A connection test makes a small, disclosed provider call; listing models alone does not prove tool support.

Use the preset list below as seed metadata, not a permanent model allowlist. Refresh models from the provider/account where supported; permit exact manual model IDs. Validate streaming, structured tool calls and a tool-free final answer against the chosen protocol. An API subscription/key is separate from a consumer chat subscription.

| Provider | API base address | Example model IDs | Adapter |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-6.1-sol`, `gpt-6-luna`, `gpt-6-astra` | Native OpenAI Responses API |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5` | Native Anthropic Messages API |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-3.8-flash`, `gemini-3.6-flash` | Native Google API |
| DeepSeek | `https://api.deepseek.com` | `deepseek-flash`, `deepseek-v4-pro` | OpenAI-compatible, preserving the existing thinking transform |
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest` | Native Mistral adapter |
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b`, `openai/gpt-oss-20b` | Native Groq adapter |
| xAI | `https://api.x.ai/v1` | `grok-4.7` | Native xAI adapter |
| OpenRouter | `https://openrouter.ai/api/v1` | Account-selected catalog slug, e.g. `~openai/gpt-sol-latest` | OpenAI-compatible |
| Custom OpenAI-compatible | User's public HTTPS base address, including its `/v1` prefix where required | User's exact model name | Chat Completions by default; explicitly select Responses only if supported |

Model IDs were checked against official catalogs on 30 October 2026; availability still depends on the account. Provider examples and protocol references: [OpenAI models](https://developers.openai.com/api/docs/models), [Anthropic models](https://platform.claude.com/docs/en/models/overview), [Gemini models](https://ai.google.dev/gemini-api/docs/models), [DeepSeek API](https://api-docs.deepseek.com/), [Mistral adapter](https://ai-sdk.dev/providers/ai-sdk-providers/mistral), [Groq models](https://console.groq.com/docs/models), [xAI adapter](https://ai-sdk.dev/providers/ai-sdk-providers/xai), [OpenRouter catalog/protocol](https://openrouter.ai/docs/quickstart). Native adapter base addresses: [OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/openai), [Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic), [Google](https://ai-sdk.dev/providers/ai-sdk-providers/google), [Groq](https://ai-sdk.dev/providers/ai-sdk-providers/groq).

Azure OpenAI, Bedrock and Vertex service-account authentication need resource/deployment/region or cloud identity fields; treat those as a later explicit adapter rather than pretending a generic API key is sufficient. Local Ollama/vLLM can use the custom option through an authenticated HTTPS endpoint reachable from Railway; a user's laptop `localhost` is not the hosted server's localhost.

The repository currently uses AI SDK `6.0.86`; the registry reports `7.0.157` on this review date. Start BYOK with a version-compatibility/migration pass and pin matching native provider versions. Retest the custom protocol guard, tool schemas, streaming and final-answer recovery before changing the SDK major. The signup/external-access preparation continues to use the tested v6 runtime.

## Database and credential boundary

Create `user_ai_connections` with an owner FK (cascade on account deletion), connection ID, provider/adapter ID, API base URL, validated model IDs, primary/helper model, active state, credential ciphertext, nonce/tag, key version, masked suffix and timestamps. Add `billing_owner_user_id`, connection ID/provider and AI stage to server-generated usage records. Never store a raw user key in messages, analytics, logs, prompts, model/tool context, local storage, or a public Nuxt runtime variable.

Encrypt saved credentials with AES-256-GCM, authenticating the user ID and connection ID as associated data. Use a new 32-byte server secret `BYOK_ENCRYPTION_KEY`, separate from authentication and file-link signing secrets. Support versioned rotation. Application encryption protects stored backups; it does not make credentials inaccessible to an operator who controls the server and encryption key.

Owner-scoped routes:

- `GET /api/settings/ai`: metadata, validation state and masked key only.
- `PUT /api/settings/ai`: save an owned connection; omitted key retains it, explicit replacement rotates it.
- `POST /api/settings/ai/test`: validate credentials/model and tool capability without logging the secret.
- `GET /api/settings/ai/models`: bounded, account-aware model discovery.
- `DELETE /api/settings/ai/:id`: remove an owned connection and invalidate its resolution cache.

Require authentication plus ownership on every route, normal CSRF/origin protections, bounded inputs and connection-test rate limits. Users without a connection can still visit account, connection and API-key settings. AI endpoints return a specific `AI_PROVIDER_REQUIRED` error and a settings link instead of spending shared funds.

## Request-scoped execution

Replace environment-derived globals with an immutable `AIExecutionContext` resolved after user authentication: billing owner, connection, model resolver, primary/helper models, protocol options and capabilities. For admins only, the resolver can build this context from environment variables.

Important code changes:

- `server/utils/model-provider.ts`: replace the process-wide compatible provider cache. Its current cache identity distinguishes only name, URL and whether a key exists; reusing it for user keys would cross the credential boundary. Do not mutate `process.env` to switch users.
- `server/middleware/ai-observe.ts` and `packages/agent/src/core/observe.ts`: carry the per-request connection through async context; preserve safe observability without credentials.
- `packages/agent/src/router/schema.ts` and `router/route-question.ts`: remove global model/provider assumptions from user routing and options. The current model resolver silently rewrites unknown models to the deployment default; reject invalid personal selections instead.
- `agents/base.ts`, `agents/source.ts`, `core/final-answer.ts`: use the same context for every step and recovery, retaining the separate synthesis allowance and non-empty output guard. Check provider-specific thinking/tool options instead of applying DeepSeek settings to every provider.
- `server/utils/chat/generate-title.ts`: use the user's connection or a deterministic title; this is currently a separate deployment-model call.
- `server/api/chats/[id].post.ts`: resolve the owner's context before routing, title generation or opening the stream; reject model/connection overrides that do not belong to them. Preserve bearer identity for internal tools.
- `server/utils/bot/ai.ts` and source OCR routes: explicitly resolve the requesting/bot-owner account and billing policy. Unattributed bot traffic must not choose a random user's key or silently use the admin default.
- `app/pages/settings` and the model picker: use the current user's validated models; do not depend on `NUXT_PUBLIC_AI_MODELS` for ordinary users.

Custom endpoints are a real server-side request-forgery boundary once arbitrary users can edit them. Require HTTPS, disallow URL credentials/query fragments, private/loopback/link-local/metadata destinations and redirects, and enforce checks in a DNS-rebinding-resistant outbound transport. Apply the same policy to model discovery and tests. Do not forward application cookies or inbound Acuity API keys to the LLM endpoint. An optional operator allowlist can enable explicitly trusted private endpoints later.

## Signup preparation and activation

Email/password sign-in already works; GitHub credentials are not required. The prepared `PUBLIC_SIGNUP_ENABLED` switch defaults to `false` and controls both registration and the application email allowlist. The login page exposes registration only when the server reports it enabled. Public registrations retain the ordinary `user` role; the first-public-user path must never auto-promote an administrator.

As agreed, leave the switch false until BYOK enforcement ships. Activation sequence:

1. Ship and test the credential, request-context and non-admin billing boundary above.
2. Configure outbound email if verified addresses, password-reset emails or invitations are desired: select a mail provider, authenticate a sender domain, set its server-side credential and sender, implement Better Auth verification/reset callbacks and their UI, then require verified email at the application authorization boundary. No mail transport/callbacks are configured today. Plain registration itself does not require SMTP, but password recovery will not work without the reset integration.
3. Keep `BETTER_AUTH_URL` and `NUXT_PUBLIC_SITE_URL` on the environment's canonical HTTPS origin, keep the two auth secrets equal, and keep persistent Postgres. Bootstrap an administrator privately before opening registration.
4. Set `PUBLIC_SIGNUP_ENABLED=true` in that environment and deploy. No GitHub OAuth callback is involved in email/password signup. Keep `NUXT_PUBLIC_GITHUB_LOGIN_ENABLED=false` if the operator also wants to hide optional GitHub login.
5. Test a new non-admin: register → Settings → enter/test/save a personal provider → chat. Before saving a key, every AI stage must be blocked. A bad key must produce a provider error without shared fallback. An existing admin must retain environment-based access.

While closed, an administrator can create an approved email/password account via Better Auth's admin API and add its email to `AUTHORIZED_USER_EMAILS`. Editing the allowlist alone never creates an account. Ordinary users can change an existing password in Settings. Public-mode authorization ignores the development allowlist but retains the administrator role checks.

## Delivery order and acceptance tests

1. AI SDK 6→7 compatibility pass, then credential table, encryption, ownership APIs and endpoint transport policy.
2. Provider presets, native adapters, connection tests, editable/account-aware model selection and settings UI.
3. Request context across all AI stages, API identity and user billing attribution; fail closed for non-admins without BYOK.
4. Signup/email workflow, public launch, then optional per-user tool keys and scoped API credentials.

Release gates: two users on the same provider URL but different keys must never share a credential under concurrent streams; all helper/retry/final calls must carry the right key; denied/expired keys must never use environment fallback; a user cannot select another connection; keys must be absent from responses/logs/tool output; SSRF redirects/private DNS/IPv6 cases must fail; model/tool compatibility must be tested; failed final synthesis must still produce the existing visible failure message; unverified users must be rejected if email verification is enabled; API-key owners must receive exactly their own BYOK policy.

## External API today and next

See [EXTERNAL-API.md](../EXTERNAL-API.md) and `examples/external-api.py`. Today, authenticated JSON sandbox retrieval can already support independently billed AI running in an external client. Hosted-agent research uses Acuity's configured model until the BYOK plan is implemented. The prepared fixes forward bearer/x-api-key identity to internal tools and keep one-command batch responses consistent.

There is no dedicated OpenAI-compatible inference endpoint, app-level MCP server, durable task queue, callback/webhook result API, or per-user disposable VM today. A later `POST /api/v1/agent/runs` with an explicit versioned JSON/SSE contract could wrap the current two-request chat protocol. Durable/background work needs a job store, worker, idempotency keys, cancellation and owner-scoped status/results; it must not be advertised as already available.
