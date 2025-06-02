import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Task } from './types';
import { LogLevel } from '../../logger';
import { CoreServices } from '../../types/plugin'; // Import CoreServices

const DB_DIR = path.join(process.cwd(), 'database');
const DB_PATH = path.join(DB_DIR, 'task_capture.sqlite3');

let db: Database.Database;
let coreLog: CoreServices['log'] | null = null; // Changed type and name for clarity

function ensureDatabaseDirectoryExists() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    coreLog?.(LogLevel.INFO, `TaskCaptureDB: Created database directory at ${DB_DIR}`);
  }
}

export function initializeTaskCaptureDb(loggerFunc: CoreServices['log']): Database.Database {
  coreLog = loggerFunc;
  ensureDatabaseDirectoryExists();
  
  db = new Database(DB_PATH, { 
    verbose: process.env.NODE_ENV === 'development' ? 
      (message?: unknown, ...additionalArgs: unknown[]) => {
        if (typeof message === 'string') {
          coreLog?.(LogLevel.DEBUG, `SQL: ${message}`);
        } else if (message) {
          // Log additional args if present, as they might be part of the verbose output
          coreLog?.(LogLevel.DEBUG, `SQL: ${String(message)}`, { additionalArgs: additionalArgs.length > 0 ? additionalArgs : undefined });
        }
      } : 
      undefined 
  });
  coreLog(LogLevel.INFO, `TaskCaptureDB: Database connected at ${DB_PATH}`);

  const createTableStmt = db.prepare(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', /* 'pending', 'completed', 'deferred' */
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      priority INTEGER, /* Optional: 1 (High) to 3 (Low) or similar */
      category TEXT /* Optional: User-defined category */
      /* Future columns: dueDate TEXT, context TEXT, projectId INTEGER */
    );
  `);
  createTableStmt.run();
  coreLog(LogLevel.INFO, "TaskCaptureDB: 'tasks' table ensured.");

  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    if (coreLog) {
        coreLog(LogLevel.WARN, "TaskCaptureDB: getDb called before proper DB initialization through plugin. Attempting to re-initialize.");
        initializeTaskCaptureDb(coreLog); // Attempt re-initialization if log function is available
    } else {
        console.warn("TaskCaptureDB: CRITICAL - getDb called before core logger and DB are initialized. DB operations will likely fail or use a new unconfigured DB instance.");
        ensureDatabaseDirectoryExists();
        db = new Database(DB_PATH); // Fallback, schema might not be created
    }
  }
  return db;
}

export function addTaskToDb(description: string): Task | null {
  if (!coreLog) { 
    // This should not happen if initializeTaskCaptureDb was called by the plugin
    console.error("TaskCaptureDB: addTaskToDb called before logger is initialized. Cannot add task.");
    return null;
  }
  const currentDb = getDb();
  const now = new Date().toISOString();
  try {
    const stmt = currentDb.prepare(
      'INSERT INTO tasks (description, status, createdAt, updatedAt) VALUES (?, ?, ?, ?)'
    );
    // Default status to 'pending' as per schema
    const result = stmt.run(description, 'pending', now, now);
    
    if (result.changes > 0) {
      const newTask: Task = {
        id: result.lastInsertRowid as number,
        description,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      coreLog(LogLevel.INFO, `TaskCaptureDB: Added task with ID: ${newTask.id}`, { taskId: newTask.id });
      return newTask;
    }
    coreLog(LogLevel.WARN, "TaskCaptureDB: Failed to add task, no changes detected in DB.", { description });
    return null;
  } catch (error) {
    coreLog(LogLevel.ERROR, "TaskCaptureDB: Error adding task to database", { error, description });
    return null;
  }
}

// Placeholder for future DB functions from types.ts, adapted for coreLog usage
/*
export function getTaskFromDb(id: number): Task | null {
  if (!coreLog) { console.error("Logger not init for getTaskFromDb"); return null; }
  const currentDb = getDb();
  try {
    const stmt = currentDb.prepare('SELECT * FROM tasks WHERE id = ?');
    const task = stmt.get(id) as Task | undefined;
    return task || null;
  } catch (error) {
    coreLog(LogLevel.ERROR, `TaskCaptureDB: Error getting task with ID ${id}`, { error, taskId: id });
    return null;
  }
}

export function listTasksFromDb(status?: Task['status']): Task[] {
  if (!coreLog) { console.error("Logger not init for listTasksFromDb"); return []; }
  const currentDb = getDb();
  try {
    let query = 'SELECT * FROM tasks';
    const params: any[] = [];
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    query += ' ORDER BY createdAt DESC';
    const stmt = currentDb.prepare(query);
    const tasks = stmt.all(...params) as Task[];
    return tasks;
  } catch (error) {
    coreLog(LogLevel.ERROR, "TaskCaptureDB: Error listing tasks", { error, status });
    return [];
  }
}

export function updateTaskInDb(id: number, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Task | null {
  if (!coreLog) { console.error("Logger not init for updateTaskInDb"); return null; }
  const currentDb = getDb();
  try {
    const existingTask = getTaskFromDb(id);
    if (!existingTask) return null;

    const fieldsToUpdate = { ...updates, updatedAt: new Date().toISOString() };
    
    const setClauses = Object.keys(fieldsToUpdate).map(key => `${key} = ?`).join(', ');
    const values = Object.values(fieldsToUpdate);
    values.push(id);

    const stmt = currentDb.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`);
    const result = stmt.run(...values);

    if (result.changes > 0) {
      coreLog(LogLevel.INFO, `TaskCaptureDB: Updated task with ID: ${id}`, { taskId: id, updates });
      return getTaskFromDb(id);
    }
    return null;
  } catch (error) {
    coreLog(LogLevel.ERROR, `TaskCaptureDB: Error updating task with ID ${id}`, { error, taskId: id, updates });
    return null;
  }
}

export function deleteTaskFromDb(id: number): boolean {
  if (!coreLog) { console.error("Logger not init for deleteTaskFromDb"); return false; }
  const currentDb = getDb();
  try {
    const stmt = currentDb.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes > 0) {
      coreLog(LogLevel.INFO, `TaskCaptureDB: Deleted task with ID: ${id}`, { taskId: id });
      return true;
    }
    return false;
  } catch (error) {
    coreLog(LogLevel.ERROR, `TaskCaptureDB: Error deleting task with ID ${id}`, { error, taskId: id });
    return false;
  }
}
*/ 