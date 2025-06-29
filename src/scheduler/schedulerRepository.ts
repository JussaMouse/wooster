import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import {
  ScheduleItem,
  NewScheduleItemPayload,
} from '../types/schedulerCore';
import { log, LogLevel } from '../logger';

const DB_PATH = path.join(process.cwd(), 'database', 'scheduler.sqlite3');
const DB_DIR = path.dirname(DB_PATH);

let SQL: SqlJsStatic | null = null;

function ensureDbDirectory() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

export class SchedulerRepository {
  private db: Database;

  private constructor(db: Database) {
    this.db = db;
  }

  public static async create(): Promise<SchedulerRepository> {
    ensureDbDirectory();
    if (!SQL) {
      SQL = await initSqlJs();
    }
    
    const dbData = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
    const db = dbData ? new SQL.Database(dbData) : new SQL.Database();
    
    const repo = new SchedulerRepository(db);
    repo.initDatabase();
    return repo;
  }
  
  private persist() {
    try {
      const data = this.db.export();
      fs.writeFileSync(DB_PATH, data);
    } catch (error) {
      log(LogLevel.ERROR, 'Failed to persist scheduler database', { error });
    }
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
    this.db.run(createSchedulesTable);
    this.persist();
    log(LogLevel.INFO, 'Scheduler database initialized with simplified schema.');
  }
  
  private resultsToItems(results: any[]): ScheduleItem[] {
    if (!results.length) return [];
    return results[0].values.map((row: any[]) => {
      const item: { [key: string]: any } = {};
      results[0].columns.forEach((col: string, i: number) => {
        item[col] = row[i];
      });
      // Manually convert boolean fields from 0/1 to false/true
      item.is_active = !!item.is_active;
      return item as ScheduleItem;
    });
  }

  addScheduleItem(id: string, item: NewScheduleItemPayload): void {
    const { description, schedule_expression, payload, task_key, task_handler_type } = item;
    const sql = `INSERT INTO schedules 
                   (id, description, schedule_expression, payload, task_key, task_handler_type)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    this.db.run(sql, [id, description, schedule_expression, payload || null, task_key, task_handler_type]);
    this.persist();
  }

  getAllActiveScheduleItems(): ScheduleItem[] {
    const res = this.db.exec("SELECT * FROM schedules WHERE is_active = 1");
    return this.resultsToItems(res);
  }
  
  getScheduleItemById(id: string): ScheduleItem | undefined {
    const res = this.db.exec('SELECT * FROM schedules WHERE id = ?', [id]);
    return this.resultsToItems(res)[0];
  }
  
  getScheduleItemByKey(task_key: string): ScheduleItem | undefined {
    const res = this.db.exec('SELECT * FROM schedules WHERE task_key = ?', [task_key]);
    return this.resultsToItems(res)[0];
  }

  deleteScheduleItem(id: string): boolean {
    this.db.run('DELETE FROM schedules WHERE id = ?', [id]);
    const changes = this.db.getRowsModified();
    if (changes > 0) {
      this.persist();
    }
    return changes > 0;
  }
}

let schedulerRepositoryInstance: SchedulerRepository | null = null;

export async function getSchedulerRepository(): Promise<SchedulerRepository> {
  if (!schedulerRepositoryInstance) {
    schedulerRepositoryInstance = await SchedulerRepository.create();
  }
  return schedulerRepositoryInstance;
} 