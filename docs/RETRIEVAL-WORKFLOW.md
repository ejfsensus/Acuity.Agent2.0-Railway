# Acuity.Agent staged library retrieval

Implemented on `gitbot/agent-retrieval-review`. The deployment and live acceptance pass are pending the owner's test URL. This implementation retains the installed AI SDK 6 rather than coupling retrieval changes to a major dependency migration.

## What runs

The chat and bot entry points both supply a request-scoped `LibraryResearch` controller to the shared base agent. Before the first answer-model request, the server:

1. Routes the bounded recent conversation into a typed plan: intent, a self-contained question, 1–3 subquestions, requested traditions, named works, explicit edition/translator and literal quotation constraints. The selected chat model remains authoritative. Router failure falls back to a conservative library plan, retaining the preceding question for short follow-ups.
2. Discovers the remote book catalogue and performs up to three focused semantic probes. Comparisons use balanced per-tradition retrieval. Literal quotations use keyword search, including a lowercase variant on a miss. Only hits whose book and path match a catalogue entry become candidates.
3. Searches the versioned local catalogue using full-text BM25 frequencies plus metadata. Named-work filters consider title aliases. Local-only literal quotation discovery is available when REST does not provide candidates. Parser/geocoding repositories and housekeeping files are excluded; binary-only texts are marked unreadable.
4. Selects an initial shortlist, normally up to six editions, or up to twelve for six-tradition comparisons. Requested traditions get separate slots. Unconstrained inquiries diversify by tradition and retain a local candidate when available. Separate editions remain separate; a remote path is never assumed to be a local path.
5. Searches only those selected files or remote book identities. Local reads return surrounding lines; remote hits are re-read with two neighbouring passages. Explicit edition constraints must match inspected metadata/header text or the evidence is excluded. Named-work inquiries can fall back to opening passages, explicitly marked as partial reading.
6. Supplies verified evidence, coverage leads, gaps and service limitations to the answer model. Coverage counts are lexical leads, not judgments that a claim has been proved. The answer model must assess meaning, cite the actual edition and locator, and distinguish interpretation from quotations.

For a library inquiry, the answer model receives only `refine_library`, not arbitrary bash, web or unrestricted sacred-text REST tools. The initial stage sequence therefore does not depend on the model following a prompt or choosing a discovery tool. Refinement requires a named gap, retains work/edition constraints and permits at most two sequential expansions. Each expansion repeats discovery, selection and verification. Documentation and external-information intents retain their appropriate tools. Greetings use no retrieval tools. Raw shell remains available to separately authorized sandbox API callers; the SDK/API contract is unchanged.

## Catalogue and service behaviour

The startup plugin warms `.library-catalogue-v1.json` on the existing sandbox volume after the bundled library is mounted. The cache is keyed by catalogue schema and `LIBRARY_STAMP`; a new mounted corpus revision rebuilds it. An unversioned corpus rebuilds rather than trusting stale metadata. Generated catalogue files are outside the corpus and must not be committed into snapshot repositories.

The current checked-out corpus produced 907 catalogue entries, 891 readable, in approximately 33 seconds on the review host. That is a one-time warm-up for a revision, not a live latency guarantee. Warm requests read the persisted manifest. The index preserves title, aliases, work/edition IDs, translator, language, rights, source URL, format and metadata/opening-derived descriptions. Discovery descriptions never count as passage evidence. Work IDs are title-derived discovery identifiers, not a claim that independently sourced editions have been bibliographically reconciled.

The existing `SACRED_TEXT_API_URL` and `SACRED_TEXT_API_KEY` continue to configure REST. Catalogue/book-info responses are cached in application KV for five minutes, scoped to service, a digest of the credential, and optional `SACRED_TEXT_INDEX_REVISION`. No credential value is emitted. `Retry-After` creates a durable embedding-service cooldown. Auth errors, quota errors and timeouts stop immediate remote retries and retain local discovery/read fallback. A remote miss never establishes absence from the larger library.

Each research pass has a 55-second deadline; individual remote requests time out after 12 seconds. Cancellation propagates into REST and local streaming reads. A deadline or missing edition produces a coverage limitation rather than an invented answer. Local reads validate real paths beneath the library root, ignore symlink entries during indexing, cap file size, and treat quotations as literal text rather than shell or regex code. No index ingestion, embeddings migration, schema migration or new service is required.

## Streaming, citations and recovery

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

- 75 tests passed: 8 SDK, 33 agent and 34 application tests.
- Repository lint and type-checking passed.
- Production build passed with the Dockerfile's 4 GB Node heap setting and the external Postgres driver. Bundler annotation, source-map and chunk-size warnings remain.
- Actual local corpus indexing: 907 files, 891 searchable, approximately 33 seconds for an uncached revision.
- Warm offline fallback smoke: approximately 4.4 seconds, six Sufi/Christian works selected and twelve passages read with line context, while the remote service was simulated as unavailable. This is a local measurement, not a deployed latency promise.
- Regression cases include edition rejection, forged passage rejection, local-only fallback, quota handling, cancellation, parallel-expansion locking, literal quote safety, excluded parser data, multi-turn routing, source projection and the actual SDK progress stream.
- No live model inference, remote ingestion, service-variable change or manual deployment was performed. Live acceptance is deliberately pending the supplied URL.
