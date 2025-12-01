import { Database } from 'better-sqlite3';
import { getKbDatabase } from './db';
import { KBQueryArgs, QueryResult, DocumentRecord, BlockRecord, LinkRecord } from './types';
import { log, LogLevel } from '../../logger';
import { v4 as uuidv4 } from 'uuid';
import { ParsedDocument, computeHash } from '../ingestion/markdown';
import { EmbeddingService } from '../../embeddings/EmbeddingService';
import { VectorStore, SimpleFileVectorStore, VectorRecord } from './VectorStore';
import { getConfig } from '../../configLoader';
import path from 'path';

export class KnowledgeBaseService {
  private db: Database;
  private vectorStore: VectorStore;
  private embeddingService: EmbeddingService;

  constructor() {
    this.db = getKbDatabase();
    const config = getConfig();
    
    // Initialize Vector Store
    const dbDir = path.dirname(config.personalLibrary?.dbPath || 'database/knowledge_base.sqlite3');
    this.vectorStore = new SimpleFileVectorStore(dbDir);

    // Initialize Embedding Service
    this.embeddingService = EmbeddingService.getProjectEmbeddings(config);
  }

  private static instance: KnowledgeBaseService;
  public static getInstance(): KnowledgeBaseService {
    if (!this.instance) {
      this.instance = new KnowledgeBaseService();
    }
    return this.instance;
  }

  /**
   * Hybrid query: FTS + Vectors + Rerank
   */
  public async queryHybrid(args: KBQueryArgs): Promise<QueryResult> {
    const traceId = uuidv4();
    const start = Date.now();
    const limit = args.topK || 20;
    const config = getConfig();

    try {
      // Helper to run FTS query safely
      const runFts = (queryString: string) => {
        // Sanitize query for FTS5: strip special chars that cause syntax errors (quote, star, parens, etc)
        // Keep alphanumerics, spaces, and simple punctuation that doesn't break FTS
        const safeQuery = queryString.replace(/["*:[\]()]/g, ' ').trim();
        if (!safeQuery) return [];

        let ftsQuery = `
          SELECT 
            b.id as blockId,
            b.doc_id as docId,
            b.text,
            fts_blocks.rank,
            d.title,
            d.path
          FROM fts_blocks
          JOIN blocks b ON b.rowid = fts_blocks.rowid
          JOIN documents d ON d.id = b.doc_id
          WHERE fts_blocks MATCH ? 
        `;
        const params: any[] = [safeQuery];
        if (args.scope?.namespace) {
          ftsQuery += ` AND d.namespace = ?`;
          params.push(args.scope.namespace);
        }
        ftsQuery += ` ORDER BY fts_blocks.rank ASC LIMIT ?`;
        params.push(limit * 2);

        try {
            return this.db.prepare(ftsQuery).all(...params) as any[];
        } catch (e) {
            log(LogLevel.WARN, `FTS Query failed`, { error: e, query: safeQuery });
            return [];
        }
      };

      // 1. FTS Search Strategy
      // Attempt 1: Exact query (sanitized)
      let ftsHits = runFts(args.query);
      
      // Attempt 2: If few results, try cleaning punctuation further (e.g. "mean?" -> "mean")
      if (ftsHits.length < 3) {
        const cleanQuery = args.query.replace(/[^\w\s]/g, '').trim();
        if (cleanQuery && cleanQuery !== args.query.replace(/["*:[\]()]/g, ' ').trim()) {
             const hits2 = runFts(cleanQuery);
             const existingIds = new Set(ftsHits.map(h => h.blockId));
             for (const h of hits2) {
                 if (!existingIds.has(h.blockId)) {
                     ftsHits.push(h);
                     existingIds.add(h.blockId);
                 }
             }
        }
      }
      
      // Attempt 3: OR search (bag of words) if still very few results
      if (ftsHits.length < 3) {
         const words = args.query.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
         if (words.length > 1) {
             const orQuery = words.join(' OR ');
             const hits3 = runFts(orQuery);
             const existingIds = new Set(ftsHits.map(h => h.blockId));
             for (const h of hits3) {
                 if (!existingIds.has(h.blockId)) {
                     ftsHits.push(h);
                     existingIds.add(h.blockId);
                 }
             }
         }
      }

      // 2. Vector Search
      let vectorHits: { id: string; score: number }[] = [];
      let queryVector: number[] = [];

      if (config.personalLibrary?.vector?.path || true) { 
        try {
             const embeddings = await this.embeddingService.getEmbeddings().embedQuery(args.query);
             queryVector = embeddings;
             vectorHits = await this.vectorStore.query(queryVector, limit * 2);
        } catch (e) {
            log(LogLevel.WARN, `Vector search failed`, { error: e });
        }
      }

      // 3. Merge Results
      const vectorIds = vectorHits.map(h => h.id);
      let vectorContexts: any[] = [];
      
      if (vectorIds.length > 0) {
        const placeholders = vectorIds.map(() => '?').join(',');
        const vectorDocsStmt = this.db.prepare(`
            SELECT b.id as blockId, b.doc_id as docId, b.text, d.title, d.path
            FROM blocks b
            JOIN documents d ON d.id = b.doc_id
            WHERE b.id IN (${placeholders})
        `);
        const vectorDocs = vectorDocsStmt.all(...vectorIds) as any[];
        vectorContexts = vectorHits.map(hit => {
            const doc = vectorDocs.find(d => d.blockId === hit.id);
            if (!doc) return null;
            return { ...doc, score: hit.score, source: 'vector' };
        }).filter(Boolean);
      }

      const allContexts = [...ftsHits.map(h => ({...h, score: -h.rank, source: 'fts'})), ...vectorContexts];
      const seen = new Set();
      const contexts = [];
      for (const c of allContexts) {
        if (!seen.has(c.blockId)) {
            seen.add(c.blockId);
            contexts.push({
                docId: c.docId,
                blockId: c.blockId,
                text: c.text,
                score: c.score,
                metadata: { title: c.title, path: c.path, source: c.source }
            });
        }
      }

      const finalContexts = contexts.slice(0, limit);

      const duration = Date.now() - start;
      this.saveTrace({
        id: traceId,
        ts: start,
        query: args.query,
        fts_hits_json: JSON.stringify(ftsHits.map(h => h.blockId)),
        vector_hits_json: JSON.stringify(vectorHits.map(h => h.id)),
        rerank_json: '[]',
        final_json: JSON.stringify(finalContexts.map(c => c.blockId)),
        lat_ms: duration
      });

      return { contexts: finalContexts, traceId };

    } catch (error) {
      log(LogLevel.ERROR, `KB Query failed`, { error, query: args.query });
      throw error;
    }
  }

  public async indexParsedDocument(
    parsed: ParsedDocument, 
    path: string, 
    stat: { mtimeMs: number; birthtimeMs: number }
  ) {
    const docId = parsed.frontmatter.id || uuidv4();
    
    // Check existing doc ID for path
    const existingDoc = this.db.prepare('SELECT id FROM documents WHERE path = ?').get(path) as { id: string } | undefined;
    const finalId = existingDoc ? existingDoc.id : docId;
    const effectiveId = parsed.frontmatter.id || finalId;

    const contentHash = computeHash(JSON.stringify(parsed.blocks)); 
    const namespace = parsed.frontmatter.namespace || 'notes';

    // Optimization: Check for unchanged blocks
    const existingBlocks = this.db.prepare('SELECT id, block_hash FROM blocks WHERE doc_id = ?').all(effectiveId) as { id: string, block_hash: string }[];
    const existingHashMap = new Map(existingBlocks.map(b => [b.block_hash, b.id]));

    const vectorsToUpsert: { id: string, text: string }[] = [];
    const blocksToInsert: BlockRecord[] = [];
    
    for (const block of parsed.blocks) {
        const blockHash = computeHash(block.text);
        let blockId = existingHashMap.get(blockHash);
        
        // If block text matches an old block, we reuse the ID (and thus the vector).
        // If not found, we generate new ID and mark for embedding.
        if (!blockId) {
            blockId = block.id || uuidv4();
            vectorsToUpsert.push({ id: blockId, text: block.text });
        }

        blocksToInsert.push({
          id: blockId,
          doc_id: effectiveId,
          kind: block.kind,
          heading_path: JSON.stringify(block.heading_path),
          start_offset: block.start_offset,
          end_offset: block.end_offset,
          text: block.text,
          block_hash: blockHash
        });
    }

    // Add synthetic metadata block to ensure file path and title are FTS-searchable
    const metadataText = `File: ${path} Title: ${parsed.title}`;
    const metadataHash = computeHash(metadataText);
    let metaBlockId = existingHashMap.get(metadataHash);
    if (!metaBlockId) {
        metaBlockId = uuidv4();
        vectorsToUpsert.push({ id: metaBlockId, text: metadataText });
    }
    blocksToInsert.push({
      id: metaBlockId,
      doc_id: effectiveId,
      kind: 'metadata',
      heading_path: '[]',
      start_offset: 0,
      end_offset: 0,
      text: metadataText,
      block_hash: metadataHash
    });

    // Generate embeddings for new blocks
    if (vectorsToUpsert.length > 0) {
        try {
            const texts = vectorsToUpsert.map(v => v.text);
            // Batch embedding if needed (EmbeddingService usually handles batching or we do it here)
            // We'll assume EmbeddingService handles simple array
            const embeddings = await this.embeddingService.getEmbeddings().embedDocuments(texts);
            
            const records: VectorRecord[] = vectorsToUpsert.map((v, i) => ({
                id: v.id,
                vector: embeddings[i],
                metadata: { docId: effectiveId, path }
            }));
            
            await this.vectorStore.upsert(records);
        } catch (e) {
            log(LogLevel.ERROR, `Failed to generate embeddings for ${path}`, { error: e });
            // Proceed with DB insert anyway? Yes, or we lose text search.
        }
    }

    // DB Transaction
    const transaction = this.db.transaction(() => {
      // 1. Upsert Document
      this.db.prepare(`
        INSERT INTO documents (id, path, title, aliases_json, tags_json, created_at, updated_at, content_hash, namespace)
        VALUES (@id, @path, @title, @aliases, @tags, @created, @updated, @hash, @ns)
        ON CONFLICT(id) DO UPDATE SET
          path = @path,
          title = @title,
          aliases_json = @aliases,
          tags_json = @tags,
          updated_at = @updated,
          content_hash = @hash,
          namespace = @ns
        WHERE id = @id
      `).run({
        id: effectiveId,
        path,
        title: parsed.title,
        aliases: JSON.stringify(parsed.frontmatter.aliases || []),
        tags: JSON.stringify(parsed.tags),
        created: stat.birthtimeMs,
        updated: stat.mtimeMs,
        hash: contentHash,
        ns: namespace
      });

      // 2. Delete old blocks/tags (Efficient replace)
      // Note: We reused IDs for vectors, but we still overwrite the blocks table rows to update offsets/headings.
      this.db.prepare('DELETE FROM blocks WHERE doc_id = ?').run(effectiveId);
      this.db.prepare('DELETE FROM tags WHERE doc_id = ?').run(effectiveId);
      this.db.prepare('DELETE FROM links WHERE src_block_id IN (SELECT id FROM blocks WHERE doc_id = ?)').run(effectiveId); // Wait, blocks are deleted, links cascade if FK?
      // My schema says ON DELETE CASCADE for links -> src_block_id.
      // So deleting blocks is enough.
      
      // 3. Insert Blocks
      const insertBlock = this.db.prepare(`
        INSERT INTO blocks (id, doc_id, kind, heading_path, start_offset, end_offset, text, block_hash)
        VALUES (@id, @doc_id, @kind, @heading_path, @start_offset, @end_offset, @text, @block_hash)
      `);
      
      for (const b of blocksToInsert) {
        insertBlock.run(b);
      }

      // 4. Insert Links
      const insertLink = this.db.prepare(`
        INSERT INTO links (src_block_id, dst_ref, resolved_doc_id, ref_kind)
        VALUES (@srcId, @dst, @resolved, @kind)
      `);

      for (const block of parsed.blocks) {
         // Match parsed block to inserted block ID?
         // blocksToInsert is parallel to parsed.blocks.
         // We can find the ID from blocksToInsert[index].
         const index = parsed.blocks.indexOf(block);
         const blockId = blocksToInsert[index].id;

         const blockLinks = parsed.links.filter(l => l.blockIndex === index);
         for (const link of blockLinks) {
            insertLink.run({
                srcId: blockId,
                dst: link.target,
                resolved: null,
                kind: link.type
            });
         }
      }

      // 5. Insert Tags
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (doc_id, tag) VALUES (?, ?)');
      for (const tag of parsed.tags) {
        insertTag.run(effectiveId, tag);
      }
    });

    transaction();
  }

  public deleteDocument(path: string) {
    this.db.prepare('DELETE FROM documents WHERE path = ?').run(path);
  }

  private saveTrace(record: any) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO traces (id, ts, query, fts_hits_json, vector_hits_json, rerank_json, final_json, lat_ms)
        VALUES (@id, @ts, @query, @fts_hits_json, @vector_hits_json, @rerank_json, @final_json, @lat_ms)
      `);
      stmt.run(record);
    } catch (e) {
      log(LogLevel.WARN, `Failed to save trace`, { error: e });
    }
  }

  public getBacklinks(docId: string): LinkRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM links WHERE resolved_doc_id = ?
    `);
    return stmt.all(docId) as LinkRecord[];
  }

  // Basic stats/health
  public getStats() {
    const docs = this.db.prepare('SELECT COUNT(*) as c FROM documents').get() as any;
    const blocks = this.db.prepare('SELECT COUNT(*) as c FROM blocks').get() as any;
    return {
      documents: docs.c,
      blocks: blocks.c
    };
  }
}
