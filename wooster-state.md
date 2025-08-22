## Wooster State: Architecture Review and Recommendations

### Executive summary
- **Direction is solid**: Local-first design, Markdown-centric data, and a small plugin surface provide strong privacy and operability foundations.
- **Key gaps to close**: Centralize LLM/embedding providers, persist vector stores durably, bind services to localhost with nginx routing, and harden config/logging.
- **Outcome**: Wooster will “just run” on mlx-box using local chat + embeddings by default, while retaining clean fallbacks and clear observability.

---

## What Wooster does today (high level)
- **Agent runtime**: LangChain-based AgentExecutor orchestrates tools and plugins to fulfill user intents.
- **RAG memory**:
  - Per-project retrieval over documents in `projects/<name>/` via chunking + embeddings.
  - Optional separate User Profile memory.
- **Plugins**: Capture/inbox, sorting, daily review, personal health logs, Gmail, GCal, web search, minimal frontend, and a unified API surface.
- **Scheduling**: Human-friendly schedule parsing and timed actions.
- **Config and logs**: `config/*` driven with `.env` mapping; console/file logs and per-project chat transcripts.

---

## Design choices: what’s working well
- **Local-first data model**: Markdown, simple directories, and human-readable logs increase resilience and transparency.
- **Composable plugin architecture**: Clear separation of capabilities; easy to extend and test in isolation.
- **Router scaffolding**: A central `ModelRouterService` to select providers (OpenAI vs local) is the right place to concentrate policy.
- **Small web surface**: Minimal Express API + frontend makes it easy to proxy and secure with nginx.
- **Scheduler**: A useful backbone for automation and routines.

---

## Gaps and risks (and how to simplify)
### 1) LLM/Embedding provider sprawl
- Issue: Multiple direct `OpenAIEmbeddings` instantiations and partial local routing create configuration drift and dimension mismatches.
- Simplify:
  - Introduce a single, typed Provider layer:
    - `ChatModelProvider` (adapts local MLX server or OpenAI to a minimal chat interface)
    - `EmbeddingProvider` (HTTP embeddings client or OpenAI)
  - Make these the only entrypoints; forbid direct `OpenAIEmbeddings` usage in app code.

### 2) Vector store durability and rebuild friction
- Issue: In-memory vector store with ad-hoc JSON dumps; easy to lose; dimension changes require manual rebuilds.
- Simplify/durable:
  - Adopt a persistent local vector store:
    - Preferred: `sqlite` + `sqlite-vec`/`sqlite-vss` (fast, single-file, easy backup), or `pgvector` if Postgres is already installed.
  - Store and enforce `embedding_dimension` at index level; automatic rebuild when mismatched.

### 3) Config sprawl and weak typing at boundaries
- Issue: `config` + `.env` works but lacks type-safety and versioning.
- Simplify/harden:
  - Validate config at boot with a schema (e.g., `zod`) and produce one clear error report.
  - Version the config (e.g., `configVersion`) and run migrations when it changes.

### 4) Local-first by default, fallback cleanly
- Issue: Local routing present but not fully wired; health check endpoints don’t match MLX.
- Simplify:
  - Health check via `GET /v1/models` (MLX returns 200); drop custom `/health`.
  - Prefer local model; fallback to OpenAI on health or policy failure.

### 5) Observability and ops
- Issue: Logs are not fully aligned with mlx-box unified logging and ops workflows.
- Simplify/harden:
  - Emit JSON logs to `~/Library/Logs/com.mlx-box.wooster/`; preserve console logs for dev.
  - Add `/api/v1/health` for nginx checks; expose basic counters (requests, errors, routing decisions).
  - Rotate logs and provide a single “system report” akin to mlx-box.

### 6) Process supervision
- Issue: CLI-first; no always-on service file.
- Simplify:
  - Provide a launchd plist + a root-owned launcher script mirroring mlx-box services.

---

## Make it more powerful (without more complexity)
- **Profiles-based routing**: Use the existing profiles to route tasks to fast vs quality local models; escalate to cloud only on explicit opt-in or capability gaps.
- **Background indexing pipeline**: Queue new/changed files and batch-embed asynchronously; keep UI snappy.
- **Thin event bus**: A tiny typed event emitter between core and plugins for cross-plugin triggers (e.g., capture → sortInbox).
- **Simple policies**: Centralize PII and network policies in Router + Providers (e.g., “never send user profile to cloud”).
- **Intent templates**: Encourage projects to ship small prompt files (`prompt.txt`) and reusable task recipes.

---

## Make it more durable (production mode on mlx-box)
- **Networking**: Bind all Express servers to `127.0.0.1`; expose via nginx locations (`/wooster/`, `/wooster/api/`); keep the IP allowlist.
- **Service management**: launchd plist + health checks; on failure, restart and alert.
- **Backups**: Include `projects/`, `vector_data/` (or the sqlite/pgvector DB), and key logs in mlx-box backup routine.
- **Schema discipline**: Pin embedding dimension and model IDs in the index metadata; block mismatched writes.
- **Test surface**: Introduce a small test matrix: routing, embedding roundtrip, scheduler triggers, and two plugin smoke tests.

---

## Is this the right FOSS stack?
### What you’re using
- **Node/TypeScript**: Great for quick iteration, ecosystem, and integrating local tools.
- **LangChain JS**: Broad agent/tooling support. Some overhead but fine at current complexity.
- **MLX (Apple)**: Excellent fit for Apple Silicon; local chat + embeddings are performant and private.
- **Express**: Minimal, stable web surface; easy to proxy.

### Keep vs consider
- **Keep**:
  - Node/TS runtime, Express, and MLX-backed local services.
  - LangChain JS is acceptable; stick with a “minimal adapter” layer to isolate from framework churn.
- **Consider** (only if you feel pain):
  - Vector store: migrate to `sqlite` + `sqlite-vec`/`sqlite-vss` or `pgvector` for persistence and scale.
  - Logging: swap to `pino` for structured logs and speed.
  - Agent control flow: If you outgrow simple agents, evaluate `langgraphjs` once it’s mature; until then, keep routing + simple planners.

Overall: The stack is well-chosen for a personal server on Apple Silicon. The biggest wins now come from consolidation (providers), persistence (vector store), and ops (config/logs/launchd), not wholesale technology changes.

---

## Concrete, low-risk improvements (90-day plan)
1) Providers unification
   - Add `ChatModelProvider` and `EmbeddingProvider` abstractions; migrate all call sites.
   - Implement MLX HTTP clients (chat: `/v1/completions`, health: `/v1/models`; embed: `/v1/embeddings`).
2) Persisted vector store
   - Introduce `sqlite`-backed index with dimension metadata and a migration CLI.
3) Config and ports
   - Map `CHAT_URL`, `EMBED_URL`, `PLUGIN_FRONTEND_PORT`, `API_PORT` via env; validate with `zod`.
4) nginx + localhost
   - Bind to `127.0.0.1`; add `/wooster/` and `/wooster/api/` locations.
5) Observability
   - JSON logs to `~/Library/Logs/com.mlx-box.wooster/`; add `/api/v1/health`; include a mini system report.
6) Service management
   - Provide a launchd plist and root-owned launcher script; document start/stop flows.


