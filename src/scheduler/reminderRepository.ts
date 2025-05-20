import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'database');
const DB_PATH = path.join(DB_DIR, 'scheduler.sqlite3');

// Ensure the database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Function to initialize the database and create tables if they don't exist
export function initDatabase(): void {
  const createRemindersTable = `
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL, -- Still useful for a human-readable description of the scheduled task
      schedule_type TEXT NOT NULL CHECK(schedule_type IN ('one-off', 'cron')),
      when_date DATETIME,      -- For one-off reminders
      cron_spec TEXT,          -- For recurring cron jobs
      task_type TEXT NOT NULL DEFAULT 'logMessage', -- Type of task: e.g., 'logMessage', 'invokeTool'
      task_payload TEXT,       -- JSON string containing payload for the task, e.g., { toolName: 'sendEmail', args: { ... } }
      is_active BOOLEAN DEFAULT TRUE, -- To mark if a reminder is still active
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      next_run_time DATETIME   -- Store the next calculated run time
    );
  `;

  const createHeartbeatsTable = `
    CREATE TABLE IF NOT EXISTS heartbeats (
      id INTEGER PRIMARY KEY CHECK(id = 1), -- Ensures only one row
      last_heartbeat DATETIME NOT NULL
    );
  `;

  // Indexes for potentially queried columns
  const createRemindersIndex = `CREATE INDEX IF NOT EXISTS idx_reminders_next_run_time ON reminders(next_run_time);`;
  const createRemindersActiveIndex = `CREATE INDEX IF NOT EXISTS idx_reminders_is_active ON reminders(is_active);`;


  db.exec(createRemindersTable);
  db.exec(createHeartbeatsTable);
  db.exec(createRemindersIndex);
  db.exec(createRemindersActiveIndex);

  // Initialize heartbeat if not present
  const stmt = db.prepare('SELECT last_heartbeat FROM heartbeats WHERE id = 1');
  const heartbeat = stmt.get();
  if (!heartbeat) {
    const insertStmt = db.prepare('INSERT INTO heartbeats (id, last_heartbeat) VALUES (1, CURRENT_TIMESTAMP)');
    insertStmt.run();
  }

  console.log('Scheduler database initialized and tables (reminders, heartbeats) are ready.');
}

// Placeholder for Reminder type/interface
export interface Reminder {
  id: string;
  message: string; // Human-readable description
  schedule_type: 'one-off' | 'cron';
  when_date?: string | null; // ISO 8601 string
  cron_spec?: string | null;
  task_type: 'logMessage' | 'invokeTool' | string; // Allow for custom task types
  task_payload?: string | null; // JSON string
  is_active?: boolean;
  created_at?: string; // ISO 8601 string
  next_run_time?: string | null; // ISO 8601 string
}

// --- Reminder CRUD Operations ---

// Create a new reminder
export function addReminder(
  reminder: Omit<Reminder, 'created_at' | 'is_active'> & { 
    id: string; 
    next_run_time: string; 
    // Ensure task_type is provided, task_payload is optional but should be null if not used
    task_type: Reminder['task_type']; 
    task_payload?: Reminder['task_payload'];
  }
): Database.RunResult {
  const { id, message, schedule_type, when_date, cron_spec, next_run_time, task_type, task_payload } = reminder;
  const stmt = db.prepare(
    'INSERT INTO reminders (id, message, schedule_type, when_date, cron_spec, next_run_time, task_type, task_payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  return stmt.run(
    id, 
    message, 
    schedule_type, 
    when_date || null, 
    cron_spec || null, 
    next_run_time, 
    task_type, 
    task_payload || null
  );
}

// Get all active reminders
export function getActiveReminders(): Reminder[] {
  const stmt = db.prepare("SELECT * FROM reminders WHERE is_active = TRUE ORDER BY next_run_time ASC");
  return stmt.all() as Reminder[];
}

// Get a specific reminder by ID
export function getReminderById(id: string): Reminder | undefined {
  const stmt = db.prepare('SELECT * FROM reminders WHERE id = ?');
  return stmt.get(id) as Reminder | undefined;
}

// Update a reminder (e.g., to set next_run_time for a cron job, or deactivate a one-off)
export function updateReminder(id: string, updates: Partial<Pick<Reminder, 'next_run_time' | 'is_active' | 'cron_spec' | 'when_date' | 'message' | 'task_type' | 'task_payload'>>): Database.RunResult {
  const fields = Object.keys(updates);
  // Explicitly convert boolean values to integers (0 or 1) for SQLite compatibility
  const values = Object.values(updates).map(val => (typeof val === 'boolean' ? (val ? 1 : 0) : val));

  if (fields.length === 0) {
    throw new Error("No updates provided for reminder.");
  }

  const setClause = fields.map(field => `${field} = ?`).join(', ');
  const stmt = db.prepare(`UPDATE reminders SET ${setClause} WHERE id = ?`);
  return stmt.run(...values, id);
}

// Deactivate a reminder (soft delete)
export function deactivateReminder(id: string): Database.RunResult {
  return updateReminder(id, { is_active: false });
}

// Delete a reminder (hard delete)
export function deleteReminder(id: string): Database.RunResult {
  const stmt = db.prepare('DELETE FROM reminders WHERE id = ?');
  return stmt.run(id);
}


// --- Heartbeat Operations ---

// Update the heartbeat timestamp
export function updateHeartbeat(): Database.RunResult {
  const stmt = db.prepare('UPDATE heartbeats SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = 1');
  return stmt.run();
}

// Get the last heartbeat timestamp
export function getLastHeartbeat(): string | null {
  const stmt = db.prepare('SELECT last_heartbeat FROM heartbeats WHERE id = 1');
  const row = stmt.get() as { last_heartbeat: string } | undefined;
  return row ? row.last_heartbeat : null;
}

// Ensure the database connection is closed gracefully on application exit
process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15)); 