import Database from 'better-sqlite3';
import { getConfig } from '../../configLoader';
import { SCHEMA_SQL } from './schema';
import { log, LogLevel } from '../../logger';
import fs from 'fs';
import path from 'path';

let dbInstance: Database.Database | null = null;

export function getKbDatabase(): Database.Database {
  if (dbInstance) return dbInstance;

  const config = getConfig();
  const dbPath = config.personalLibrary?.dbPath || 'database/knowledge_base.sqlite3';

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  log(LogLevel.INFO, `Opening KB database at ${dbPath}`);
  
  try {
    dbInstance = new Database(dbPath);
    
    // Run schema initialization
    dbInstance.exec(SCHEMA_SQL);
    
    log(LogLevel.INFO, `KB database initialized successfully`);
    return dbInstance;
  } catch (error) {
    log(LogLevel.ERROR, `Failed to initialize KB database: ${error}`);
    throw error;
  }
}

export function closeKbDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    log(LogLevel.INFO, `KB database closed`);
  }
}

