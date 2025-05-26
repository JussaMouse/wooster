import fs from 'fs';
import path from 'path';
import { LogLevel } from './logger'; // Assuming LogLevel is exported from logger.ts
import { getPluginFileNames } from './pluginManager';

// Define an interface for the overall application configuration
export interface AppConfig {
  openai: OpenAIConfig;
  logging: LoggingConfig;
  email: EmailConfig;
  ucm: UcmConfig;
  plugins: Record<string, boolean>; // Maps plugin filename (w/o .ts) to enabled status
  google: GoogleConfig;
  googleCalendar: GoogleCalendarConfig;
  // Add other configuration sections as needed
}

// Define interfaces for each configuration section
export interface OpenAIConfig {
  apiKey: string | null;
  modelName: string;
}

export interface LoggingConfig {
  consoleLogLevel: LogLevel;
  fileLogLevel: LogLevel;
  logFile: string;
  logAgentLLMInteractions: boolean;
  consoleQuietMode: boolean;
}

export interface EmailConfig {
  enabled: boolean;
  senderEmailAddress: string | null; // e.g., your Gmail address
  userPersonalEmailAddress: string | null; // User's personal email, for CC'ing or as default "to"
  emailAppPassword: string | null; // App Password for Gmail
}

export interface UcmConfig {
  enabled: boolean;
  extractorLlmPrompt: string | null;
}

export interface GoogleConfig {
  clientId: string | null;
  clientSecret: string | null;
}

export interface GoogleCalendarConfig {
  enabled: boolean;
  refreshToken: string | null;
  calendarId: string | null;
}

// Define the default configuration
// This will be used if the .env file is missing or a variable is not set.
export const DEFAULT_CONFIG: AppConfig = {
  openai: {
    apiKey: null, // Must be provided by the user
    modelName: 'gpt-4o', // Default model
  },
  logging: {
    consoleLogLevel: LogLevel.INFO,
    fileLogLevel: LogLevel.INFO,
    logFile: 'wooster_session.log', // Default log file name
    logAgentLLMInteractions: false,
    consoleQuietMode: false,
  },
  email: {
    enabled: false,
    senderEmailAddress: null,
    userPersonalEmailAddress: null,
    emailAppPassword: null,
  },
  ucm: {
    enabled: false, // UCM is disabled by default
    extractorLlmPrompt: null, // Default prompt will be used if null
  },
  google: {
    clientId: null,
    clientSecret: null,
  },
  googleCalendar: {
    enabled: false,
    refreshToken: null,
    calendarId: 'primary', // Default calendar ID
  },
  plugins: {}, // No plugins enabled by default, will be populated dynamically
};

// Holder for the current configuration
let currentConfig: AppConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep copy

/**
 * Helper function to get an environment variable with a default value and type conversion.
 * @param varName The name of the environment variable.
 * @param defaultValue The default value if the variable is not set or empty.
 * @param type The target type ('string', 'boolean', 'number', 'loglevel').
 * @returns The value of the environment variable or the default value, converted to the specified type.
 */
function getEnv<T extends string | boolean | number | LogLevel | null>(
  varName: string,
  defaultValue: T,
  type: 'string' | 'boolean' | 'number' | 'loglevel' = 'string'
): T {
  const value = process.env[varName];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  switch (type) {
    case 'boolean':
      return (value.toLowerCase() === 'true') as T;
    case 'number':
      const num = parseFloat(value);
      return isNaN(num) ? defaultValue : (num as T);
    case 'loglevel':
      const upperValue = value.toUpperCase();
      if (Object.values(LogLevel).includes(upperValue as LogLevel)) {
        return upperValue as T;
      }
      // console.warn(\`Invalid LogLevel "\\\${value}" for \\\${varName}. Using default: "\\\${defaultValue}".\`);
      return defaultValue;
    default: // string
      return value as T;
  }
}

// Function to load configuration from environment variables
export function loadConfig(): AppConfig {
  currentConfig.openai = {
    apiKey: getEnv('OPENAI_API_KEY', DEFAULT_CONFIG.openai.apiKey),
    modelName: getEnv('OPENAI_MODEL_NAME', DEFAULT_CONFIG.openai.modelName),
  };

  currentConfig.logging = {
    consoleLogLevel: getEnv('LOGGING_CONSOLE_LOG_LEVEL', DEFAULT_CONFIG.logging.consoleLogLevel, 'loglevel'),
    fileLogLevel: getEnv('LOGGING_FILE_LOG_LEVEL', DEFAULT_CONFIG.logging.fileLogLevel, 'loglevel'),
    logFile: getEnv('LOGGING_LOG_FILE', DEFAULT_CONFIG.logging.logFile),
    logAgentLLMInteractions: getEnv('LOGGING_LOG_AGENT_LLM_INTERACTIONS', DEFAULT_CONFIG.logging.logAgentLLMInteractions, 'boolean'),
    consoleQuietMode: getEnv('LOGGING_CONSOLE_QUIET_MODE', DEFAULT_CONFIG.logging.consoleQuietMode, 'boolean'),
  };

  currentConfig.email = {
    enabled: getEnv('EMAIL_ENABLED', DEFAULT_CONFIG.email.enabled, 'boolean'),
    senderEmailAddress: getEnv('EMAIL_SENDER_EMAIL_ADDRESS', DEFAULT_CONFIG.email.senderEmailAddress),
    userPersonalEmailAddress: getEnv('EMAIL_USER_PERSONAL_EMAIL_ADDRESS', DEFAULT_CONFIG.email.userPersonalEmailAddress),
    emailAppPassword: getEnv('EMAIL_EMAIL_APP_PASSWORD', DEFAULT_CONFIG.email.emailAppPassword),
  };

  currentConfig.ucm = {
    enabled: getEnv('UCM_ENABLED', DEFAULT_CONFIG.ucm.enabled, 'boolean'),
    extractorLlmPrompt: getEnv('UCM_EXTRACTOR_LLM_PROMPT', DEFAULT_CONFIG.ucm.extractorLlmPrompt),
  };

  currentConfig.google = {
    clientId: getEnv('GOOGLE_CLIENT_ID', DEFAULT_CONFIG.google.clientId),
    clientSecret: getEnv('GOOGLE_CLIENT_SECRET', DEFAULT_CONFIG.google.clientSecret),
  };

  currentConfig.googleCalendar = {
    enabled: getEnv('GOOGLE_CALENDAR_ENABLED', DEFAULT_CONFIG.googleCalendar.enabled, 'boolean'),
    refreshToken: getEnv('GOOGLE_CALENDAR_REFRESH_TOKEN', DEFAULT_CONFIG.googleCalendar.refreshToken),
    calendarId: getEnv('GOOGLE_CALENDAR_ID', DEFAULT_CONFIG.googleCalendar.calendarId),
  };

  // Dynamically populate plugin enablement from environment variables
  currentConfig.plugins = {};
  try {
    const pluginFiles = getPluginFileNames(); // Assumes this function exists and returns string[]
    pluginFiles.forEach(fileName => {
      const pluginName = path.basename(fileName, '.ts'); // e.g., "myPlugin" from "myPlugin.ts"
      const envVarName = 'PLUGIN_' + pluginName.toUpperCase() + '_ENABLED'; // e.g., PLUGIN_MYPLUGIN_ENABLED
      // Default to true if the variable is not explicitly set to 'false'
      const isEnabled = getEnv(envVarName, true, 'boolean'); // Default to true
      currentConfig.plugins[pluginName] = isEnabled;
    });
  } catch (error) {
    console.error('Error loading plugin configurations:', error);
    // Use a bootstrap logger or a simple console.error if logger isn't fully initialized
    // Or handle this more gracefully depending on application stage
  }
  return currentConfig;
}

// Function to get the current configuration
export function getConfig(): AppConfig {
  return currentConfig;
}

// Function to set the OpenAI API key programmatically (e.g., from a command)
// Potentially useful, but consider security implications.
// export function setOpenAIApiKey(apiKey: string): void {
//   currentConfig.openai.apiKey = apiKey;
//   // TODO: Consider if this should also attempt to save back to a .env or config file,
//   // or if it's purely an in-session change. For now, it's in-session.
// }

// Initial load of the configuration when this module is imported.
// This ensures that \`getConfig()\` returns a populated config object.
loadConfig(); 