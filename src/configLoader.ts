import fs from 'fs';
import path from 'path';
import { LogLevel } from './logger'; // Assuming LogLevel is exported from logger.ts
import { getPluginFileNames } from './pluginManager';

// Define an interface for the overall application configuration
export interface AppConfig {
  openai: OpenAIConfig;
  logging: LoggingConfig;
  ucm: UcmConfig;
  plugins: Record<string, boolean>; // Maps plugin filename (w/o .ts) to enabled status
  tavilyApiKey?: string; 
  tools: ToolsConfig; // Group tool-specific configs
}

export interface ToolsConfig {
  email: EmailToolConfig;
  googleCalendar: GoogleCalendarToolConfig;
  webSearch: WebSearchToolConfig;
}

// Define interfaces for each configuration section
export interface OpenAIConfig {
  apiKey: string;
  modelName: string;
  embeddingModelName: string;
  temperature: number;
  maxTokens: number;
}

export interface LoggingConfig {
  consoleLogLevel: LogLevel;
  fileLogLevel: LogLevel;
  logFile: string;
  logAgentLLMInteractions: boolean;
  consoleQuietMode: boolean;
}

export interface EmailToolConfig { // Renamed from EmailConfig for clarity
  enabled: boolean;
  senderEmailAddress: string | null; 
  userPersonalEmailAddress: string | null;
  emailAppPassword: string | null; 
}

export interface UcmConfig {
  enabled: boolean;
  extractorLlmPrompt: string | null;
}

export interface GoogleCalendarToolConfig { // Renamed from GoogleCalendarConfig
  enabled: boolean;
  clientId: string | null; // Moved from separate GoogleConfig
  clientSecret: string | null; // Moved from separate GoogleConfig
  refreshToken: string | null;
  calendarId: string;
}

export interface WebSearchToolConfig {
  enabled: boolean;
}

// Define the default configuration
export const DEFAULT_CONFIG: AppConfig = {
  openai: {
    apiKey: "YOUR_OPENAI_API_KEY_HERE", // Placeholder, must be from env
    modelName: "gpt-4o-mini",
    embeddingModelName: "text-embedding-3-small",
    temperature: 0.7,
    maxTokens: 2048,
  },
  tavilyApiKey: undefined,
  logging: {
    consoleLogLevel: LogLevel.INFO,
    fileLogLevel: LogLevel.INFO,
    logFile: 'logs/wooster_session.log',
    logAgentLLMInteractions: false,
    consoleQuietMode: true,
  },
  ucm: {
    enabled: false,
    extractorLlmPrompt: null,
  },
  tools: {
    email: {
      enabled: false,
      senderEmailAddress: null,
      userPersonalEmailAddress: null,
      emailAppPassword: null,
    },
    googleCalendar: {
      enabled: false,
      clientId: null,
      clientSecret: null,
      refreshToken: null,
      calendarId: 'primary',
    },
    webSearch: {
      enabled: true, // Will be overridden if TAVILY_API_KEY is missing
    }
  },
  plugins: {}, 
};

// Holder for the current configuration
let currentConfig: AppConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep copy

function getEnvVar(varName: string): string | undefined {
  return process.env[varName];
}

function parseBoolean(envValue: string | undefined, defaultValue: boolean): boolean {
  if (envValue === undefined || envValue === '') return defaultValue;
  return envValue.toLowerCase() === 'true';
}

function parseNumber(envValue: string | undefined, defaultValue: number): number {
  if (envValue === undefined || envValue === '') return defaultValue;
  const num = parseFloat(envValue);
  return isNaN(num) ? defaultValue : num;
}

function parseLogLevel(envValue: string | undefined, defaultValue: LogLevel): LogLevel {
  if (envValue === undefined || envValue === '') return defaultValue;
  const upperValue = envValue.toUpperCase();
  if (Object.values(LogLevel).includes(upperValue as LogLevel)) {
    return upperValue as LogLevel;
  }
  return defaultValue;
}

function parseString(envValue: string | undefined, defaultValue: string): string {
  if (envValue === undefined || envValue === '') {
    return defaultValue;
  }
  return envValue;
}

function parseNullableString(envValue: string | undefined, defaultValue: string | null): string | null {
  if (envValue === undefined) {
    return defaultValue;
  }
  if (envValue === '') {
    return null;
  }
  return envValue;
}

// Function to load configuration from environment variables
export function loadConfig(): AppConfig {
  currentConfig.openai = {
    apiKey: getEnvVar('OPENAI_API_KEY') || DEFAULT_CONFIG.openai.apiKey,
    modelName: parseString(getEnvVar('OPENAI_MODEL_NAME'), DEFAULT_CONFIG.openai.modelName),
    embeddingModelName: parseString(getEnvVar('OPENAI_EMBEDDING_MODEL_NAME'), DEFAULT_CONFIG.openai.embeddingModelName),
    temperature: parseNumber(getEnvVar('OPENAI_TEMPERATURE'), DEFAULT_CONFIG.openai.temperature),
    maxTokens: parseNumber(getEnvVar('OPENAI_MAX_TOKENS'), DEFAULT_CONFIG.openai.maxTokens),
  };

  currentConfig.logging = {
    consoleLogLevel: parseLogLevel(getEnvVar('TOOLS_LOGGING_CONSOLE_LOG_LEVEL'), DEFAULT_CONFIG.logging.consoleLogLevel),
    fileLogLevel: parseLogLevel(getEnvVar('TOOLS_LOGGING_FILE_LOG_LEVEL'), DEFAULT_CONFIG.logging.fileLogLevel),
    logFile: parseString(getEnvVar('TOOLS_LOGGING_LOG_FILE'), DEFAULT_CONFIG.logging.logFile),
    logAgentLLMInteractions: parseBoolean(getEnvVar('TOOLS_LOGGING_LOG_AGENT_LLM_INTERACTIONS'), DEFAULT_CONFIG.logging.logAgentLLMInteractions),
    consoleQuietMode: parseBoolean(getEnvVar('TOOLS_LOGGING_CONSOLE_QUIET_MODE'), DEFAULT_CONFIG.logging.consoleQuietMode),
  };

  currentConfig.ucm = {
    enabled: parseBoolean(getEnvVar('TOOLS_UCM_ENABLED'), DEFAULT_CONFIG.ucm.enabled),
    extractorLlmPrompt: parseNullableString(getEnvVar('TOOLS_UCM_EXTRACTOR_LLM_PROMPT'), DEFAULT_CONFIG.ucm.extractorLlmPrompt),
  };
  
  currentConfig.tools = {
    email: {
      enabled: parseBoolean(getEnvVar('TOOLS_EMAIL_ENABLED'), DEFAULT_CONFIG.tools.email.enabled),
      senderEmailAddress: parseNullableString(getEnvVar('TOOLS_EMAIL_SENDER_EMAIL_ADDRESS'), DEFAULT_CONFIG.tools.email.senderEmailAddress),
      userPersonalEmailAddress: parseNullableString(getEnvVar('TOOLS_EMAIL_USER_PERSONAL_EMAIL_ADDRESS'), DEFAULT_CONFIG.tools.email.userPersonalEmailAddress),
      emailAppPassword: parseNullableString(getEnvVar('TOOLS_EMAIL_EMAIL_APP_PASSWORD'), DEFAULT_CONFIG.tools.email.emailAppPassword),
    },
    googleCalendar: {
      enabled: parseBoolean(getEnvVar('TOOLS_GOOGLE_CALENDAR_ENABLED'), DEFAULT_CONFIG.tools.googleCalendar.enabled),
      clientId: parseNullableString(getEnvVar('GOOGLE_CLIENT_ID'), DEFAULT_CONFIG.tools.googleCalendar.clientId),
      clientSecret: parseNullableString(getEnvVar('GOOGLE_CLIENT_SECRET'), DEFAULT_CONFIG.tools.googleCalendar.clientSecret),
      refreshToken: parseNullableString(getEnvVar('GOOGLE_CALENDAR_REFRESH_TOKEN'), DEFAULT_CONFIG.tools.googleCalendar.refreshToken),
      calendarId: parseString(getEnvVar('GOOGLE_CALENDAR_ID'), DEFAULT_CONFIG.tools.googleCalendar.calendarId),
    },
    webSearch: {
      enabled: parseBoolean(getEnvVar('TOOLS_WEB_SEARCH_ENABLED'), 
        !!(getEnvVar('TAVILY_API_KEY') && getEnvVar('TAVILY_API_KEY') !== '') 
          ? DEFAULT_CONFIG.tools.webSearch.enabled 
          : false
      ),
    }
  };

  // TEMPORARY DEBUG LOGGING START - REMOVE AFTER CONFIRMATION
  // console.log('[DEBUG ConfigLoader] Email Config Loaded:');
  // console.log(`  Enabled: ${currentConfig.tools.email.enabled}`);
  // console.log(`  Sender Address: '${currentConfig.tools.email.senderEmailAddress}'`); // Log with quotes to see if it's empty or null
  // console.log(`  App Password: '${currentConfig.tools.email.emailAppPassword}'`); // Log with quotes
  // TEMPORARY DEBUG LOGGING END

  currentConfig.tavilyApiKey = getEnvVar('TAVILY_API_KEY') || undefined;
  if (currentConfig.tools.webSearch.enabled && !currentConfig.tavilyApiKey) {
    // console.warn("Web search is enabled but TAVILY_API_KEY is not set. Disabling web search tool.");
    currentConfig.tools.webSearch.enabled = false;
  }

  currentConfig.plugins = {};
  try {
    const pluginFiles = getPluginFileNames(); 
    pluginFiles.forEach(fileName => {
      const pluginName = path.basename(fileName, '.ts'); 
      const envVarName = 'PLUGIN_' + pluginName.toUpperCase() + '_ENABLED'; 
      currentConfig.plugins[pluginName] = parseBoolean(getEnvVar(envVarName), true); // Default to true if env var is not set
    });
  } catch (error) {
    // console.error('Error loading plugin configurations:', error);
  }
  return currentConfig;
}

// Function to get the current configuration
export function getConfig(): AppConfig {
  return currentConfig;
}

// Initial load of the configuration when this module is imported.
loadConfig(); 