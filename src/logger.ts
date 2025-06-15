import fs from 'fs';
import path from 'path';
import util from 'util'; // For formatting arguments like console.log does
import type { LoggingConfig } from './configLoader'; // Import LoggingConfig

// Define LogLevel enum here as the source of truth
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  RESPONSE = 'RESPONSE', // Added for Wooster's direct responses
  WARN = 'WARN',
  ERROR = 'ERROR',
}

let configuredConsoleLogLevel: LogLevel = LogLevel.INFO; // Default console log level
let configuredFileLogLevel: LogLevel = LogLevel.INFO;    // Default file log level
let currentLogFile: string | null = null;
let logAgentLLMInteractionsEnabled = false;
let configuredConsoleQuietMode = false; // Default console quiet mode

/**
 * Initial, minimal logger setup from environment variables.
 * This is for messages before config.json is loaded.
 * Console logging only at this stage.
 */
export function bootstrapLogger() {
  const envConsoleLogLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envConsoleLogLevel && LogLevel[envConsoleLogLevel as keyof typeof LogLevel]) {
    configuredConsoleLogLevel = LogLevel[envConsoleLogLevel as keyof typeof LogLevel];
  }
  console.log(`[${new Date().toLocaleString()}] [INFO] Logger bootstrapped. Initial console Loglevel: ${configuredConsoleLogLevel}. Full config pending.`);
}

/**
 * Applies the full logging configuration from the loaded AppConfig.
 * This should be called after config.json is parsed.
 * @param config The logging configuration object.
 */
export function applyLoggerConfig(config: LoggingConfig): void {
  configuredConsoleLogLevel = config.consoleLogLevel || LogLevel.INFO;
  configuredFileLogLevel = config.fileLogLevel || LogLevel.INFO;
  logAgentLLMInteractionsEnabled = config.logAgentLLMInteractions || false;
  configuredConsoleQuietMode = config.consoleQuietMode || false;

  if (config.logFile) {
    // Always resolve the log file path relative to the current working directory.
    currentLogFile = path.resolve(process.cwd(), config.logFile);

    const logDir = path.dirname(currentLogFile);
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (err) {
        console.error(`[${new Date().toLocaleString()}] [ERROR] Failed to create log directory: ${logDir}. File logging will be disabled. Error: ${util.format(err)}`);
        currentLogFile = null;
      }
    }
  } else {
    currentLogFile = null; // Explicitly disable file logging if logFile is null/empty
  }
  // Log the finalized configuration
  log(LogLevel.INFO, `Logger fully configured. Console Loglevel: ${configuredConsoleLogLevel}, File Loglevel: ${configuredFileLogLevel}, File Path: ${currentLogFile || 'DISABLED'}, Log Agent LLM Interactions: ${logAgentLLMInteractionsEnabled}`);
}

/**
 * Logs a message to the console and optionally to a file.
 * @param level The severity level of the message.
 * @param message The main message string (can include format specifiers).
 * @param args Additional arguments to format into the message string (like console.log).
 */
export function log(level: LogLevel, message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString();
  // LogLevel is already a string, e.g., "INFO"
  const fullLogMessage = `[${timestamp}] [${level}] ${util.format(message, ...args)}`;

  // Console logging
  // Convert string LogLevel from config to numeric for comparison if needed, or compare strings directly
  // For simplicity, we'll rely on the direct string values from the enum
  const levelOrder = { [LogLevel.DEBUG]: 0, [LogLevel.INFO]: 1, [LogLevel.RESPONSE]: 1, [LogLevel.WARN]: 2, [LogLevel.ERROR]: 3 };
  
  if (levelOrder[level] >= levelOrder[configuredConsoleLogLevel]) {
    let logToConsole = true; // Default to logging if level is sufficient

    if (configuredConsoleQuietMode) {
      // In quiet mode, only RESPONSE, WARN, and ERROR should be logged to console.
      // Suppress DEBUG and general INFO.
      if (level === LogLevel.DEBUG || level === LogLevel.INFO) {
        logToConsole = false;
      }
    }

    if (logToConsole) {
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(fullLogMessage);
          break;
        case LogLevel.INFO: // General INFO messages
        case LogLevel.RESPONSE: // Wooster's direct responses, logged via console.info
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
    }
  }

  // File logging
  if (currentLogFile && (levelOrder[level] >= levelOrder[configuredFileLogLevel])) {
    try {
      fs.appendFileSync(currentLogFile, fullLogMessage + '\n', { encoding: 'utf8' });
    } catch (err) {
      // Avoid recursive log calls on file write error
      console.error(`[${new Date().toLocaleString()}] [ERROR] Failed to write to log file ${currentLogFile}: ${util.format(err)}`);
    }
  }
}

/**
 * Special logger for agent LLM interactions, controlled by a specific config flag.
 * @param message The message string (can include format specifiers).
 * @param args Additional arguments to format into the message string.
 */
export function logLLMInteraction(message: string, ...args: any[]) {
  if (!logAgentLLMInteractionsEnabled) {
    return;
  }
  // Log LLM interactions typically at DEBUG level or a dedicated level if desired.
  // For now, we'll just use a prefix and log through the main log function at DEBUG level.
  const formattedMessage = util.format(message, ...args);
  log(LogLevel.DEBUG, `[LLM_INTERACTION] ${formattedMessage}`);
}

// Remove old initLogger as its functionality is split between bootstrapLogger and applyLoggerConfig
// export function initLogger() { ... } 