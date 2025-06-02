import fs from 'fs';
import path from 'path';
import { LogLevel } from './logger'; // Assuming LogLevel is exported from logger.ts
import { getPluginDirectoryNames as getPluginFileNames } from './pluginManager';

// Define interfaces for OpenAI and Logging configurations
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

// Define an interface for the overall application configuration
export interface AppConfig {
  env: string;
  appName: string;
  version: string;
  logging: LoggingConfig;
  openai: OpenAIConfig;
  tavily: TavilyConfig;
  google?: GoogleConfig;
  userProfile: UserProfileConfig;
  plugins: Record<string, boolean>;
  projects: ProjectConfig;
  gmail?: GmailConfig;
  weather?: WeatherConfig;
  dailyReview?: DailyReviewConfig;
}

export interface GmailConfig {
  senderEmailAddress: string | null;
  userPersonalEmailAddress: string | null;
  emailAppPassword: string | null;
}

export interface UserProfileConfig {
  enabled: boolean;
  extractorLlmPrompt: string | null;
}

export interface GoogleConfig {
  calendar?: {
    clientId: string | null;
    clientSecret: string | null;
    refreshToken: string | null;
    calendarId: string;
  };
}

export interface WeatherConfig {
  city: string | null;
  openWeatherMapApiKey: string | null;
}

export interface DailyReviewConfig {
  scheduleCronExpression: string;
}

export interface TavilyConfig {
  apiKey: string | null;
}

export interface ProjectConfig {
  // Add appropriate properties for project configuration
}

// Define the default configuration
export const DEFAULT_CONFIG: AppConfig = {
  env: "development",
  appName: "Wooster",
  version: "1.0.0",
  logging: {
    consoleLogLevel: LogLevel.INFO,
    fileLogLevel: LogLevel.INFO,
    logFile: 'logs/wooster_session.log',
    logAgentLLMInteractions: false,
    consoleQuietMode: true,
  },
  openai: {
    apiKey: "YOUR_OPENAI_API_KEY_HERE", // Placeholder, must be from env
    modelName: "gpt-4o-mini",
    embeddingModelName: "text-embedding-3-small",
    temperature: 0.7,
    maxTokens: 2048,
  },
  tavily: {
    apiKey: null,
  },
  google: {
    calendar: {
      clientId: null,
      clientSecret: null,
      refreshToken: null,
      calendarId: 'primary',
    }
  },
  userProfile: {
    enabled: false,
    extractorLlmPrompt: null,
  },
  plugins: {},
  projects: {},
  gmail: {
    senderEmailAddress: null,
    userPersonalEmailAddress: null,
    emailAppPassword: null,
  },
  weather: {
    city: null,
    openWeatherMapApiKey: null,
  },
  dailyReview: {
    scheduleCronExpression: "30 6 * * *",
  }
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

  const requestedConsoleLogLevel = parseLogLevel(getEnvVar('TOOLS_LOGGING_CONSOLE_LOG_LEVEL'), DEFAULT_CONFIG.logging.consoleLogLevel);
  const defaultQuietMode = DEFAULT_CONFIG.logging.consoleQuietMode;
  // If debug is explicitly requested for console, quiet mode should be off.
  // Otherwise, respect default or a future specific env var.
  const quietMode = requestedConsoleLogLevel === LogLevel.DEBUG ? false : parseBoolean(getEnvVar('TOOLS_LOGGING_CONSOLE_QUIET_MODE'), defaultQuietMode);

  currentConfig.logging = {
    consoleLogLevel: requestedConsoleLogLevel,
    fileLogLevel: parseLogLevel(getEnvVar('TOOLS_LOGGING_FILE_LOG_LEVEL'), DEFAULT_CONFIG.logging.fileLogLevel),
    logFile: parseString(getEnvVar('TOOLS_LOGGING_LOG_FILE'), DEFAULT_CONFIG.logging.logFile),
    logAgentLLMInteractions: parseBoolean(getEnvVar('TOOLS_LOGGING_LOG_AGENT_LLM_INTERACTIONS'), DEFAULT_CONFIG.logging.logAgentLLMInteractions),
    consoleQuietMode: quietMode,
  };

  currentConfig.userProfile = {
    enabled: parseBoolean(getEnvVar('USER_PROFILE_ENABLED'), DEFAULT_CONFIG.userProfile.enabled),
    extractorLlmPrompt: parseNullableString(getEnvVar('USER_PROFILE_EXTRACTOR_LLM_PROMPT'), DEFAULT_CONFIG.userProfile.extractorLlmPrompt),
  };
  
  currentConfig.gmail = {
    senderEmailAddress: parseNullableString(getEnvVar('GMAIL_SENDER_EMAIL_ADDRESS'), DEFAULT_CONFIG.gmail?.senderEmailAddress || null),
    userPersonalEmailAddress: parseNullableString(getEnvVar('GMAIL_USER_PERSONAL_EMAIL_ADDRESS'), DEFAULT_CONFIG.gmail?.userPersonalEmailAddress || null),
    emailAppPassword: parseNullableString(getEnvVar('GMAIL_APP_PASSWORD'), DEFAULT_CONFIG.gmail?.emailAppPassword || null),
  };

  currentConfig.google = {
    calendar: {
      clientId: parseNullableString(getEnvVar('GOOGLE_CLIENT_ID'), DEFAULT_CONFIG.google?.calendar?.clientId || null),
      clientSecret: parseNullableString(getEnvVar('GOOGLE_CLIENT_SECRET'), DEFAULT_CONFIG.google?.calendar?.clientSecret || null),
      refreshToken: parseNullableString(getEnvVar('GOOGLE_CALENDAR_REFRESH_TOKEN'), DEFAULT_CONFIG.google?.calendar?.refreshToken || null),
      calendarId: parseString(getEnvVar('GOOGLE_CALENDAR_ID'), DEFAULT_CONFIG.google?.calendar?.calendarId || 'primary'),
    }
  };

  currentConfig.weather = {
    city: parseNullableString(getEnvVar('WEATHER_CITY'), DEFAULT_CONFIG.weather?.city || null),
    openWeatherMapApiKey: parseNullableString(getEnvVar('OPENWEATHERMAP_API_KEY'), DEFAULT_CONFIG.weather?.openWeatherMapApiKey || null),
  };
  
  currentConfig.dailyReview = {
    scheduleCronExpression: parseString(getEnvVar('DAILY_REVIEW_SCHEDULE_CRON'), DEFAULT_CONFIG.dailyReview?.scheduleCronExpression || "30 6 * * *"),
  };

  currentConfig.tavily = {
    apiKey: getEnvVar('TAVILY_API_KEY') || DEFAULT_CONFIG.tavily?.apiKey || null,
  };

  currentConfig.plugins = {};
  try {
    const pluginFiles = getPluginFileNames(); 
    pluginFiles.forEach((fileName: string) => {
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

export function getPluginSpecificConfig<T>(pluginName: string): T | undefined {
  // This is a simplistic way; a plugin might want a sub-object like config.plugins.myPlugin.settings
  // For now, assuming plugin-specific configs are top-level like currentConfig.weather, currentConfig.gmail
  // This function would need to be smarter or plugins would directly access config.weather etc.
  // For this example, let's assume it could return a part of AppConfig if the key matches.
  if (currentConfig.hasOwnProperty(pluginName)) {
    return (currentConfig as any)[pluginName] as T;
  }
  return undefined;
} 