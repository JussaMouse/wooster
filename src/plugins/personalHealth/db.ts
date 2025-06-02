import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { HealthLogEntry, HealthEntryType } from './types';
import { log, LogLevel } from '../../logger';

const DB_DIR = path.join(process.cwd(), 'database');
const DB_FILE_PATH = path.join(DB_DIR, 'personal_health.sqlite3');

let db: Database.Database | null = null;

const getDbSync = (): Database.Database => {
    if (db) return db;
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
        log(LogLevel.INFO, '[PersonalHealthDB] Database directory created.', { path: DB_DIR });
    }
    const newDb = new Database(DB_FILE_PATH);
    log(LogLevel.INFO, '[PersonalHealthDB] Connected to SQLite database (better-sqlite3).', { path: DB_FILE_PATH });
    db = newDb;
    return db;
};

export const initializeDatabase = (): void => {
    const dbInstance = getDbSync();
    log(LogLevel.INFO, '[PersonalHealthDB] Initializing database schema (better-sqlite3)...');
    const createTableSql = `
        CREATE TABLE IF NOT EXISTS health_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            entryType TEXT NOT NULL,
            content TEXT NOT NULL,
            durationMinutes INTEGER,
            distanceKm REAL,
            reps INTEGER,
            sets INTEGER,
            weightKg REAL,
            calories INTEGER,
            notes TEXT,
            createdAt TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
    `;
    try {
        dbInstance.exec(createTableSql);
        log(LogLevel.INFO, '[PersonalHealthDB] Table \'health_entries\' ensured to exist.');
    } catch (error: any) {
        log(LogLevel.ERROR, '[PersonalHealthDB] Error creating \'health_entries\' table', { error: error.message });
        throw error;
    }
};

export const addHealthEntryToDb = (entry: Omit<HealthLogEntry, 'id' | 'createdAt'>): HealthLogEntry => {
    const dbInstance = getDbSync();
    const sql = `INSERT INTO health_entries (date, entryType, content, durationMinutes, distanceKm, reps, sets, weightKg, calories, notes) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
        entry.date,
        entry.entryType,
        entry.content,
        entry.durationMinutes,
        entry.distanceKm,
        entry.reps,
        entry.sets,
        entry.weightKg,
        entry.calories,
        entry.notes
    ];
    try {
        const stmt = dbInstance.prepare(sql);
        const result = stmt.run(params);
        
        const newEntry = dbInstance.prepare('SELECT * FROM health_entries WHERE id = ?').get(result.lastInsertRowid) as HealthLogEntry;
        if (!newEntry) {
            throw new Error('Failed to retrieve the newly added health entry.');
        }
        log(LogLevel.INFO, '[PersonalHealthDB] Health entry added to DB', { id: newEntry.id });
        return newEntry;
    } catch (error: any) {
        log(LogLevel.ERROR, '[PersonalHealthDB] Error adding health entry to DB', { error: error.message, entry });
        throw error;
    }
};

export const getLatestHealthEntryFromDb = (entryType?: HealthEntryType): HealthLogEntry | null => {
    const dbInstance = getDbSync();
    let sql = 'SELECT * FROM health_entries';
    const queryParams: any[] = [];
    if (entryType) {
        sql += ' WHERE entryType = ?';
        queryParams.push(entryType);
    }
    sql += ' ORDER BY date DESC, createdAt DESC LIMIT 1';
    try {
        const stmt = dbInstance.prepare(sql);
        const row = stmt.get(queryParams) as HealthLogEntry | undefined;
        return row || null;
    } catch (error: any) {
        log(LogLevel.ERROR, '[PersonalHealthDB] Error getting latest health entry from DB', { error: error.message, entryType });
        throw error;
    }
};

export const getHealthEntriesFromDb = (options: { date?: string; startDate?: string; endDate?: string; entryType?: HealthEntryType; limit?: number }): HealthLogEntry[] => {
    const dbInstance = getDbSync();
    let sql = 'SELECT * FROM health_entries WHERE 1=1';
    const queryParams: any[] = [];

    if (options.date) {
        sql += ' AND date = ?';
        queryParams.push(options.date);
    }
    if (options.startDate) {
        sql += ' AND date >= ?';
        queryParams.push(options.startDate);
    }
    if (options.endDate) {
        sql += ' AND date <= ?';
        queryParams.push(options.endDate);
    }
    if (options.entryType) {
        sql += ' AND entryType = ?';
        queryParams.push(options.entryType);
    }

    sql += ' ORDER BY date DESC, createdAt DESC';

    if (options.limit) {
        sql += ' LIMIT ?';
        queryParams.push(options.limit);
    }
    
    try {
        const stmt = dbInstance.prepare(sql);
        const rows = stmt.all(queryParams) as HealthLogEntry[];
        return rows;
    } catch (error: any) {
        log(LogLevel.ERROR, '[PersonalHealthDB] Error getting health entries from DB', { error: error.message, options });
        throw error;
    }
};

export const upsertDailyWorkoutEntry = (date: string, exerciseDetail: string): HealthLogEntry => {
    const dbInstance = getDbSync();
    const entryType: HealthEntryType = 'workout';

    const existingEntrySql = 'SELECT * FROM health_entries WHERE date = ? AND entryType = ? ORDER BY createdAt DESC LIMIT 1';
    let existingEntry = dbInstance.prepare(existingEntrySql).get(date, entryType) as HealthLogEntry | undefined;

    const now = new Date().toISOString();

    if (existingEntry && existingEntry.id !== undefined) {
        const newContent = existingEntry.content ? `${existingEntry.content}\n${exerciseDetail}` : exerciseDetail;
        const updateSql = 'UPDATE health_entries SET content = ?, createdAt = ? WHERE id = ?';
        try {
            dbInstance.prepare(updateSql).run(newContent, now, existingEntry.id);
            const updatedEntry = dbInstance.prepare('SELECT * FROM health_entries WHERE id = ?').get(existingEntry.id) as HealthLogEntry;
            if (!updatedEntry) { 
                throw new Error('Failed to retrieve the updated health entry after upsert.');
            }
            log(LogLevel.INFO, '[PersonalHealthDB] Workout entry updated in DB', { id: updatedEntry.id, date });
            return updatedEntry;
        } catch (error: any) {
            log(LogLevel.ERROR, '[PersonalHealthDB] Error updating workout entry in DB', { error: error.message, id: existingEntry.id });
            throw error;
        }
    } else {
        const newEntryData: Omit<HealthLogEntry, 'id' | 'createdAt'> = {
            date,
            entryType,
            content: exerciseDetail,
        };
        try {
            const addedEntry = addHealthEntryToDb(newEntryData); 
            log(LogLevel.INFO, '[PersonalHealthDB] New daily workout entry added to DB via upsert logic', { id: addedEntry.id, date });
            return addedEntry;
        } catch (error: any) {
            log(LogLevel.ERROR, '[PersonalHealthDB] Error adding new daily workout entry via upsert logic', { error: error.message, date });
            throw error;
        }
    }
}; 