# Acuity.Agent: routing and text selection review

Reviewed 1 November 2026 against `gitbot/agent-unified-live` at `59707872a795d53badc5b3c5a81a20e6e8669058`. The retrieval redesign below is a proposal. This branch implements the generation-setting corrections described later; it does not yet enforce the proposed retrieval stages or change a deployed service.

## Findings

1. **The router allocates effort, not sources.** `packages/agent/src/router/schema.ts` returns only complexity, model, step count and a reason. Its prompt still uses software-installation and deployment examples. It cannot distinguish a known passage, a thematic inquiry, an edition-specific question, or a comparison across traditions. The chat router sees only the latest user message, so follow-ups such as “compare that with the Upanishads” lose their referent during classification. Its fallback is 40 steps, with up to 120 after the administrator's multiplier.
2. **REST retrieval is already implemented.** `packages/agent/src/tools/sacred-text.ts` calls the actual sacred-text service under `/v1`, including discovery, semantic search, literal search, book information and passage context. The missing component is an enforced discovery and selection workflow, not another REST client. The tool can currently perform any of its ten actions at any point. The prompt says to discover identifiers, but nothing requires discovery or a shortlist before passage search or shell access.
3. **Instructions pull in different directions.** `prompts/chat.ts` prioritizes the local archive and broad grep. `prompts/shared.ts` describes the remote service as alongside grep. Moderate and complex hints encourage broad searches. Examples repeatedly use `grep -rl ... | head -5`: those five paths reflect traversal order, not relevance, and can miss smaller collections. Broad terms in scripture-parser fixtures, catalogue notes and commentary can compete with actual texts. The archive's attribution explicitly identifies the OpenBible parser/geocoding repositories as reference data rather than scripture.
4. **A title catalogue cannot answer a content question.** The current sacred-text service's `Service.books()` filters `query` by title substring or exact book code. `book_info` adds metadata and a short opening excerpt. Neither supplies thematic content summaries. For an unnamed concept, `/v1/books?query=...` alone will miss books containing the idea under unrelated titles. Semantic passage probes are necessary to select books by content.
5. **The corpora do not have a shared identity map.** REST passage IDs such as `gno/...#00005` are not local `docs/sacred-texts/...` paths. The local archive also includes the 281 Ancient Wisdom Atlas additions and other material outside the remote index. Remote discovery must not become a hard prerequisite for finding a local-only text, and a remote miss cannot establish local absence. A title match does not establish the same translator or edition.
6. **Model selection and retrieval scope are conflated.** The router recommends models, but the web route passes the user's chosen model as an explicit override, and `createSourceAgent` otherwise uses the administrator/default selection rather than `routerConfig.model`. Keep explicit model selection, but stop implying that a router recommendation changes the selected chat model. Bot routing follows a different model policy.

Evidence: [router](../../packages/agent/src/router/route-question.ts), [schema](../../packages/agent/src/router/schema.ts), [chat prompt](../../packages/agent/src/prompts/chat.ts), [shared instructions](../../packages/agent/src/prompts/shared.ts), [REST tool](../../packages/agent/src/tools/sacred-text.ts), [service implementation](https://github.com/ejfsensus/sacred-text-mcp/blob/main/app/service.py), [REST routes](https://github.com/ejfsensus/sacred-text-mcp/blob/main/app/routes.py).

## Recommended workflow

Use REST to identify promising works before grep. For thematic questions, combine catalogue metadata with small semantic passage probes; do not treat catalogue title search as thematic search.

| Stage | Work performed | Required result |
| --- | --- | --- |
| 1. Interpret the inquiry | Classify intent as conversation, known passage, named work, theme, comparison, or current external information. Resolve short follow-ups from recent conversation and prior selected sources. Preserve explicit tradition, edition and translator constraints. | A validated research plan with separate subquestions and coverage requirements. |
| 2. Discover candidates | For a named work, use `list_books(query=title)` then `book_info`. For a theme, discover valid traditions, run 1–3 focused semantic probes, and group hits by book. Consult the local manifest in parallel for local-only works. | Candidate work/edition IDs, relevance evidence, index availability and verified local paths where mapped. |
| 3. Select texts | Rank by observed passage relevance, explicit user constraints, source type and edition match. Deduplicate repeat copies of the same edition; retain distinct translations. For comparisons, select separately within each requested tradition. | Start with 3–6 works, usually 1–2 per tradition, with a short selection reason. These are initial budgets, not claims of exhaustive coverage. |
| 4. Retrieve within selection | Use `search_texts(book=[verified codes])` for themes and `keyword_search` for literal quotations. Grep only verified local files or narrowly selected tradition directories. Use `grep -n -F` for literal terms, `grep -niE` for deliberate variants, and bounded context reads. | Passage evidence attached to work, edition, locator and subquestion. |
| 5. Verify and fill gaps | Read `get_passage(neighbors=1–2)` or a local line range. Verify edition metadata and whether the passage is scripture, commentary or another source kind. If a subquestion lacks support, expand one source group or query variant at a time. | Each material claim supported, or an explicit coverage gap. |
| 6. Answer | Synthesize from the verified evidence; preserve differences between traditions and label interpretation. Keep source identifiers and links available to the UI. | A substantive cited answer, including honest limits where needed. |

Example: for “Compare self-annihilation in Sufi writings and Christian mysticism,” discover the actual archive sections, probe each tradition's vocabulary separately, select relevant works in each group, then search/read those works. A globally ranked top five is not balanced evidence. If REST does not contain a requested edition, search that edition in the local catalogue instead of substituting a different translation silently.

## Implementation sequence

**First: remove conflicting instructions and add a typed plan.** Replace generic routing examples with Acuity research examples. Extend the plan with `intent`, `subquestions`, explicit constraints, required tradition coverage, and a bounded retrieval budget. Validate identifiers against discovery results rather than accepting model-invented paths. Limit the router input to a bounded recent conversation window and previously selected source IDs. Keep complexity for effort allocation, separately from intent and source scope. On router failure, use a conservative discovery-first plan rather than an unstructured 40-step global search.

**Second: enforce the stages in the server.** Add a retrieval controller with separate discovery, selected-text search and passage-read operations. Gate tools with the SDK's `activeTools` or equivalent controller state. An action enum inside one always-available `sacred-text-mcp` tool cannot enforce ordering. After selection, source-scoped wrappers should validate requested book IDs/local paths against the current shortlist. Preserve an explicit, budgeted expansion operation. Keep raw shell for approved documentation tasks and a controlled fallback; otherwise its availability bypasses source selection. Retain the existing read-only and path restrictions.

**Third: build a versioned content catalogue.** Generate a local manifest at corpus build/sync time: work ID, edition ID, title, aliases, tradition, author/translator, language, source kind, description, themes, rights, source URL, file format, readability, verified paths and optional REST book mapping. Use front matter and attribution first; descriptions inferred from excerpts must be marked as derived metadata and never count as passage evidence. Store canonical-work and edition IDs separately. Build a small lexical/BM25 index over descriptions and headings; add metadata embeddings only if evaluation shows a benefit. This improves discovery without re-embedding or altering the existing Chroma passage collection.

**Fourth: add evidence scoring and coverage state.** Combine semantic and lexical ranks, then diversify by work/edition and required tradition. Record why a source was selected and whether a quote was context-verified. The existing `0.30` cosine-score guidance is a weak-match heuristic, not a calibrated probability of relevance. Tune cutoffs on real questions instead of treating one score as universal. Distinguish no hit, weak hit, wrong edition, unreadable local file and upstream failure.

Cache stable catalogue responses in the existing durable application KV, keyed by service and corpus revision, with a short TTL; cache discovery, not final answers across user contexts. Retain a local discovery route when the API key is missing, the service times out or returns 401/429. Respect `Retry-After`; avoid concurrent semantic bursts against the shared embedding quota. A stage should widen only for an identified evidence gap, not because more iterations remain. Start with 1–2 discovery calls for named passages, 1–3 semantic probes for themes, and balanced per-tradition retrieval for comparisons; tune against latency and recall before imposing hard user-facing limits.

## Generation settings corrected in this branch

The existing deployment documentation identifies the direct DeepSeek-compatible endpoint, `https://api.deepseek.com`. This review did not read or change live Railway variables. Model IDs remain administrator-configurable; no model switch or credential change is required.

| Function | Direct DeepSeek mode | Temperature | Output allowance |
| --- | --- | --- | --- |
| JSON routing | Thinking disabled | `0` | 1,024 tokens |
| Chat title | Thinking disabled | `0.2` | 64 tokens |
| Research/tool loop | Thinking enabled, `reasoning_effort=high` | Removed from the wire request because it has no effect | 16,384 tokens per generation, including reasoning |
| Reserved synthesis step | Thinking disabled; `tool_choice=none` | Saved administrator value; new configurations default to `0.2` | Shares the loop's 16,384-token allowance |
| Recovery synthesis | Thinking disabled; `tool_choice=none` | Saved administrator value, or `0.2` for admin recovery | 8,192 tokens |

An ordinary research step may finish with its own answer before the reserved synthesis step; that answer retains research thinking mode. SDK `prepareStep` supports provider-option overrides, but does not override the loop's temperature or token allowance. The saved temperature therefore enters the outer call and the DeepSeek request transform removes it only on thinking requests. This also preserves it when the reserved final step disables thinking. Existing saved temperatures are respected; this branch does not reset stored administrator preferences.

Previously the saved temperature never reached the agent call, and `config.temperature || 0.7` replaced a saved zero. Both are corrected. The request transform explicitly selects thinking mode and strips ineffective temperature/presence/frequency penalties while thinking. No `top_p` override is introduced. For DeepSeek, thinking does not make a low temperature enforce precise retrieval; source constraints and verification must do that work.

The installed compatible adapter preserves `reasoning_content` in subsequent assistant messages. A regression test exercises an actual two-step adapter/tool loop and verifies this round trip. Routing/title calls now avoid default high-effort thinking. Bot helper calls also use the application's model wrapper rather than passing a bare model string that would resolve through the gateway instead of the configured direct provider.

Official references, checked 1 November 2026: [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/), [Chat Completions parameters](https://api-docs.deepseek.com/api/create-chat-completion/). The numerical non-thinking temperatures here are application choices for source-bound work, not a claim that DeepSeek prescribes `0.2` for this use case.

## Login branding

No GitBot/Gitbot branding string exists in the reviewed application source. The public `https://agent.acuity.institute/login` HTML and rendered browser view on 1 November show Acuity branding and no lower-left GitBot badge. No speculative CSS hiding or source deletion was made. If the reported badge is on another deployment or the separate identity-provider page, its exact page/screenshot is needed to locate the owning component; it has not been removed by this branch.

## Acceptance and evaluation

Use a fixed set of known quotations, spelling variants, named editions, themes without matching book titles, local-only Atlas works, multi-turn follow-ups, balanced comparisons, deliberately absent passages, and API failure/429 cases. Measure selected-work recall, relevant-passage precision, edition accuracy, quotation fidelity, coverage per requested tradition, unsupported-claim rate, API/grep calls and p50/p95 latency. Compare the staged workflow against this branch's baseline on the same corpus revision and model settings.

Regression checks for the settings correction cover saved temperature zero, bounded helper output, thinking disabled for JSON routing/final synthesis, ineffective sampling removal, and reasoning replay across tool calls. No paid live model requests, index ingestion or deployment are required for these tests.

Dependency note: this checkout installs AI SDK `6.0.86`; the npm registry reports `7.0.159` as current. Plan a separate migration to SDK 7 before the larger retrieval-controller implementation. This correction uses the installed SDK 6 source and types and leaves the lockfile unchanged.


## Verification completed

- `bun run lint`: passed.
- `bun run typecheck`: passed.
- `bun run test`: 63 passed, zero failed (8 SDK, 22 agent, 33 application).
- `bun run build`: passed with the Dockerfile's `NODE_OPTIONS=--max-old-space-size=4096` and the external Postgres driver selected. A first attempt without that heap setting exhausted Node's default heap. The successful build reports bundle-size, annotation and sourcemap warnings.
- Public login inspected in a rendered browser; no GitBot badge reproduced.
- No paid model call, persistent test record, Railway variable update, deployment or Chroma mutation performed.
