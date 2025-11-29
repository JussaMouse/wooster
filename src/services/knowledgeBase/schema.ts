export const SCHEMA_SQL = `
-- Enable WAL mode for better concurrency
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    namespace TEXT NOT NULL DEFAULT 'notes'
);

CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
CREATE INDEX IF NOT EXISTS idx_documents_namespace ON documents(namespace);

-- Blocks table (atomic units of content)
CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    heading_path TEXT NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    text TEXT NOT NULL,
    block_hash TEXT NOT NULL,
    FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocks_doc_id ON blocks(doc_id);

-- Links table (the graph)
CREATE TABLE IF NOT EXISTS links (
    src_block_id TEXT NOT NULL,
    dst_ref TEXT NOT NULL,
    resolved_doc_id TEXT,
    ref_kind TEXT NOT NULL,
    FOREIGN KEY(src_block_id) REFERENCES blocks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_links_src ON links(src_block_id);
CREATE INDEX IF NOT EXISTS idx_links_resolved ON links(resolved_doc_id);

-- Normalized Tags table for fast filtering
CREATE TABLE IF NOT EXISTS tags (
    doc_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY(doc_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

-- FTS5 Virtual Table for Full-Text Search
-- We use 'content' option to point to blocks table. 
-- Note: blocks.rowid is the implicit integer key used for joining.
CREATE VIRTUAL TABLE IF NOT EXISTS fts_blocks USING fts5(
    text,
    content='blocks',
    tokenize='porter'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN
  INSERT INTO fts_blocks(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS blocks_ad AFTER DELETE ON blocks BEGIN
  INSERT INTO fts_blocks(fts_blocks, rowid, text) VALUES('delete', old.rowid, old.text);
END;

CREATE TRIGGER IF NOT EXISTS blocks_au AFTER UPDATE ON blocks BEGIN
  INSERT INTO fts_blocks(fts_blocks, rowid, text) VALUES('delete', old.rowid, old.text);
  INSERT INTO fts_blocks(rowid, text) VALUES (new.rowid, new.text);
END;


-- Traces for observability
CREATE TABLE IF NOT EXISTS traces (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    query TEXT NOT NULL,
    fts_hits_json TEXT,
    vector_hits_json TEXT,
    rerank_json TEXT,
    final_json TEXT,
    lat_ms INTEGER
);

-- Eval runs
CREATE TABLE IF NOT EXISTS eval_runs (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    suite TEXT NOT NULL,
    metrics_json TEXT
);
`;

