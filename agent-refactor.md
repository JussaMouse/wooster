# Wooster Agent Refactor Plan (Code-Agent Only)

## Executive Summary
We will remove the legacy classic Tools Agent and make Code-Agent the single execution path. All existing functionality (RAG, scheduler, capture, nextActions, calendar, Gmail, Signal, API plugin) will be preserved by exposing plugin services through the Code Tool API. The LLM will decide when to answer directly vs. run tools (answer-first policy), optionally aided by a lightweight pre-classifier.

## Goals
- Eliminate “modes”; always run the Code-Agent.
- Preserve all existing features/plugins via the Code Tool API.
- Reduce tech debt: delete classic agent/tooling; consolidate RAG utilities; centralize embeddings provider selection and metadata checks.
- Keep routing for model selection (local MLX + cloud fallback).

## Non-Goals
- Changing the CLI UX beyond removing `mode code/tools`.
- Replacing the existing scheduler or API plugin.

---

## Architecture Target
- Single orchestrator: `executeCodeAgent(...)`
- Sandbox runtime: `isolated-vm` (stable tool injection; result copy; error stacks)
- Tool surface (normalized):
  - `webSearch(query) -> { results: [{ title, url, snippet }] }`
  - `fetchText(url) -> string`
  - `queryRAG(query) -> string`
  - `writeNote(text) -> void`
  - `schedule(iso, text) -> string`
  - `discordNotify(msg)`, `signalNotify(msg)`
  - `finalAnswer(text)`
- Plugins expose services; Code Tool API wraps them. RAG helpers are reusable utilities.

---

## Detailed Plan & Tasks

### 1) Remove Classic Mode
- `src/agent.ts`: remove `chatMode` branching; always call `executeCodeAgent`.
- `src/index.ts`: remove `mode code` / `mode tools` commands and any classic-only REPL commands.
- `src/agentExecutorService.ts`: delete classic Tools Agent initialization/invocation. Retain only RAG helper logic if still referenced; otherwise extract (see Section 3).

### 2) Single Prompt Path (Code-Agent)
- Ensure base system prompt + code-agent header and a couple of few-shots are assembled consistently.
- Keep answer-first policy (+ optional small classifier prompt): if classifier says NONE → answer; else → emit code. (Optional; can be added later.)

### 3) RAG Consolidation
- Extract RAG helpers into `src/rag/ragHelpers.ts` used by `queryRAG` in Code Tool API:
  - History-aware query rewriter
  - Retriever + combine-docs chain
  - Strict citation/abstain behavior
- Keep vector-store lifecycle in `projectIngestor`/`projectStoreManager` as is.

### 4) Embeddings Provider & Metadata (Partially Implemented)
- Provider switch (OpenAI vs MLX server) centralized in `EmbeddingService` [DONE].
- Project/user-profile embeddings routed via `EmbeddingService` [DONE].
- Write `meta.json` with provider/model/dimensions and check on load [DONE].
- REPL `rebuild embeddings` command [DONE].
- Add startup health check for MLX embeddings server (optional).

### 5) Plugin Refactor (Compatibility Layer)
- Keep plugin contract: `initialize(config, services)`, `getScheduledTaskSetups()`, `getServices()`.
- Deprecate `getAgentTools()` (classic); introduce optional `getCodeTools()` returning `{ name, func }[]`.
- `src/pluginManager.ts`: collect code tools (or wrap `getServices()` into Code Tool API wrappers).
- Code Tool API (`src/codeAgent/tools.ts`) wraps high-value plugin services (GCal, Gmail, NextActions, Capture, etc.).

### 6) Sandbox Reliability
- Ensure stable injection:
  - Hidden references + async shims for each tool; `result: { copy: true, promise: true }` in `.apply`.
  - Console shims for log/error.
  - finalAnswer shim callable as a normal function.
- Provide `CODE_AGENT_DEBUG=1` diagnostics (bootstrap snippet, probes, emitted code prefix, full error stacks).

### 7) Routing (Keep)
- Keep `ModelRouterService` for chat/code-generation model selection.
- Remove function-calling–specific assumptions.
- Ensure router logs: provider/model, baseURL for local.

### 8) REPL Cleanup
- Keep: `rebuild embeddings`, project management commands, basic status.
- Remove classic-only listings (e.g., classic tool list).
- Optional: `code debug on/off` toggles `CODE_AGENT_DEBUG` at runtime.

### 9) Config Simplification
- Remove `chatMode` from defaults and docs.
- Keep `codeAgent.*` (attempts, timeouts, maxOutput, logging flags).
- Keep `routing.*` and `routing.providers.local.embeddings` (MLX server), now wired via env mapping.
- Keep `.env` as the only difference on the server (no local edits in `default.json`).

### 10) Tests
- Unit tests for Code Tool API shims (mock services; verify calls and normalized outputs).
- Integration smoke:
  - webSearch→fetchText→finalAnswer path
  - queryRAG with a temporary small store
  - schedule tool calling scheduler
- Sandbox probes under `CODE_AGENT_DEBUG=1` to validate tool availability.

### 11) Migration & Rollout
- Reindex projects when switching embedding model/provider:
  - Detect mismatch via `meta.json` and warn; user runs `rebuild embeddings`.
- Preserve plugin behavior by wrapping services; do not break plugin initialize lifecycle.
- Document migration in `docs/agent-guide.md` (already added) and update README (done).

### 12) Deletions After Green
- Remove classic agent pathways/files and docs references.
- Remove `getAgentTools()` usage; keep compatibility fallback via wrappers during transition if needed.

---

## Acceptance Criteria
- No `mode` commands; only Code-Agent path is active.
- Code Tool API covers prior functionality (web, RAG, notes, schedule, notifications, plugin services via wrappers).
- Startup logs show chat model/provider and embedding provider/model; vector store compatibility checked.
- RAG queries over freshly rebuilt stores return grounded answers.
- All tests pass; logs are clean under default settings.

## Risks & Mitigations
- Sandbox instability → We already hardened injection/return copying; keep diagnostic flag.
- Plugin regressions → Provide service wrappers; keep plugin lifecycle unchanged; test high-use plugins.
- RAG quality regressions after model switch → Require reindex; support hybrid retrieval/MMR later if needed.

## Timeline (Suggested)
1. Week 1: Remove modes, keep code-agent path; REPL cleanup; docs update.
2. Week 2: Plugin wrappers; RAG helper extraction; tests.
3. Week 3: Delete classic code; add optional pre-classifier; finalize rollout docs.

## Operational Notes
- Production servers should only differ via `.env`.
- Use the `rebuild embeddings` REPL command after content or provider changes.
- Keep logs shallow by default; enable `CODE_AGENT_DEBUG=1` only for troubleshooting.
