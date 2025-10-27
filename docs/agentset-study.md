## Wooster + mlx-box vs. Agentset: Architecture, Gaps, and Adoption Ideas

This study compares Wooster (with mlx-box for local model hosting) to Agentset, and proposes concrete upgrades to make Wooster a more efficient, accurate, and capable knowledge-maintaining-and-expanding exocortex.

References: [Agentset GitHub](https://github.com/agentset-ai/agentset), [Agentset Self‑hosting guide](https://docs.agentset.ai/open-source/self-hosting), [Production RAG: processing 5M+ documents (Abdellatif)](https://blog.abdellatif.io/production-rag-processing-5m-documents)

### 1) High‑level architecture comparison

- Wooster + mlx‑box
  - Local-first agentic CLI/service with a plugin system (Signal, Next Actions, Daily Review, Calendar/Weather, etc.).
  - Retrieval via a simple project vector store (JSON + embeddings) and LangChain chains; ingestion is filesystem-based and permissive but not deeply typed.
  - Scheduler (Croner + SQLite/sql.js) to run AGENT_PROMPT and DIRECT_FUNCTION tasks.
  - Delivery channels (Signal) for proactive nudges and Daily Review; strong personal automation/GTD orientation.
  - mlx-box provides production-y local LLM hosting with reverse proxy, SSL, firewall, and launchd services (macOS), complementing Wooster’s local-first privacy stance.

- Agentset
  - End-to-end RAG and agentic platform with turnkey ingestion, chunking/partitioning, indexing, search API, chat playground, evals/benchmarks, and production hosting.
  - Typed SDKs, OpenAPI, multi-tenancy; modern web stack (TypeScript, Next.js), workflow orchestration (Trigger.dev), queues (Upstash), DB (Supabase), and object storage (Cloudflare R2) per self-hosting docs.
  - Emphasis on quality controls: built-in evals, citations, re-ranking, and observability to sustain accuracy at scale.

### 2) Feature matrix (abridged)

| Capability | Wooster + mlx-box | Agentset |
| --- | --- | --- |
| Ingestion/partitioning | Project folder scan; permissive file glob; minimal typing | Turnkey ingestion; robust partitioning across 22+ formats; namespaces |
| Indexing | JSON-backed store per project; OpenAI/Qwen embeddings | Vector DB integrations; managed and self-hosted options; re-runs, upserts |
| Retrieval | Basic semantic search; LangChain RAG | Hybrid retrieval, re-ranking, citations out-of-the-box |
| Evals/QA | None | Built-in evals/benchmarks; quality tracking |
| Orchestration | Cron + in-proc scheduler | Trigger.dev-style workflows/queues |
| Multi-tenancy | Single-user local persona | First-class multi-tenancy |
| UI/Playground | CLI; minimal frontend plugin | Full web app/chat playground |
| Observability | Structured logs; script-based tailing | Productized telemetry and evaluation metrics |
| Delivery | Signal, email | Web UI, APIs; notifications depend on app layer |
| Hosting | Local-first (mlx-box on macOS) | Vercel + managed services (self-host recipe) |

### 3) Where Wooster is strong

- Personal agent workflows: GTD plugins, Daily Review, Signal-first delivery, scheduler integration for reminders and proactive check-ins.
- Local-first privacy and offline capability via mlx-box; robust macOS operationalization (nginx, SSL, firewall, launchd).
- Hackable plugin model and clear scheduler API for personal automations.

### 4) Gaps vs Agentset’s production RAG posture

- Ingestion depth and document understanding:
  - No structured partitioner-friendly pipeline; limited MIME/type-aware chunking; minimal metadata lineage.
- Retrieval and ranking quality:
  - No hybrid retrieval (lexical + dense), no learned re-ranker, limited citation discipline.
- Evals and quality loops:
  - No eval harness, drift detection, or benchmark tracking over time.
- Observability and operations:
  - Logs exist but lack per-query tracing, success/error taxonomies, retrieval telemetry, and quality dashboards.
- Scale posture:
  - Single-user, single-tenant; no queues for heavy ingestion; tied to local JSON store; limited change-detection/incrementality.

### 5) Adoptable ideas to improve efficiency, accuracy, and capability

1) Typed ingestion pipeline and namespaces (Agentset-style)
   - Add an ingestion service that:
     - Detects file type and partitions using a best-effort heuristic (PDF/HTML/Docx/MD/Code). Persist structured blocks with metadata (title, headings, page/section, source path, timestamp hash, content-type, language).
     - Stores content records in a lightweight local DB (SQLite or DuckDB) with a stable schema: documents, partitions, chunks, embeddings, and a change ledger.
     - Supports “namespaces” mapped to Wooster projects, plus cross-project views for “notes search”.
   - Benefits: consistent chunk quality, better retrieval metadata, incremental updates.

2) Incremental and evented re-indexing
   - Watch filesystem changes and queue ingestion jobs (debounced) for modified files; keep content-hash to skip unchanged chunks.
   - Batch and backoff policies; resumable work queues (simple local queue) for stability.

3) Hybrid retrieval + re-ranking and citations
   - Add BM25/keyword retrieval alongside vector similarity; merge and re-rank with a cross-encoder or small reranker model.
   - Always return citations with source spans; encourage grounded answers.
   - Start pragmatically: use a quality reranker (e.g., Cohere Rerank or local small reranker) and keep a configurable topK.

4) Lightweight evals in local-first mode
   - Implement an eval harness that logs per-query:
     - Inputs, retrieved contexts, chosen answer, citations, and a compact rubric score (LLM-as-judge or rule-based checks for faithfulness/coverage).
   - Track rolling metrics in SQLite/CSV; daily summary via Daily Review (“knowledge quality” section) to close the loop.

5) Retrieval observability and query traces
   - Emit a retrieval trace object per question: tokenized query, filters, candidate sets, scores before/after re-rank, selected chunks, and latency budget.
   - Add a dev UI page in the existing frontend plugin to explore traces and failures.

6) Storage and performance upgrades (still local)
   - Move from JSON vector store to:
     - FAISS on-disk indices, or local Qdrant (optional) with a lean wrapper.
     - DuckDB/SQLite for metadata tables and full-text indexes (FTS5) to power hybrid search.
   - Keep Wooster plug-in simplicity; hide complexity in a new `IngestionService` and `KnowledgeBaseService`.

7) Namespaced knowledge tools for the agent
   - Expose tools to the agent:
     - `kb_ingest(paths|globs)`; `kb_rebuild(namespace)`; `kb_query(query, namespace|scope)`; `kb_eval(sample|suite)`.
   - Update the system prompt to enforce citations and prefer hybrid retrieval for factual questions.

8) Orchestration patterns without cloud vendors
   - Borrow the Trigger.dev idea (durable steps, retries), but implement a minimal local job runner with:
     - Durable job records, idempotency keys, retry/backoff, and cancellation.
     - Used by ingestion, re-indexing, and long-running evals.

9) “Knowledge freshness” and drift detection
   - Nightly jobs to sample N queries from a corpus, run evals, compare against baselines, and flag regressions in the Daily Review.
   - Track content-age distributions per namespace and suggest re-triage.

10) Pragmatic web UI lift
   - A minimal “Playground” page for:
     - Query + retrieved contexts + answer with citations.
     - Ingestion status and eval dashboards.
   - Keep Signal as the primary “push” channel; UI is for diagnostics and bulk ops.

### 6) Concrete near-term roadmap (2–4 weeks)

Phase 1 — Foundations
- Introduce `KnowledgeBaseService` (DuckDB/SQLite + FAISS) and `IngestionService` (typed partitioning, metadata schema, incremental hashing).
- Implement hybrid retrieval (FTS5 + cosine) with a pluggable reranker; emit citations.
- Wrap with tools: `kb_ingest`, `kb_query`, and enforce citations in the agent prompt.

Phase 2 — Quality and ops
- Add eval harness and per-query traces; surface a “Knowledge Quality” module in Daily Review.
- Add a simple job runner with durable retries for ingestion and evals; integrate with SchedulerService.

Phase 3 — UX
- Minimal frontend panel (existing frontend plugin) for traces, evals, and ingestion status.

### 7) Why these ideas align with Wooster’s philosophy

- Local-first and privacy-preserving: all suggested components run on-device (SQLite/DuckDB/FAISS, optional local Qdrant). mlx-box continues to handle secure hosting and ops.
- Personal exocortex vs. multi-tenant platform: we selectively adopt Agentset’s quality and observability practices without adopting its cloud-heavy stack.
- Strong GTD integration: eval summaries and ingestion status flow into Signal/Daily Review, closing the loop with your workflows.

### 8) Risks and mitigations

- Complexity creep: keep the ingestion and KB services modular with default-on reasonable heuristics; advanced config hidden by defaults.
- Performance on large corpora: benchmark early; cap chunk sizes; progressively enable re-rank only when needed.
- Reliability: job runner + durable metadata; idempotent ingestion; traceable errors.

### 9) Summary

Agentset sets a high bar for production RAG with robust ingestion, retrieval quality, evals, and ops. Wooster excels at local-first personal automations and daily decision support. By adopting Agentset-inspired ingestion, hybrid retrieval with re-ranking, consistent citations, evals, and lightweight observability—all locally—we can significantly raise Wooster’s accuracy and scale while preserving its privacy and GTD strengths.

Sources: [Agentset GitHub](https://github.com/agentset-ai/agentset), [Agentset Self‑hosting](https://docs.agentset.ai/open-source/self-hosting), [Abdellatif’s production RAG post](https://blog.abdellatif.io/production-rag-processing-5m-documents)


