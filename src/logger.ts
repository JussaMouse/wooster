import fs from 'fs';
import path from 'path';
import util from 'util'; // For formatting arguments like console.log does

// LogLevel Enum defined directly in the logger file
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Mapping LogLevel to string names for output
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

let configuredLogLevel: LogLevel = LogLevel.INFO; // Default log level
let logFilePath: string | null = null;

/**
 * Initializes the logger based on environment variables.
 * Should be called once at application startup.
 */
export function initLogger() {
  const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLogLevel) {
    const levelKey = envLogLevel as keyof typeof LogLevel; // e.g., "DEBUG"
    // Check if the string key exists in the LogLevel enum (e.g., LogLevel["DEBUG"] is 0)
    // And also ensure it's a string key, not a reverse-mapped number key
    if (typeof LogLevel[levelKey] === 'number') { 
      configuredLogLevel = LogLevel[levelKey];
    }
  }

  const envLogFile = process.env.LOG_FILE;
  if (envLogFile) {
    // Default to a 'logs' directory if only a filename is given
    if (!path.isAbsolute(envLogFile) && !envLogFile.includes(path.sep)) {
      logFilePath = path.resolve(process.cwd(), 'logs', envLogFile);
    } else {
      logFilePath = path.resolve(process.cwd(), envLogFile);
    }
    
    // Ensure the logs directory exists
    const logDir = path.dirname(logFilePath);
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (err) {
        // Use console.error for this critical bootstrap phase message
        console.error(`[${new Date().toISOString()}] [ERROR] Failed to create log directory: ${logDir}. File logging will be disabled.`, err);
        logFilePath = null; // Disable file logging if dir creation fails
      }
    }
    // Initial message to console, as logger.log isn't ready/appropriate here for its own init message.
    console.log(`Logger Initialized. Console Level: ${LOG_LEVEL_NAMES[configuredLogLevel]}. File Logging to: ${logFilePath ? logFilePath : 'DISABLED'}`);

  } else {
    console.log(`Logger Initialized. Console Level: ${LOG_LEVEL_NAMES[configuredLogLevel]}. File logging disabled (LOG_FILE env var not set).`);
  }
}

/**
 * Logs a message to the console and optionally to a file.
 * @param level The severity level of the message.
 * @param message The main message string (can include format specifiers).
 * @param args Additional arguments to format into the message string (like console.log).
 */
export function log(level: LogLevel, message: string, ...args: any[]) {
  if (level < configuredLogLevel) {
    return; // Skip logging if the message's level is below the configured level
  }

  const timestamp = new Date().toISOString();
  const levelName = LOG_LEVEL_NAMES[level] || 'LOG'; // Fallback, though should always be found
  
  const formattedMessageContent = util.format(message, ...args);
  const fullLogMessage = `[${timestamp}] [${levelName}] ${formattedMessageContent}`;

  switch (level) {
    case LogLevel.DEBUG:
      console.debug(fullLogMessage);
      break;
    case LogLevel.INFO:
      console.info(fullLogMessage);
      break;
    case LogLevel.WARN:
      console.warn(fullLogMessage);
      break;
    case LogLevel.ERROR:
      console.error(fullLogMessage);
      break;
    default:
      console.log(fullLogMessage); 
  }

  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, fullLogMessage + '\n', { encoding: 'utf8' });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [ERROR] Failed to write to log file ${logFilePath}:`, err);
    }
  }
} 