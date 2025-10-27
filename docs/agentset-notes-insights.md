## Agentset-informed insights for a Wooster Zettelkasten (Obsidian-like)

References: [Agentset GitHub](https://github.com/agentset-ai/agentset), [Agentset Self‑hosting](https://docs.agentset.ai/open-source/self-hosting), [Production RAG at scale (Abdellatif)](https://blog.abdellatif.io/production-rag-processing-5m-documents)

### Goals for Wooster’s Zettelkasten

- Atomic, durable notes with stable identities and rich metadata.
- First-class backlinks, aliases, tags, and transclusion.
- High-accuracy retrieval (hybrid search + re-ranking) with grounded citations.
- Incremental ingestion and robust link maintenance on edits/renames.
- Local-first operation (mlx-box), strong observability, and scheduled curation (Daily Review, reminders).

### 1) Note model and metadata (inspired by Agentset’s typed ingestion)

- Use Markdown with YAML frontmatter; standardize fields so ingestion is deterministic and incremental:

```yaml
---
id: 20251027-142355-zk-wd1zv8   # immutable stable ID (date+nonce)
title: How to implement hybrid retrieval in Wooster
aliases: [Hybrid Retrieval in Wooster]
tags: [retrieval, reranking, zettelkasten]
created: 2025-10-27T14:23:55-07:00
updated: 2025-10-27T14:23:55-07:00
source: personal
links_out: [ [ [Unlinked mentions], [Rerankers] ] ]
---
```

- Treat the note body as the canonical content; maintain a derived “partition” table for headings/blocks (Agentset-style partitioning). Store per-block offsets for precise citations.
- Enforce immutable `id` + mutable `title`; on rename, update `aliases` and preserve all inbound links via ID/alias resolution.

### 2) Ingestion and partitioning pipeline

- Build an `IngestionService` that parses Markdown into:
  - document record (frontmatter + file stats)
  - block records: headings, paragraphs, code blocks, tables
  - link graph edges: wikilinks `[[Note Title]]`, `[[ID]]`, embedded transclusions `![[...]]`
  - tag index: `#tag` and frontmatter tags
- Record content-hash per block and per document for incremental updates; skip embedding churn unless content changed.

### 3) Indexing stack (hybrid like Agentset)

- Vector index: embeddings per block (+ per-note centroid) for semantic retrieval.
- Full‑text index (SQLite FTS5 or DuckDB FTS) for lexical search and boolean/tag queries.
- Link graph: adjacency lists, backlink index, and “unlinked mention” candidate edges (computed via lexical/semantic similarity without explicit link).
- Metadata tables: tags, aliases, created/updated time, namespace (project/notebook).
- Storage: local-first (SQLite/DuckDB for metadata + FAISS/Qdrant-local for vectors). Keep compatibility with current `vector_data/` layout.

### 4) Retrieval and answering tactics

- Hybrid retrieval: BM25/FTS + vector; merge and de‑duplicate, then re‑rank with a cross-encoder/small reranker. This mirrors Agentset’s accuracy posture.
- Always return citations: note IDs + block spans. Encourage grounded synthesis in agent outputs.
- Support graph‑aware expansion: if a retrieved block has strong backlinks or transclusions, pull k-hop neighbors with decaying weights.
- Namespace-aware queries: default to active project; allow cross‑notebook scopes.

### 5) Authoring flows and tools (agent + CLI)

- Tools/APIs:
  - `zk_create(title, body, tags[])` → creates note with stable ID and default template (daily note friendly).
  - `zk_link(srcId, dstRef)` → resolves `dstRef` by ID/alias/title and writes wikilink; updates graph.
  - `zk_alias(id, alias)` → appends to aliases; backfills link resolution.
  - `zk_refactor_split(id, headings[])` → splits into atomic zettels; updates links and aliases.
  - `zk_rename(id, newTitle)` → adds old title to `aliases`; updates outgoing links (optional), backlinks remain stable via ID.
  - `zk_suggest_links(id)` → proposes candidate links using hybrid similarity + reranker.
  - `zk_query(q, scope)` → returns ranked blocks + citations.
- Scheduled jobs (SchedulerService):
  - Daily: “Unlinked references review” and “Orphan notes” list via Signal.
  - Weekly: Tag hygiene report; backlink anomalies; stale notes to revisit.

### 6) Observability and evals (borrow Agentset’s discipline)

- Per-query retrieval trace: raw query, filters, candidate sets (FTS + vector), scores before/after re‑rank, chosen contexts, and latencies. Store in SQLite and expose in frontend plugin.
- Lightweight eval harness: sample prompts + expected anchors (tags/notes) to measure coverage and faithfulness. Summarize in Daily Review.
- Change-impact tracing: on ingestion deltas, record which notes moved in/out of top‑k for a standard eval set.

### 7) Data layout and rename safety

- Keep notes as plain `.md` in project folders (Obsidian‑compatible).
- Maintain a persistent `aliases` table mapping titles/aliases → stable IDs. Link writer prefers `[[ID]]` display `[[Title]]` for resilience; reader resolves either.
- Store indices under `vector_data/<namespace>/` (already aligned with Wooster). Consider `kb.sqlite` (metadata/FTS) + `faiss.index`.

### 8) Minimal UI: graph and traces

- Extend the existing frontend plugin with two panels:
  - Note Graph: force‑directed graph of backlinks/tags with search; click to open file path.
  - Retrieval Traces: inspect a query’s candidate sets, scores, and final citations.
- Keep Signal as primary proactive surface (suggestions/reviews); UI serves diagnostics and bulk ops.

### 9) Roadmap (incremental, local-first)

1. Foundations: metadata schema, partitioner, hashes; FTS5 + embeddings; citations in answers.
2. Hybrid retrieval + reranking; link graph; unlinked suggestions tool; traces.
3. Tools for create/rename/alias/refactor; daily/weekly jobs and Signal delivery.
4. UI panels for graph and traces; lightweight eval harness and Daily Review summaries.

### 10) Why Agentset’s approach maps well

- Typed ingestion and hybrid retrieval deliver accuracy and resilience for knowledge systems.
- Evals and observability ensure quality does not silently degrade as the corpus grows.
- Namespaces map naturally to Wooster projects; everything remains local via mlx‑box.


