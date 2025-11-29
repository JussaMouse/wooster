import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { KnowledgeBaseService } from '../knowledgeBase/KnowledgeBaseService';
import { parseMarkdown } from './markdown';
import { log, LogLevel } from '../../logger';
import { getConfig } from '../../configLoader';

export class IngestionService {
  private watcher: any = null; // chokidar v5 FSWatcher type is tricky or import mismatch, using any for now
  private queue: Set<string> = new Set();
  private processing = false;
  private kb: KnowledgeBaseService;
  private timer: NodeJS.Timeout | null = null;

  constructor(kb: KnowledgeBaseService) {
    this.kb = kb;
  }

  private static instance: IngestionService;
  public static getInstance(): IngestionService {
    if (!this.instance) {
      // Lazy circular dependency resolution
      const { KnowledgeBaseService } = require('../knowledgeBase/KnowledgeBaseService');
      this.instance = new IngestionService(KnowledgeBaseService.getInstance());
    }
    return this.instance;
  }

  public async start() {
    const config = getConfig();
    // Determine paths to watch
    // We can watch 'projects' and 'notes' or whatever is in config.
    // For now, let's assume we watch specific folders if configured, or defaults.
    // The plan mentions 'projects/' and 'notes/'.
    
    const roots = [];
    if (fs.existsSync('projects')) roots.push('projects');
    if (fs.existsSync('gtd')) roots.push('gtd');
    if (fs.existsSync('notes')) roots.push('notes');
    // Add others as needed

    log(LogLevel.INFO, `Starting IngestionService watching: ${roots.join(', ')}`);

    this.watcher = chokidar.watch(roots, {
      ignored: /(^|[\/\\])\..|node_modules/, // ignore dotfiles
      persistent: true,
      ignoreInitial: false // We want to scan on start? 
      // "First-time ingest will be slower... Expect 2-5x initial cost"
      // If we ignore initial, we rely on DB being persistent.
      // Better: ignoreInitial: true, but run a "reconcile" pass?
      // Or just let it churn through on startup (simple).
    });

    this.watcher
      .on('add', (path: string) => this.enqueue(path))
      .on('change', (path: string) => this.enqueue(path))
      .on('unlink', (path: string) => this.handleDelete(path));
  }

  public queueFile(filePath: string) {
    this.enqueue(filePath);
  }

  private enqueue(filePath: string) {
    if (!filePath.endsWith('.md')) return;
    
    this.queue.add(filePath);
    this.scheduleProcess();
  }

  private handleDelete(filePath: string) {
    log(LogLevel.INFO, `File deleted: ${filePath}`);
    this.kb.deleteDocument(filePath);
  }

  private scheduleProcess() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.processQueue(), 500); // Debounce 500ms
  }

  private async processQueue() {
    if (this.processing || this.queue.size === 0) return;
    
    this.processing = true;
    const batch = Array.from(this.queue);
    this.queue.clear();

    log(LogLevel.INFO, `Processing batch of ${batch.length} files`);

    for (const filePath of batch) {
      try {
        if (!fs.existsSync(filePath)) {
            // Might have been deleted quickly
            continue;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const stats = fs.statSync(filePath);
        
        const parsed = parseMarkdown(content);
        
        // Index it
        this.kb.indexParsedDocument(parsed, filePath, {
          mtimeMs: stats.mtimeMs,
          birthtimeMs: stats.birthtimeMs
        });

      } catch (err) {
        log(LogLevel.ERROR, `Failed to process file ${filePath}`, { error: err });
      }
    }

    this.processing = false;
    
    // If more came in
    if (this.queue.size > 0) {
      this.scheduleProcess();
    }
  }
}

