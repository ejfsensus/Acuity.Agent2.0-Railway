# Acuity.Agent staged library retrieval

Implemented on `gitbot/agent-retrieval-review`, deployed to the staging environment behind `agent.acuity.institute`. Authenticated live model acceptance remains separate from deterministic regression tests and deployment health checks. This implementation retains the installed AI SDK 6 rather than coupling retrieval changes to a major dependency migration.

## What runs

The chat and bot entry points both supply a request-scoped `LibraryResearch` controller to the shared base agent. Before the first answer-model request, the server:

1. Routes the bounded recent conversation into a typed plan: intent, a self-contained question, 1–3 subquestions, requested traditions, named works, explicit edition/translator and literal quotation constraints. The selected chat model remains authoritative. Router failure falls back to a conservative library plan, retaining the preceding question for short follow-ups.
2. Screens potential works using the remote book catalogue and up to three focused semantic probes. Comparisons use balanced per-tradition screening. Literal quotations use keyword search, including a lowercase variant on a miss. Only hits whose book and path match a remote catalogue entry become discovery leads. The controller never calls remote answer synthesis, passage reading or book reading.
3. Maps screened works to the versioned local catalogue by source path, source URL or exact title/alias, then ranks those local entries ahead of full-text BM25 discoveries. Mapping identifies a potential work, not an equivalent edition. Named-work and tradition constraints still apply. Literal quotation discovery greps mapped files first and widens to the remaining local catalogue only when they contain no match. REST failures retain local-only discovery. Parser/geocoding repositories and housekeeping files are excluded; binary-only texts are marked unreadable.
4. Selects an initial shortlist of readable local editions, normally up to six, or up to twelve for six-tradition comparisons. Requested traditions get separate slots. Unconstrained inquiries diversify by tradition. Separate editions remain separate. Unmapped remote works remain discovery leads and are reported as limitations.
5. Greps the selected local files and reads surrounding lines. A short external probe phrase may guide a local literal lookup when the question's vocabulary yields no passage. Only a subsequent read of the selected local file can become answer evidence; remote snippets cannot. Explicit edition constraints must match inspected metadata/header text or the evidence is excluded. Named-work inquiries can fall back to local opening passages, explicitly marked as partial reading.
6. Supplies verified evidence, coverage leads, gaps and service limitations to the answer model. Coverage counts are lexical leads, not judgments that a claim has been proved. The answer model must assess meaning, cite the actual edition and locator, and distinguish interpretation from quotations.

For a library inquiry, the answer model receives only `refine_library`, not arbitrary bash, web or unrestricted sacred-text REST tools. The initial stage sequence therefore does not depend on the model following a prompt or choosing a discovery tool. Refinement requires a named gap, retains work/edition constraints and permits at most two sequential expansions. Each expansion repeats discovery, selection and verification. Documentation and external-information intents retain their appropriate tools. Greetings use no retrieval tools. Raw shell remains available to separately authorized sandbox API callers; the SDK/API contract is unchanged.

## Catalogue and service behaviour

The startup plugin warms `.library-catalogue-v1.json` on the existing sandbox volume after the bundled library is mounted. The cache is keyed by catalogue schema and `LIBRARY_STAMP`; a new mounted corpus revision rebuilds it. An unversioned corpus rebuilds rather than trusting stale metadata. Generated catalogue files are outside the corpus and must not be committed into snapshot repositories.

The current checked-out corpus produced 907 catalogue entries, 891 readable, in approximately 33 seconds on the review host. That is a one-time warm-up for a revision, not a live latency guarantee. Warm requests read the persisted manifest. The index preserves title, aliases, work/edition IDs, translator, language, rights, source URL, format and metadata/opening-derived descriptions. Discovery descriptions never count as passage evidence. Work IDs are title-derived discovery identifiers, not a claim that independently sourced editions have been bibliographically reconciled.

The existing `SACRED_TEXT_API_URL` and `SACRED_TEXT_API_KEY` continue to configure REST. Catalogue/book-info responses are cached in application KV for five minutes, scoped to service, a digest of the credential, and optional `SACRED_TEXT_INDEX_REVISION`. No credential value is emitted. `Retry-After` creates a durable embedding-service cooldown. Auth errors, quota errors and timeouts stop immediate remote retries and retain local discovery/read fallback. A remote miss never establishes absence from the larger library.

Each research pass has a 55-second deadline; individual remote requests time out after 12 seconds. Cancellation propagates into REST and local streaming reads. A deadline or missing edition produces a coverage limitation rather than an invented answer. Local reads validate real paths beneath the library root, ignore symlink entries during indexing, cap file size, and treat quotations as literal text rather than shell or regex code. No index ingestion, embeddings migration, schema migration or new service is required.

## Streaming, citations and recovery

Library research ends with one final answer. A valid completed answer from the agent is delivered and saved once, with no second synthesis request merely because research tools ran. A separate tools-disabled recovery call is used only for absent, invalid, interrupted or incomplete output, outside the research iteration allowance. Web chat and bots retain verified evidence from every initial/refinement pass. The recovery prompt interleaves and bounds that evidence without copying candidate catalogues or stale research drafts. An earlier empty pass cannot overwrite later retrieved evidence.

Research narration is suppressed from the final web answer; tool activity and research progress remain visible. Completion rejects empty text, operational summaries such as “Verified 11 passages from 6 selected texts”, future-search promises and length-truncated generations. Recovery synthesis has an independent 90-second allowance and 8,192 output tokens, with at most two attempts. For tools-disabled generation, the protocol guard leaves retries to this finaliser instead of multiplying its attempts. User cancellation does not start recovery or persist a late answer.

If both synthesis attempts fail, the runtime emits a clearly labelled evidence-only fallback containing actual verified excerpts and locators, or an explicit failure when no verified excerpts exist. This is recorded as an error, not a successful synthesis. Source chips and citation labels are generated from the final delivered text before persistence. Title generation uses the configured model provider and a separate ten-second timeout.

A `data-research` stream part reports discovery, selection, retrieval, verification and completion. A persisted `data-research-selection` part records each pass's plan, selected works, selection reasons, coverage leads and limitations for audit. `library_research` / `refine_library` evidence feeds the existing `acuity.agent-sources.v1` projection with title, edition, translator, URL and passage/line locator. Unverified probes and discovery metadata are excluded. The progress and citations persist with the assistant message. Synthesis recovery receives the verified research context too.

The previous DeepSeek task settings remain: router thinking off at temperature 0, research high effort, reserved/recovery synthesis thinking off, saved answer temperature respected (including zero). The router output allowance is now 2,048 tokens to accommodate the structured plan.

## Live acceptance after deployment

Use a member test account and the supplied URL. Verify the selected branch/commit first, then exercise the actual browser → authenticated chat API → catalogue/REST/local retrieval → model → streamed answer → saved chat/source panels flow:

- A known quotation and a case/spelling variant; inspect the exact quote and neighbouring context.
- A named edition/translator; verify it is retained or explicitly reported unavailable.
- A theme whose relevant works do not contain the theme in their titles.
- A local-only Atlas work, confirming local fallback and correct provenance.
- A two- or three-tradition comparison, checking each tradition's evidence and meaningful differences.
- A short follow-up, confirming topic continuity and newly requested source constraints.
- An absent quotation, confirming no invented source or claim of exhaustive absence.
- An externally simulated 401/429/timeout in a test fixture/service, confirming fallback and no retry burst. Do not deliberately exhaust the production quota.
- Cancellation, synthesis recovery, reload of the saved chat, source links, mobile layout and progress visibility.

Record actual latency, API calls, selected works, verified passages, gaps and quotation/edition accuracy. Local tests establish control flow and adapter contracts; live model quality and deployed credentials remain to be verified against the supplied URL.


## Verification on the review branch

Runtime synthesis correction (1 November): 87 tests pass (8 SDK, 39 agent, 40 application), plus lint, type-checking and the production build. The SDK integration regression covers an initial retrieval miss, successful refinement, a separate tools-disabled synthesis request, source labelling and persistence of the final answer. Additional regressions cover progress-only replies, tool-limit termination, two-attempt enforcement, provider failure with evidence-only output, truncation and cancellation. These use deterministic model fixtures; deployed-provider/browser acceptance is a separate check.

Screening and single-answer correction: 92 tests pass (8 SDK, 42 agent, 42 application), plus lint, type-checking and the production build. Deterministic regressions cover external screening mapped to actual local reads, rejection of remote probe snippets and foreign local-file evidence, scoped quotation discovery, and both SDK completion paths: preserving a valid first answer with zero extra generations, or recovering a progress-only reply. Both paths persist one cited final answer.

- 75 tests passed: 8 SDK, 33 agent and 34 application tests.
- Repository lint and type-checking passed.
- Production build passed with the Dockerfile's 4 GB Node heap setting and the external Postgres driver. Bundler annotation, source-map and chunk-size warnings remain.
- Actual local corpus indexing: 907 files, 891 searchable, approximately 33 seconds for an uncached revision.
- Warm offline fallback smoke: approximately 4.4 seconds, six Sufi/Christian works selected and twelve passages read with line context, while the remote service was simulated as unavailable. This is a local measurement, not a deployed latency promise.
- Regression cases include edition rejection, forged passage rejection, local-only fallback, quota handling, cancellation, parallel-expansion locking, literal quote safety, excluded parser data, multi-turn routing, source projection and the actual SDK progress stream.
- The original retrieval review used no live model inference, remote ingestion, service-variable change or manual deployment. Subsequent runtime corrections use the existing branch-triggered staging deployment; authenticated model/browser acceptance remains a separate check.
