import config from 'config';
import { log, LogLevel } from './logger';

// Define interfaces for the application configuration.
// These should match the structure of your config files (e.g., config/default.json).

export interface LoggingConfig {
  consoleLogLevel: LogLevel;
  fileLogLevel: LogLevel;
  logFile: string;
  logAgentLLMInteractions: boolean;
  consoleQuietMode: boolean;
}

export interface GtdConfig {
  projectsDir: string;
}

export interface FrontendPluginConfig {
  enabled: boolean;
  port: number;
}

export interface AppConfig {
  logLevel: LogLevel;
  gtd: GtdConfig;
  plugins: {
    [key: string]: any;
    frontend?: FrontendPluginConfig;
    projectManager?: {
        enabled: boolean;
    }
  };
}

let currentConfig: AppConfig;

/**
 * Loads the application configuration using the 'config' package.
 * This function reads from config files (default.json, etc.) and merges
 * environment variables according to the rules in custom-environment-variables.json.
 * @returns The fully resolved application configuration.
 */
export function loadConfig(): AppConfig {
  // The 'config' package automatically handles loading and merging.
  const loadedConfig = config.util.toObject() as AppConfig;
  
  currentConfig = loadedConfig;
  log(LogLevel.DEBUG, 'Application Config Loaded:', { appConfig: currentConfig });
  return currentConfig;
}

/**
 * Returns the currently loaded application configuration.
 * @returns The application configuration object.
 */
export function getConfig(): AppConfig {
  if (!currentConfig) {
    return loadConfig();
  }
  return currentConfig;
}

// Initial load of the configuration when this module is imported.
loadConfig(); 