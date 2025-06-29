import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import {
  ScheduleItem,
  NewScheduleItemPayload,
  UpdateScheduleItemArgs,
  TaskExecutionLogEntry,
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
    
    let dbData: Buffer | null = null;
    if (fs.existsSync(DB_PATH)) {
      dbData = fs.readFileSync(DB_PATH);
    }
    
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
        payload TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        next_run_time TEXT,  
        last_invocation TEXT, 
        task_key TEXT NOT NULL UNIQUE DEFAULT 'unknown.task',
        task_handler_type TEXT NOT NULL DEFAULT 'AGENT_PROMPT' CHECK(task_handler_type IN ('AGENT_PROMPT', 'DIRECT_FUNCTION')),
        execution_policy TEXT NOT NULL DEFAULT 'DEFAULT_SKIP_MISSED' CHECK(execution_policy IN ('DEFAULT_SKIP_MISSED', 'RUN_ONCE_PER_PERIOD_CATCH_UP', 'RUN_IMMEDIATELY_IF_MISSED'))
      );
    `;
    const createSchedulesIndexes = `
      CREATE INDEX IF NOT EXISTS idx_schedules_next_run_time ON schedules(next_run_time);
      CREATE INDEX IF NOT EXISTS idx_schedules_is_active ON schedules(is_active);
    `;
    const createTaskExecutionLogTable = `
      CREATE TABLE IF NOT EXISTS task_execution_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schedule_id TEXT NOT NULL, 
        period_identifier TEXT NOT NULL, 
        status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILURE', 'SKIPPED_DUPLICATE')),
        executed_at TEXT NOT NULL, 
        notes TEXT,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
      );
    `;
    const createTaskExecutionLogIndexes = `
      CREATE INDEX IF NOT EXISTS idx_task_log_schedule_period ON task_execution_log(schedule_id, period_identifier);
    `;

    this.db.run(createSchedulesTable);
    this.db.run(createSchedulesIndexes);
    this.db.run(createTaskExecutionLogTable);
    this.db.run(createTaskExecutionLogIndexes);
    this.persist();
    log(LogLevel.INFO, 'Scheduler database initialized with sql.js');
  }

  private resultsToItems(results: any[]): ScheduleItem[] {
    if (!results.length) return [];
    const items = results[0].values.map((row: any[]) => {
      const item: { [key: string]: any } = {};
      results[0].columns.forEach((col: string, i: number) => {
        item[col] = row[i];
      });
      return item as ScheduleItem;
    });
    // Manually convert boolean fields
    return items.map((item: ScheduleItem) => ({...item, is_active: !!item.is_active}));
  }

  addScheduleItem(id: string, item: NewScheduleItemPayload, next_run_time: string | null): void {
    const { description, schedule_expression, payload, task_key, task_handler_type, execution_policy } = item;
    const sql = `INSERT INTO schedules 
                   (id, description, schedule_expression, payload, task_key, task_handler_type, execution_policy, next_run_time, created_at, updated_at)
                 VALUES 
                   (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
    this.db.run(sql, [id, description, schedule_expression, payload || null, task_key, task_handler_type, execution_policy, next_run_time]);
    this.persist();
  }

  getActiveScheduleItems(): ScheduleItem[] {
    const res = this.db.exec("SELECT * FROM schedules WHERE is_active = 1 ORDER BY next_run_time ASC");
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

  updateScheduleItem(id: string, updates: UpdateScheduleItemArgs): boolean {
    const fields = Object.keys(updates).filter(k => k !== 'updated_at');
    const values = fields.map(field => {
      const val = (updates as any)[field];
      return typeof val === 'boolean' ? (val ? 1 : 0) : val;
    });

    if (fields.length === 0 && !updates.updated_at) {
      return false;
    }
    
    let setClause = fields.map(field => `${field} = ?`).join(', ');
    if (updates.updated_at) {
        setClause += (setClause ? ', ' : '') + 'updated_at = ?';
        values.push(updates.updated_at);
    } else {
        setClause += (setClause ? ', ' : '') + `updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
    }

    const sql = `UPDATE schedules SET ${setClause} WHERE id = ?`;
    this.db.run(sql, [...values, id]);
    const changes = this.db.getRowsModified();
    this.persist();
    return changes > 0;
  }

  deactivateScheduleItem(id: string): boolean {
    return this.updateScheduleItem(id, { is_active: false });
  }

  deleteScheduleItem(id: string): boolean {
    this.db.run('DELETE FROM schedules WHERE id = ?', [id]);
    const changes = this.db.getRowsModified();
    this.persist();
    return changes > 0;
  }

  addExecutionLog(logEntry: Omit<TaskExecutionLogEntry, 'id'>): void {
    const { schedule_id, period_identifier, status, executed_at, notes } = logEntry;
    const sql = 'INSERT INTO task_execution_log (schedule_id, period_identifier, status, executed_at, notes) VALUES (?, ?, ?, ?, ?)';
    this.db.run(sql, [schedule_id, period_identifier, status, executed_at, notes || null]);
    this.persist();
  }

  getExecutionLogsForSchedule(schedule_id: string, limit: number = 50): TaskExecutionLogEntry[] {
    const res = this.db.exec('SELECT * FROM task_execution_log WHERE schedule_id = ? ORDER BY executed_at DESC LIMIT ?', [schedule_id, limit]);
    if (!res.length) return [];
    return res[0].values.map((row: any) => {
      const entry: { [key: string]: any } = {};
      res[0].columns.forEach((col, i) => entry[col] = row[i]);
      return entry as TaskExecutionLogEntry;
    });
  }

  getExecutionLogByPeriod(schedule_id: string, period_identifier: string): TaskExecutionLogEntry | undefined {
    const res = this.db.exec('SELECT * FROM task_execution_log WHERE schedule_id = ? AND period_identifier = ? ORDER BY executed_at DESC LIMIT 1', [schedule_id, period_identifier]);
    if (!res.length) return undefined;
    const entry: { [key: string]: any } = {};
    res[0].columns.forEach((col, i) => entry[col] = res[0].values[0][i]);
    return entry as TaskExecutionLogEntry;
  }
}

let schedulerRepositoryInstance: SchedulerRepository | null = null;

export async function getSchedulerRepository(): Promise<SchedulerRepository> {
  if (!schedulerRepositoryInstance) {
    schedulerRepositoryInstance = await SchedulerRepository.create();
  }
  return schedulerRepositoryInstance;
} 