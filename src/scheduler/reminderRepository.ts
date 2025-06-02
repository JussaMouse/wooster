import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {
  ScheduleItem,
  NewScheduleItemPayload,
  UpdateScheduleItemArgs,
  TaskExecutionLogEntry,
  TaskHandlerType,
  TaskExecutionStatus,
  ExecutionPolicyType // Though not directly used in function signatures here, it's part of ScheduleItem
} from '../types/schedulerCore';

const DB_DIR = path.join(process.cwd(), 'database');
const DB_PATH = path.join(DB_DIR, 'scheduler.sqlite3');

// Ensure the database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Function to initialize the database and create tables if they don't exist
export function initDatabase(): void {
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

  db.exec(createSchedulesTable);
  db.exec(createSchedulesIndexes);
  db.exec(createTaskExecutionLogTable);
  db.exec(createTaskExecutionLogIndexes);

  console.log('Scheduler database initialized: schedules and task_execution_log tables are ready.');
}

// --- ScheduleItem CRUD Operations ---

export function addScheduleItem(id: string, item: NewScheduleItemPayload, next_run_time: string | null): Database.RunResult {
  const {
    description, schedule_expression, payload,
    task_key, task_handler_type, execution_policy
  } = item;
  
  const sql = `INSERT INTO schedules 
                 (id, description, schedule_expression, payload, task_key, task_handler_type, execution_policy, next_run_time, created_at, updated_at)
               VALUES 
                 (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
  const stmt = db.prepare(sql);
  return stmt.run(
    id, description, schedule_expression, payload || null,
    task_key, task_handler_type, execution_policy, next_run_time
  );
}

export function getActiveScheduleItems(): ScheduleItem[] {
  const stmt = db.prepare("SELECT * FROM schedules WHERE is_active = TRUE ORDER BY next_run_time ASC");
  return stmt.all() as ScheduleItem[];
}

export function getScheduleItemById(id: string): ScheduleItem | undefined {
  const stmt = db.prepare('SELECT * FROM schedules WHERE id = ?');
  return stmt.get(id) as ScheduleItem | undefined;
}

export function getScheduleItemByKey(task_key: string): ScheduleItem | undefined {
  const stmt = db.prepare('SELECT * FROM schedules WHERE task_key = ?');
  return stmt.get(task_key) as ScheduleItem | undefined;
}

export function updateScheduleItem(id: string, updates: UpdateScheduleItemArgs): Database.RunResult {
  const fields = Object.keys(updates).filter(k => k !== 'updated_at');
  const values = fields.map(field => {
    const val = (updates as any)[field];
    return typeof val === 'boolean' ? (val ? 1 : 0) : val;
  });

  if (fields.length === 0 && !updates.updated_at) {
    if (!updates.updated_at && fields.length === 0) {
        throw new Error("No updates provided for schedule item.");
    }
  }
  
  let setClause = fields.map(field => `${field} = ?`).join(', ');
  if (updates.updated_at) {
      setClause += (setClause ? ', ' : '') + 'updated_at = ?';
      values.push(updates.updated_at);
  } else {
      setClause += (setClause ? ', ' : '') + `updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
  }

  const sql = `UPDATE schedules SET ${setClause} WHERE id = ?`;
  const stmt = db.prepare(sql);
  return stmt.run(...values, id);
}

export function deactivateScheduleItem(id: string): Database.RunResult {
  return updateScheduleItem(id, { is_active: false });
}

export function deleteScheduleItem(id: string): Database.RunResult {
  const stmt = db.prepare('DELETE FROM schedules WHERE id = ?');
  return stmt.run(id);
}

// --- TaskExecutionLog CRUD Operations ---

export function addExecutionLog(logEntry: Omit<TaskExecutionLogEntry, 'id'>): Database.RunResult {
  const { schedule_id, period_identifier, status, executed_at, notes } = logEntry;
  const stmt = db.prepare(
    'INSERT INTO task_execution_log (schedule_id, period_identifier, status, executed_at, notes) VALUES (?, ?, ?, ?, ?)'
  );
  return stmt.run(schedule_id, period_identifier, status, executed_at, notes || null);
}

export function getExecutionLogsForSchedule(schedule_id: string, limit: number = 50): TaskExecutionLogEntry[] {
  const stmt = db.prepare(
    'SELECT * FROM task_execution_log WHERE schedule_id = ? ORDER BY executed_at DESC LIMIT ?'
  );
  return stmt.all(schedule_id, limit) as TaskExecutionLogEntry[];
}

export function getExecutionLogByPeriod(schedule_id: string, period_identifier: string): TaskExecutionLogEntry | undefined {
  const stmt = db.prepare(
    'SELECT * FROM task_execution_log WHERE schedule_id = ? AND period_identifier = ? ORDER BY executed_at DESC LIMIT 1'
  );
  return stmt.get(schedule_id, period_identifier) as TaskExecutionLogEntry | undefined;
}

// Ensure the database connection is closed gracefully on application exit
process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15)); 