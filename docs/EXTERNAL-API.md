# External access to Acuity.Agent

The current `expanded-lib` origin is `https://acuity-agent-expanded-lib.up.railway.app`. API keys are environment/database specific. Use a different origin and key when targeting production.

## Two ways to use it

| Mode | What Acuity runs | What the caller supplies | Who pays for LLM calls |
| --- | --- | --- | --- |
| Retrieval | Validated read-only commands against the mounted corpus; JSON results | A personal Acuity API key; optionally its own external LLM | The caller pays its own LLM provider; the shell request makes no hosted LLM call |
| Hosted research | Routing, corpus/structured searches, tools and final synthesis; SSE, then saved chat | A personal Acuity API key, question and a configured model ID | Currently the deployment's configured provider. Future non-admin BYOK will resolve the API-key owner's provider |

These are HTTPS JSON/SSE APIs. This app is not an OpenAI `/v1/chat/completions` server and currently has no app-level MCP endpoint. The separately hosted Sacred Text Library has its own REST/MCP interface and token; that service token is not the same as an Acuity personal API key.

## Authentication and key setup

Sign in with an approved account, visit **Settings → API Keys**, name a key for one integration, create it and save the revealed value once. You can revoke it from the same page. A script can create a 30-day key through `POST /api/auth/api-key/create` with an authenticated browser session and `{"name":"External automation","prefix":"sk","expiresIn":2592000}`. Do not pass the AI provider key to this endpoint.

For requests, use either `Authorization: Bearer <SAVOIR_API_KEY>` or `x-api-key: <SAVOIR_API_KEY>`. Browser cookies are not required for an integration. `SAVOIR_API_KEY` is an external client's variable; the server already stores and validates the key hash in Postgres, so you do not need to add the raw personal key to Railway.

Keys currently inherit their owner's role and access. There is no route-level read-only scope enforcement today; a key owned by an administrator can access administrator APIs. API-key plugin throttling is currently disabled. The app's non-admin daily message limit still applies to hosted chat; it is a separate control and is not a per-key cost ceiling. Use a non-admin service account for third-party integration once BYOK/onboarding is available. External usage reports are informational, not an authoritative billing ledger.

## Ready-to-run client

`examples/external-api.py` uses only Python's standard library. Supply the base URL and personal key through environment variables or your tool's secret store. The generated local integration environment file contains `export SAVOIR_API_URL=...`, `export SAVOIR_API_KEY=...`, and `export SAVOIR_MODEL=deepseek-flash`; it is private and must not be committed.

```bash
source /path/to/private/acuity-api.env

# Retrieve corpus metadata without calling an LLM.
python3 examples/external-api.py shell 'head -30 docs/sacred-texts/ATTRIBUTION.txt'

# Run the hosted agent and return final text + a persistent chat URL as JSON.
python3 examples/external-api.py ask \
  'Find two passages about wisdom, read them in context, then synthesize a short cited answer.'
```

For n8n, a server-side HTTP action, or another agent: put the personal key in its credential store and use the request contracts below. A browser integration should use a trusted backend instead of embedding a reusable key in public JavaScript.

## JSON sandbox protocol

`POST /api/sandbox/shell`, `Content-Type: application/json`:

```json
{"command":"grep -n -m 5 'wisdom' docs/sacred-texts/ATTRIBUTION.txt","sessionId":"optional-previous-session-id"}
```

Returns:

```json
{"sessionId":"returned-session-id","stdout":"...","stderr":"","exitCode":0}
```

For a batch, send `{"commands":["command one","command two"],"sessionId":"optional-id"}`. It returns `{"sessionId":"...","results":[{"command":"...","stdout":"...","stderr":"","exitCode":0}]}` even for a one-element `commands` array. A non-zero exit code means the shell command failed even when HTTP status is 200.

Limits: at most 10 commands, at most 2000 characters each, and 50,000 output characters per stdout/stderr result before truncation. Commands within a batch run sequentially. Session metadata is refreshed for about 30 minutes and can be reused; the caller must save the returned `sessionId`. Expired sessions can be recreated.

The “sandbox” is a read-only virtual shell over the shared library in the Railway application process, not a fresh disposable VM/container for each caller. Supported tools include `grep`, `find`, `head`, `cat`, `sed`, `awk` and other allowlisted readers. It does not execute arbitrary Python/Node code, install packages, access the network, write files or read host secrets. Session IDs do not grant access by themselves and are not a mutable per-user filesystem isolation boundary. All approved users intentionally read the same corpus.

## Hosted agent protocol

1. Create UUIDs for a chat and initial user message.
2. `POST /api/chats` with the bearer key:

```json
{"id":"CHAT_UUID","mode":"chat","message":{"id":"MESSAGE_UUID","role":"user","parts":[{"type":"text","text":"Your research question"}]}}
```

3. `POST /api/chats/CHAT_UUID` with the same bearer key:

```json
{"model":"deepseek-flash","messages":[{"id":"MESSAGE_UUID","role":"user","parts":[{"type":"text","text":"Your research question"}]}]}
```

The second response is `text/event-stream` using AI SDK UI message chunks, not one JSON response. Process `data:` events: `tool-*` events report research, `text-delta.delta` carries text, and `finish` signals completion before `[DONE]`. Interim text before later tools can be a preamble; the supplied client returns only the text following the last tool activity. Handle `error`, `abort`, unexpected EOF and network timeouts explicitly. An explicit synthesis-failure message is a failed run, not a successful research answer.

4. `GET /api/chats/CHAT_UUID` retrieves persisted messages. `GET /api/chats` lists the owner's chats. Ownership checks apply; the browser URL is `/chat/CHAT_UUID` and requires that owner's login. Do not recreate and rerun a task blindly after a timeout, because a generation may already have incurred provider usage. Inspect the saved chat first.

Keep the caller connection open; this is not a background-job API. Disconnecting the stream cancels hosted research. There is no durable run ID/polling endpoint, webhook callback or restart-resumable agent task today. Do not expose `mode:"admin"` as a public integration action.

## SDK with caller-owned AI billing

Use `@savoir/sdk` to add corpus tools to an LLM you configure in the external process. A provider instance initialized with the caller's key keeps inference billing with that provider; a bare AI SDK model string can route through a gateway and is not equivalent to BYOK.

```ts
import { createSavoir } from '@savoir/sdk'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, stepCountIs } from 'ai'

const savoir = createSavoir({
  apiUrl: process.env.SAVOIR_API_URL!,
  apiKey: process.env.SAVOIR_API_KEY!,
})
const provider = createOpenAI({ apiKey: process.env.EXTERNAL_OPENAI_API_KEY! })
const result = await generateText({
  model: provider(process.env.EXTERNAL_OPENAI_MODEL!),
  tools: savoir.tools,
  stopWhen: stepCountIs(41),
  prepareStep: ({ stepNumber, messages }) => stepNumber >= 40 ? {
    toolChoice: 'none',
    messages: [...messages, { role: 'system', content: 'Research is complete. Give the final cited answer from the retrieved passages now; state any gaps.' }],
  } : undefined,
  system: 'Search the corpus, read passages before quoting, and provide a final answer with source paths.',
  prompt: 'Compare two teachings about compassion from the available texts.',
})
if (!result.text.trim()) throw new Error('The provider returned no final answer')
console.log(result.text)
```

This SDK exposes `bash`/`bash_batch`; the hosted agent additionally has its configured Brave and Sacred Text tools. For another provider, instantiate its native adapter or an explicitly OpenAI-compatible Chat Completions adapter with that provider's address and key. Never substitute the personal Acuity API key for the provider key.

Errors: 401 means missing authentication. The auth plugin can return 403 for an invalid/expired key; 403 can also mean the owner is not approved or lacks the required role. Inspect the response code/message; 400 means invalid input/command; 429 means an application/provider limit; 503 means the knowledge base is unavailable. Check `/api/health` without authentication for deployment health.

## Service callers (Acuity.Search Sacred Texts mode)

A service account is a normal member whose email is listed in both `AUTHORIZED_USER_EMAILS` and `AGENT_SERVICE_ACCOUNT_EMAILS`. It authenticates with its own API key, is exempt from the daily limit, and may send `x-acuity-on-behalf-of: <opaque id>` (logged, max 120 chars; send no email or name).

Flow: `POST /api/chats` (creates the chat; not counted) then `POST /api/chats/:id` (streams the answer; counted once for limited users). Each chat has its own sandbox session (`sandbox:chat-session:<chatId>`, 1 h TTL), so parallel chats never share a shell.

Just before `finish`, the stream carries one persisted part:

```json
{ "type": "data-sources", "id": "sources", "data": { "schema": "acuity.agent-sources.v1", "sources": [
  { "ref": "corpus:docs/sacred-texts/source1_ista/…:L10-14", "origin": "local-corpus", "title": "…", "path": "…",
    "lineStart": 10, "lineEnd": 14, "sourceUrl": "https://sacred-texts.com/…", "edition": "…", "licence": "…",
    "text": "…", "cited": true, "label": "S1", "category": "source1_ista", "file": "…" } ] } }
```

`origin` is `sacred-text-index` (with `passageId`, `bookCode`, `chunkIndex`, `tradition`) or `local-corpus` (grep/cat/sed reads of `docs/sacred-texts`). `cited` is true when the answer mentions the source's path, passage id, URL or title; cited sources are labelled `S1…` in order of first mention. `text` is capped at 4000 characters with control characters removed. The same part is returned by `GET /api/chats/:id`.
