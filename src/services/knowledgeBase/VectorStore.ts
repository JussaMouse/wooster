import fs from 'fs';
import path from 'path';
import { log, LogLevel } from '../../logger';

export interface VectorRecord {
  id: string; // UUID (blockId)
  vector: number[];
  metadata?: any;
}

export interface VectorStore {
  upsert(vectors: VectorRecord[]): Promise<void>;
  query(vector: number[], topK: number, filter?: any): Promise<{ id: string; score: number }[]>;
  delete(ids: string[]): Promise<void>;
}

// A simple JSON-based vector store for MVP/Fallback
// WARNING: Not efficient for millions of vectors, but fine for thousands.
export class SimpleFileVectorStore implements VectorStore {
  private filePath: string;
  private data: Record<string, { vector: number[]; metadata?: any }> = {};
  private dirty = false;

  constructor(storagePath: string) {
    this.filePath = path.join(storagePath, 'vectors.json');
    this.load();
    
    // Auto-save periodically
    setInterval(() => this.save(), 5000);
  }

  private load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
      } catch (e) {
        log(LogLevel.ERROR, `Failed to load vector store from ${this.filePath}`, { error: e });
        this.data = {};
      }
    }
  }

  private save() {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data));
      this.dirty = false;
    } catch (e) {
      log(LogLevel.ERROR, `Failed to save vector store`, { error: e });
    }
  }

  async upsert(vectors: VectorRecord[]): Promise<void> {
    for (const v of vectors) {
      this.data[v.id] = { vector: v.vector, metadata: v.metadata };
    }
    this.dirty = true;
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      delete this.data[id];
    }
    this.dirty = true;
  }

  async query(queryVector: number[], topK: number, filter?: any): Promise<{ id: string; score: number }[]> {
    // Brute-force cosine similarity
    const results = Object.entries(this.data).map(([id, record]) => {
      const score = this.cosineSimilarity(queryVector, record.vector);
      return { id, score };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
  }
}

