export interface DocumentRecord {
  id: string;
  path: string;
  title: string;
  aliases_json: string; // JSON string of string[]
  tags_json: string; // JSON string of string[]
  created_at: number; // Timestamp
  updated_at: number; // Timestamp
  content_hash: string;
  namespace: string;
}

export interface BlockRecord {
  id: string;
  doc_id: string;
  kind: 'paragraph' | 'heading' | 'code' | 'list_item' | 'blockquote' | 'metadata';
  heading_path: string;
  start_offset: number;
  end_offset: number;
  text: string;
  block_hash: string;
}

export interface LinkRecord {
  src_block_id: string;
  dst_ref: string; // The raw link text e.g. "My Note"
  resolved_doc_id: string | null; // The resolved doc ID if found
  ref_kind: 'wikilink' | 'transclusion' | 'url';
}

export interface TagRecord {
  doc_id: string;
  tag: string;
}

export interface TraceRecord {
  id: string;
  ts: number;
  query: string;
  fts_hits_json: string;
  vector_hits_json: string;
  rerank_json: string;
  final_json: string;
  lat_ms: number;
}

export interface EvalRunRecord {
  id: string;
  ts: number;
  suite: string;
  metrics_json: string;
}

export interface QueryResult {
  contexts: {
    docId: string;
    blockId: string;
    text: string;
    score: number;
    metadata: any;
  }[];
  traceId?: string;
}

export interface KBQueryArgs {
  query: string;
  scope?: {
    namespace?: string;
    projectId?: string;
  };
  topK?: number;
  citations?: boolean;
}

export interface FilePartitionInput {
  path: string;
  content: string;
  stat: {
    mtimeMs: number;
    birthtimeMs: number;
  };
}

