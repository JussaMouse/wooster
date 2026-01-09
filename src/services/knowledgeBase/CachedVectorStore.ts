import fs from 'fs/promises';
import path from 'path';
import { log, LogLevel } from '../../logger';

/**
 * CachedVectorData stores pre-computed embeddings alongside content
 * This eliminates the need to re-embed documents on every load
 */
export interface CachedVectorData {
  id: string;
  vector: number[];
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CachedVectorStoreOptions {
  storagePath: string;
  dimensions?: number;
}

/**
 * CachedVectorStore - Persists embeddings to avoid re-computation
 * 
 * Key improvements over MemoryVectorStore:
 * 1. Stores pre-computed vectors in JSON file
 * 2. Only re-embeds when content changes (hash comparison)
 * 3. Async file I/O to avoid blocking
 * 4. Dirty flag to minimize writes
 */
export class CachedVectorStore {
  private data: Map<string, CachedVectorData> = new Map();
  private filePath: string;
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private dimensions: number;

  constructor(options: CachedVectorStoreOptions) {
    this.filePath = path.join(options.storagePath, 'cached_vectors.json');
    this.dimensions = options.dimensions || 4096; // Default for Qwen3-Embedding-8B
  }

  /**
   * Load pre-computed vectors from disk (no re-embedding!)
   */
  async load(): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const records: CachedVectorData[] = JSON.parse(raw);
      
      for (const record of records) {
        this.data.set(record.id, record);
      }
      
      log(LogLevel.INFO, `CachedVectorStore: Loaded ${this.data.size} cached vectors from ${this.filePath}`);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        log(LogLevel.DEBUG, `CachedVectorStore: No existing cache at ${this.filePath}, starting fresh`);
      } else {
        log(LogLevel.WARN, `CachedVectorStore: Failed to load cache`, { error });
      }
    }
  }

  /**
   * Save vectors to disk (async, non-blocking)
   */
  async save(): Promise<void> {
    if (!this.dirty) return;
    
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      
      const records = Array.from(this.data.values());
      const tempPath = `${this.filePath}.tmp`;
      
      // Write to temp file first, then rename (atomic operation)
      await fs.writeFile(tempPath, JSON.stringify(records, null, 2));
      await fs.rename(tempPath, this.filePath);
      
      this.dirty = false;
      log(LogLevel.DEBUG, `CachedVectorStore: Saved ${records.length} vectors to ${this.filePath}`);
    } catch (error) {
      log(LogLevel.ERROR, `CachedVectorStore: Failed to save`, { error });
    }
  }

  /**
   * Schedule a save operation (debounced)
   */
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.save();
    }, 1000); // Debounce for 1 second
  }

  /**
   * Add or update vectors
   */
  async upsert(records: CachedVectorData[]): Promise<void> {
    const now = new Date().toISOString();
    
    for (const record of records) {
      const existing = this.data.get(record.id);
      
      this.data.set(record.id, {
        ...record,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      });
    }
    
    this.dirty = true;
    this.scheduleSave();
  }

  /**
   * Get a vector by ID
   */
  get(id: string): CachedVectorData | undefined {
    return this.data.get(id);
  }

  /**
   * Check if a vector exists
   */
  has(id: string): boolean {
    return this.data.has(id);
  }

  /**
   * Delete vectors by ID
   */
  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.data.delete(id);
    }
    
    this.dirty = true;
    this.scheduleSave();
  }

  /**
   * Get all vectors
   */
  getAll(): CachedVectorData[] {
    return Array.from(this.data.values());
  }

  /**
   * Get the number of cached vectors
   */
  get size(): number {
    return this.data.size;
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    this.data.clear();
    this.dirty = true;
    await this.save();
  }

  /**
   * Get IDs that need re-embedding (new or changed content)
   */
  getStaleIds(currentContent: Map<string, string>): string[] {
    const stale: string[] = [];
    
    for (const [id, content] of currentContent) {
      const cached = this.data.get(id);
      if (!cached || cached.content !== content) {
        stale.push(id);
      }
    }
    
    return stale;
  }

  /**
   * Force flush any pending saves
   */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.save();
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.flush();
  }
}
