# Wooster Logging System (v2 - Tiny Logger Plan)

This document outlines a simplified approach to logging for Wooster, focusing on simplicity and effectiveness.

## Goals for Logging System

1.  **Simplicity in Code:** Easy to call, minimal setup.
2.  **Simplicity in Configuration:** Easy to understand and change verbosity.
3.  **Useful Output:** Timestamps, clear levels, and the ability to see context (e.g., which module is logging, though this might be implicit or added later).
4.  **File Output:** Essential for debugging after a session.
5.  **Console Output:** For real-time monitoring.
6.  **Avoid Past Pitfalls:** No complex dependencies or circular import risks.

## Proposed Simple Logging Approach: "Tiny Logger"

A minimal logger implemented in a single file, `src/logger.ts`.

### Core Ideas:

*   **Single `log` function:** `log(level: LogLevel, message: string, ...args: any[])`
*   **`LogLevel` Enum:** `DEBUG`, `INFO`, `WARN`, `ERROR`. This enum would be defined within `src/logger.ts` itself to maintain its self-contained nature.
    *   `DEBUG = 0`
    *   `INFO = 1`
    *   `WARN = 2`
    *   `ERROR = 3`
*   **Basic Configuration (via Environment Variables):**
    *   `LOG_LEVEL`: (String) Sets the logging verbosity (e.g., `DEBUG`, `INFO`, `WARN`, `ERROR`). Defaults to `INFO` if not set. This single setting controls both console and file output levels.
    *   `LOG_FILE`: (String) Specifies the path to the log file (e.g., `wooster.log` or `logs/wooster.log`). If not set, file logging is disabled.
*   **Output Format:** `[TIMESTAMP] [LEVEL_NAME] message ...formattedArgs`
*   **Implementation Details:**
    *   `src/logger.ts` would contain an `initLogger()` function to be called once at Wooster's startup (early in `src/index.ts`).
    *   `initLogger()` reads `LOG_LEVEL` and `LOG_FILE` from `process.env`.
    *   The `log()` function checks the `configuredLogLevel`.
    *   If a message's level is at or above `configuredLogLevel`:
        *   It's printed to the appropriate console method (`console.debug`, `console.info`, `console.warn`, `console.error`).
        *   If `logFilePath` is set, the formatted message is appended to the specified file using a simple `fs.appendFileSync()`.

### Conceptual Draft of `src/logger.ts`:

```typescript
// src/logger.ts
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
    const levelKey = envLogLevel as keyof typeof LogLevel;
    if (LogLevel[levelKey] !== undefined) {
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
    
    console.log(`Logger Initialized. Console Level: ${LOG_LEVEL_NAMES[configuredLogLevel]}. File Logging to: ${logFilePath}`);
    
    // Ensure the logs directory exists
    const logDir = path.dirname(logFilePath);
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (err) {
        console.error(`Failed to create log directory: ${logDir}`, err);
        logFilePath = null; // Disable file logging if dir creation fails
      }
    }
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
  
  // Format the message along with any additional arguments
  const formattedMessageContent = util.format(message, ...args);
  const fullLogMessage = `[${timestamp}] [${levelName}] ${formattedMessageContent}`;

  // Console Output (using appropriate console methods)
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
      console.log(fullLogMessage); // Should not happen if level is valid
  }

  // File Output (simple append)
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, fullLogMessage + '\n', { encoding: 'utf8' });
    } catch (err) {
      // Log error to console if file writing fails
      console.error(`[${new Date().toISOString()}] [ERROR] Failed to write to log file ${logFilePath}:`, err);
      // Consider disabling file logging temporarily or permanently if errors persist
    }
  }
}
```

### Advantages of this Approach:

*   **Very Simple:** Minimal code, easy to understand and integrate.
*   **Self-Contained:** `src/logger.ts` would have no dependencies on other parts of Wooster for its core setup, preventing circular dependency issues.
*   **Configuration via Environment Variables:** Standard and straightforward for simple settings like log level and file path.
*   **Clear Output Format:** Includes timestamp and log level by default.
*   **Robust:** Uses `fs.appendFileSync` for simplicity in file writing, which is blocking but acceptable for a CLI tool's logging.

### Potential Next Steps (If this base is adopted):

1.  **Create `src/logger.ts`** with the code above (or similar).
2.  **Add `initLogger()` call:** Place this at the very beginning of the `main()` function in `src/index.ts`.
3.  **Update `.env.example`:** Add `LOG_LEVEL` and `LOG_FILE` with example values and comments.
4.  **Replace `console.log/warn/error/debug` calls:** Throughout the Wooster codebase, systematically replace direct console calls with `log(LogLevel.LEVEL, ...)`.
5.  **Documentation:** Update `00 SYSTEM.MD` and `README.MD` to describe the new, simpler logging system and its configuration via environment variables.
    *   Explain that `logs/` directory might be created if `LOG_FILE` points to a file within it.
    *   Add `*.log` or specific log file names to `.gitignore` if not already broadly covered by `logs/`.

This revised plan aims for a much more manageable and robust logging solution. 