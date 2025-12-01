import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  ScheduleItem,
  NewScheduleItemPayload,
} from '../types/schedulerCore';
import { log, LogLevel } from '../logger';

const DB_PATH = path.join(process.cwd(), 'database', 'scheduler.sqlite3');
const DB_DIR = path.dirname(DB_PATH);

function ensureDbDirectory() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

export class SchedulerRepository {
  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  public static async create(): Promise<SchedulerRepository> {
    ensureDbDirectory();
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL'); // Enable WAL for robustness
    
    const repo = new SchedulerRepository(db);
    repo.initDatabase();
    return repo;
  }
  
  private initDatabase(): void {
    const createSchedulesTable = `
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        schedule_expression TEXT NOT NULL,
        task_key TEXT NOT NULL UNIQUE,
        task_handler_type TEXT NOT NULL CHECK(task_handler_type IN ('AGENT_PROMPT', 'DIRECT_FUNCTION')),
        payload TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `;
    this.db.exec(createSchedulesTable);
    log(LogLevel.INFO, 'Scheduler database initialized with better-sqlite3.');
  }
  
  addScheduleItem(id: string, item: NewScheduleItemPayload): void {
    const { description, schedule_expression, payload, task_key, task_handler_type } = item;
    const sql = `INSERT INTO schedules 
                   (id, description, schedule_expression, payload, task_key, task_handler_type)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    this.db.prepare(sql).run(id, description, schedule_expression, payload || null, task_key, task_handler_type);
  }

  getAllActiveScheduleItems(): ScheduleItem[] {
    const rows = this.db.prepare("SELECT * FROM schedules WHERE is_active = 1").all() as any[];
    return rows.map((row: any) => ({
        ...row,
        is_active: Boolean(row.is_active)
    }));
  }
  
  getScheduleItemById(id: string): ScheduleItem | undefined {
    const row = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
        ...row,
        is_active: Boolean(row.is_active)
    };
  }
  
  getScheduleItemByKey(task_key: string): ScheduleItem | undefined {
    const row = this.db.prepare('SELECT * FROM schedules WHERE task_key = ?').get(task_key) as any;
    if (!row) return undefined;
    return {
        ...row,
        is_active: Boolean(row.is_active)
    };
  }

  deleteScheduleItem(id: string): boolean {
    const info = this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    return info.changes > 0;
  }
}

let schedulerRepositoryInstance: SchedulerRepository | null = null;

export async function getSchedulerRepository(): Promise<SchedulerRepository> {
  if (!schedulerRepositoryInstance) {
    schedulerRepositoryInstance = await SchedulerRepository.create();
  }
  return schedulerRepositoryInstance;
}
