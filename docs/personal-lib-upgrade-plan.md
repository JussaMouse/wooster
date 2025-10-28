# Personal Library Upgrade: Step-by-Step Implementation Guide

This guide describes how to upgrade Wooster to the new Personal Library (p‑lib) architecture: an Obsidian‑friendly, Markdown‑first knowledge base with typed ingestion, hybrid retrieval (SQLite/FTS + vectors), Zettelkasten tools, and optional frontend. It consolidates the desired structure defined in `docs/personal-lib-implementation.md` and outlines concrete changes to the current projects/embeddings system.

## 0) Prerequisites and Safety

- Create a branch: `git checkout -b feature/personal-library`
- Back up current data:
  - `projects/` directory (journals, assets)
  - `vector_data/` stores
  - `database/scheduler.sqlite3`
  - `.user_profile/` (if enabled)
- Ensure local embedding server readiness if using MLX (see `docs/local-embedding-guide.md`).

## 1) Core Services

### 1.1 KnowledgeBaseService (KB)

- Purpose: canonical storage/query layer for notes and library content.
- Storage:
  - SQLite for metadata and FTS5 indices (tables below)
  - Vector index: Qdrant (local) or FAISS files (pluggable)
- Minimum tables (SQLite):
  - `documents(id, path, title, aliases_json, tags_json, created_at, updated_at, content_hash, namespace)`
  - `blocks(id, doc_id, kind, heading_path, start_offset, end_offset, text, block_hash)`
  - `links(src_block_id, dst_ref, resolved_doc_id, ref_kind)`
  - `tags(doc_id, tag)`
  - `fts_blocks(content) VIRTUAL USING fts5(tokenize='porter', content=blocks, content_rowid=id)`
  - `traces(id, ts, query, fts_hits_json, vector_hits_json, rerank_json, final_json, lat_ms)`
  - `eval_runs(id, ts, suite, metrics_json)`
- Namespaces:
  - `notes` (default), `books` (ingested library), `user_profile` (separate, gated)
- API surface (TS interface):
  - `indexDocuments(inputs: FilePartitionInput[]): Promise<void>`
  - `queryHybrid(args: { query: string; scope?: {namespace?: string; projectId?: string}; topK?: number; citations?: boolean }): Promise<QueryResult>`
  - `getBacklinks(docId: string): Promise<Link[]>`
  - `getUnlinkedMentions(docId: string): Promise<LinkProposal[]>`
  - `exportNamespace(ns: string, destZip: string, include?: string[]): Promise<string>`

### 1.2 IngestionService

- File watcher (chokidar) → job queue (SQLite backed) → partitioner.
- Partitioner:
  - Markdown (gray‑matter + remark/unified): frontmatter → doc record; paragraph/heading/code → blocks; wikilinks/transclusions; tags.
  - Other formats (optional): PDF/HTML/Docx via pdf-parse/cheerio/mammoth.
- Incrementality:
  - Compute content_hash (doc + block level); embed only changed blocks; batch embeddings (32–128).
  - Debounce bursts; backoff retries; safe on restart.

## 2) Embeddings Integration

- `EmbeddingService` becomes a thin provider for KB (project‑level stores deprecated):
  - Support local MLX server (Qwen3) and remote embeddings.
  - Write `meta.json` for dimensions/provider verification; warn on mismatch.
  - Expose `getEmbeddingModel(config)` and `embedBatch(texts: string[]): number[][]`.

## 3) Tools/API Surface (Code-Agent)

- Add ZK/KB tools in `src/codeAgent/tools.ts`:
  - `kb_ingest(globs|paths)` → enqueue ingestion jobs
  - `kb_query(query, scope)` → hybrid retrieval with citations
  - `zk_create({ title, body, tags? })`
  - `zk_edit({ id|path, body? , patch? })`
  - `zk_rename({ id, newTitle })`
  - `zk_alias({ id, alias })`
  - `zk_link({ srcId, dstRef })`
  - `zk_suggest_links({ id })`
  - `zk_export({ dest, include? })`
- Deprecate `queryRAG` (keep thin wrapper for transition; route to `kb_query`).
- Normalize return shapes; never throw—return concise error strings on failure.

## 4) Agent Execution Changes

- Classifier gate (already present): `NONE` vs `TOOLS` and KB heuristics.
- Update prompt header to include new tools and “cite when using kb_query”.
- Post‑processor: if LLM emits KB code block while decision=NONE, dispatch via KB service (mirrors current Signal post‑processing approach).

## 5) Scheduler & Daily Review

- Add jobs:
  - Nightly `zk_export` to `backups/notes-YYYYMMDD.zip` (optional encrypt)
  - Daily digest via Signal: unlinked mentions, orphan notes, stale notes, recent edits
  - Nightly eval sample (small suite) → summarize “Knowledge Quality” in Daily Review

## 6) Projects Integration (Project as Note)

- Model: project = note with `type: project`; assets remain under `projects/<slug>/` (frontmatter `assets_dir`).
- Active project: `activeProjectId` stored by agent/session; `kb_query` with `scope.projectId` limits to project neighborhood (project note + backlinks + configurable 1‑hop).
- Update projectManager plugin:
  - `createProject` → create project note (+ assets_dir);
  - `openProject` → set activeProjectId;
  - `listFilesInActiveProject` → list notes linking to project note + assets_dir files.
- Migration tool:
  - For each `projects/<name>/`:
    - Create project note with `type: project`, copy `<name>.md` body, store `prompt.txt` in `prompt` field, set `assets_dir`.
    - Keep folder for assets; index it.

## 7) User Profile Integration (Separate Namespace)

- Keep `user_profile` separate; exclude from general `kb_query` by default.
- Migrate from `user_profile_vector_store.json` to KB records:
  - Each fact becomes a doc/block in `user_profile` namespace (frontmatter: `type: profile_fact`, category/value).
- Tools `save_user_profile` / `recall_user_profile` call KB with namespace filter; prefer local models.

## 8) Frontend (MVP, no graph)

- Serve via existing frontend plugin (Next.js or Vite SPA):
  - File tree, tags, recent; Markdown editor + preview; backlinks + unlinked mentions; status chip (Indexed/Indexing);
  - Global search: FTS (instant) with optional Semantic/Hybrid toggle (async, with citations).
- Endpoints (examples):
  - Notes CRUD: `GET/POST/PUT/DELETE /api/notes`, `GET /api/notes/:id/backlinks`, `GET /api/notes/:id/unlinked`
  - ZK helpers: `POST /api/zk/create|alias|link|suggest_links`
  - KB: `POST /api/kb/query`
  - Status: `GET /api/kb/status`, `GET /api/kb/stats`

## 9) Config & Env

- `config/default.json` additions:
  - `personalLibrary`: `{ dbPath, vector: { provider: 'qdrant'|'faiss', path|url, dims }, namespaces, privacy: { excludeTags: ['private'] } }`
  - `routing.providers.local.embeddings` (if using MLX—see `docs/local-embedding-guide.md`)
- `config/custom-environment-variables.json` map:
  - `PERSONAL_LIBRARY_DB_PATH`, `PERSONAL_LIBRARY_VECTOR_PROVIDER`, `PERSONAL_LIBRARY_VECTOR_PATH`, `PERSONAL_LIBRARY_EXCLUDE_TAGS`

## 10) Migration Steps

1. Ship KB + IngestionService; keep old RAG intact.
2. Run one‑time project migration tool to create project notes with `assets_dir`.
3. Bulk ingest `notes/` and `projects/*` folders into KB; verify FTS and vector indices.
4. Switch `queryRAG` wrapper to call `kb_query`; update agent prompts to enforce citations when KB used.
5. Enable nightly `zk_export` and daily digests.
6. Migrate user profile JSON → KB namespace; verify `save/recall_user_profile`.
7. Enable frontend MVP; keep local‑only bind; test CRUD/search.

## 11) Performance Tuning

- Ingestion: batch embeddings (32–128), debounce file events, hash blocks, WAL mode for SQLite.
- Retrieval defaults: FTS N=50, Dense N=50, re‑rank to K=10; reranker only for long/ambiguous queries.
- Qdrant HNSW: `m=24`, `ef_search=96` (tune per machine); consider f16/PQ for large corpora.
- Caching: LRU for recent queries and alias resolves; warm DB/collections at startup.
- Gating: strict KB classifier; avoid KB when not requested.

## 12) Testing

- Unit:
  - Partitioner (frontmatter parsing, blocks, links)
  - KB index/query (FTS only, Dense only, Hybrid with reranker)
  - ZK tools (create/edit/rename/alias/link/suggest_links)
  - Project migration creation and scoping
  - User profile migration and queries
- Integration:
  - End‑to‑end kb_query with citations; scheduler jobs; frontend CRUD/search flows
- Regression:
  - Ensure legacy project flows continue during transition; verify scheduler unaffected

## 13) Rollout Plan

- Phase A (dark launch): ship KB/ingestion disabled by default; run migration/ingest offline; validate.
- Phase B: enable `kb_query` wrapper + citations; keep old RAG as fallback.
- Phase C: enable scheduler digests/exports; migrate user profile; toggle frontend MVP.
- Phase D: mark legacy project vector stores deprecated; remove dead code after confidence window.

## 14) Risk & Mitigation

- Latency regressions → strict gating, tuned topN, optional reranker skip, traces to diagnose.
- Data loss risk in migration → backup + idempotent migrator; atomic writes; dry‑run mode.
- Privacy leakage → user_profile namespace isolation; explicit “Include library” toggle; privacy tag excludes from vectors.

---

## Appendix A: Example Frontmatter Templates

### Project note
```yaml
---
id: 20251028-proj-espresso-machine
type: project
title: Fix Espresso Machine
status: active
area: home
created: 2025-10-28
due: 2025-11-15
tags: [project, home]
assets_dir: projects/espresso-machine
prompt: |
  When scoped here, prefer coffee-repair docs and vendors.
---
```

### Standard note
```yaml
---
id: 20251028-note-hybrid-retrieval
title: Hybrid Retrieval Defaults
aliases: [Hybrid Retrieval]
tags: [retrieval, reranking, zettelkasten]
created: 2025-10-28
updated: 2025-10-28
---
```

### Profile fact (user_profile namespace)
```yaml
---
id: 20251028-prof-favorite-color
type: profile_fact
category: favorite color
value: blue
created: 2025-10-28
---
```


