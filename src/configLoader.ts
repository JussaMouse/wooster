import fs from 'fs';
import path from 'path';
import { log, LogLevel } from './logger'; // Assuming LogLevel and log are exported from logger.ts
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

// Define an interface for GTD specific configurations
export interface GtdConfig {
  basePath?: string;
  projectsDir?: string;
  archiveDir?: string;
  inboxPath?: string;
  nextActionsPath?: string;
  somedayMaybePath?: string;
  waitingForPath?: string;
}

// Define an interface for PersonalHealth plugin specific configurations
export interface PersonalHealthConfig {
  healthDir?: string;
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
  gtd?: GtdConfig; // For sortInbox paths
  gmail?: GmailConfig;
  weather?: WeatherConfig;
  dailyReview?: DailyReviewConfig;
  captureApi?: CaptureApiConfig;
  apiPlugin?: ApiPluginConfig;
  personalHealth?: PersonalHealthConfig; // Added PersonalHealth config
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
  units?: "C" | "F";
}

export interface DailyReviewConfig {
  scheduleCronExpression: string;
}

export interface CaptureApiConfig {
  enabled: boolean;
  port: number;
  apiKey: string | null;
  ipWhitelistEnabled: boolean;
  allowedIps: string[];
}

export interface ApiPluginConfig {
  enabled: boolean;
  port: number;
  apiKey: string | null;
  globalIpWhitelistEnabled: boolean;
  globalAllowedIps: string[];
}

export interface TavilyConfig {
  apiKey: string | null;
}

export interface ProjectConfig {
  // Add appropriate properties for project configuration if needed
  // For now, keeping it simple as it's not the focus
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
  projects: {}, // Kept simple
  gtd: {
    basePath: undefined,
    projectsDir: undefined,
    archiveDir: undefined,
    inboxPath: undefined,
    nextActionsPath: undefined,
    somedayMaybePath: undefined,
    waitingForPath: undefined,
  },
  gmail: {
    senderEmailAddress: null,
    userPersonalEmailAddress: null,
    emailAppPassword: null,
  },
  weather: {
    city: null,
    openWeatherMapApiKey: null,
    units: "F",
  },
  dailyReview: {
    scheduleCronExpression: "30 6 * * *",
  },
  captureApi: {
    enabled: false,
    port: 3002,
    apiKey: null,
    ipWhitelistEnabled: false,
    allowedIps: [],
  },
  apiPlugin: {
    enabled: false,
    port: 3000,
    apiKey: null,
    globalIpWhitelistEnabled: false,
    globalAllowedIps: [],
  },
  personalHealth: { // Top-level default remains
    healthDir: undefined,
  },
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

// Function to parse units, defaulting to F for Fahrenheit
function parseUnits(envValue: string | undefined, defaultValue: "C" | "F"): "C" | "F" {
  if (envValue === undefined || envValue === '') return defaultValue;
  const upperValue = envValue.toUpperCase();
  if (upperValue === "C" || upperValue === "F") {
    return upperValue as "C" | "F";
  }
  // console.warn(`Invalid WEATHER_UNITS value: "${envValue}". Defaulting to "${defaultValue}".`); // Optional warning
  return defaultValue;
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
    units: parseUnits(getEnvVar('WEATHER_UNITS'), DEFAULT_CONFIG.weather?.units || "F"),
  };
  
  currentConfig.dailyReview = {
    scheduleCronExpression: parseString(getEnvVar('DAILY_REVIEW_SCHEDULE_CRON'), DEFAULT_CONFIG.dailyReview?.scheduleCronExpression || "30 6 * * *"),
  };

  currentConfig.captureApi = {
    enabled: parseBoolean(getEnvVar('PLUGIN_CAPTURE_API_ENABLED'), DEFAULT_CONFIG.captureApi?.enabled || false),
    port: parseNumber(getEnvVar('PLUGIN_CAPTURE_API_PORT'), DEFAULT_CONFIG.captureApi?.port || 3002),
    apiKey: parseNullableString(getEnvVar('PLUGIN_CAPTURE_API_KEY'), DEFAULT_CONFIG.captureApi?.apiKey || null),
    ipWhitelistEnabled: parseBoolean(getEnvVar('PLUGIN_CAPTURE_API_WHITELIST_ENABLED'), DEFAULT_CONFIG.captureApi?.ipWhitelistEnabled || false),
    allowedIps: (getEnvVar('PLUGIN_CAPTURE_API_ALLOWED_IPS')?.split(',').map(ip => ip.trim()).filter(ip => ip) || DEFAULT_CONFIG.captureApi?.allowedIps || []),
  };

  currentConfig.apiPlugin = {
    enabled: parseBoolean(getEnvVar('PLUGIN_API_ENABLED'), DEFAULT_CONFIG.apiPlugin?.enabled || false),
    port: parseNumber(getEnvVar('PLUGIN_API_PORT'), DEFAULT_CONFIG.apiPlugin?.port || 3000),
    apiKey: parseNullableString(getEnvVar('PLUGIN_API_KEY'), DEFAULT_CONFIG.apiPlugin?.apiKey || null),
    globalIpWhitelistEnabled: parseBoolean(getEnvVar('PLUGIN_API_GLOBAL_IP_WHITELIST_ENABLED'), DEFAULT_CONFIG.apiPlugin?.globalIpWhitelistEnabled || false),
    globalAllowedIps: (getEnvVar('PLUGIN_API_GLOBAL_ALLOWED_IPS')?.split(',').map(ip => ip.trim()).filter(ip => ip) || DEFAULT_CONFIG.apiPlugin?.globalAllowedIps || []),
  };

  currentConfig.tavily = {
    apiKey: getEnvVar('TAVILY_API_KEY') || DEFAULT_CONFIG.tavily?.apiKey || null,
  };

  currentConfig.plugins = {};
  try {
    const pluginFileNames = getPluginFileNames(); 
    pluginFileNames.forEach((fileName: string) => { // fileName is a directory name e.g. "timeManagement"
      const pluginName = fileName; // No need for path.basename if getPluginFileNames returns dir names
      const envVarName = 'PLUGIN_' + pluginName.toUpperCase() + '_ENABLED'; 
      // Default to false if the environment variable is not set or if not in DEFAULT_CONFIG.plugins
      const defaultEnabledState = (DEFAULT_CONFIG.plugins && DEFAULT_CONFIG.plugins[pluginName]) || false;
      currentConfig.plugins[pluginName] = parseBoolean(getEnvVar(envVarName), defaultEnabledState);
    });
  } catch (error) {
    // console.error('Error loading plugin configurations:', error);
    log(LogLevel.ERROR, 'Error processing plugin configurations in configLoader', { error });
  }

  const gtdBasePathEnv = getEnvVar('GTD_BASE_PATH');
  const gtdProjectsDirEnv = getEnvVar('GTD_PROJECTS_DIR');
  const gtdArchiveDirEnv = getEnvVar('GTD_ARCHIVE_DIR');
  const gtdInboxPathEnv = getEnvVar('GTD_INBOX_PATH');
  const gtdNextActionsPathEnv = getEnvVar('GTD_NEXT_ACTIONS_PATH');
  const gtdSomedayMaybePathEnv = getEnvVar('GTD_SOMEDAY_MAYBE_PATH');
  const gtdWaitingForPathEnv = getEnvVar('GTD_WAITING_FOR_PATH');

  currentConfig.gtd = {
    basePath: (gtdBasePathEnv && gtdBasePathEnv !== '') ? gtdBasePathEnv : DEFAULT_CONFIG.gtd?.basePath,
    projectsDir: (gtdProjectsDirEnv && gtdProjectsDirEnv !== '') ? gtdProjectsDirEnv : DEFAULT_CONFIG.gtd?.projectsDir,
    archiveDir: (gtdArchiveDirEnv && gtdArchiveDirEnv !== '') ? gtdArchiveDirEnv : DEFAULT_CONFIG.gtd?.archiveDir,
    inboxPath: (gtdInboxPathEnv && gtdInboxPathEnv !== '') ? gtdInboxPathEnv : DEFAULT_CONFIG.gtd?.inboxPath,
    nextActionsPath: (gtdNextActionsPathEnv && gtdNextActionsPathEnv !== '') ? gtdNextActionsPathEnv : DEFAULT_CONFIG.gtd?.nextActionsPath,
    somedayMaybePath: (gtdSomedayMaybePathEnv && gtdSomedayMaybePathEnv !== '') ? gtdSomedayMaybePathEnv : DEFAULT_CONFIG.gtd?.somedayMaybePath,
    waitingForPath: (gtdWaitingForPathEnv && gtdWaitingForPathEnv !== '') ? gtdWaitingForPathEnv : DEFAULT_CONFIG.gtd?.waitingForPath,
  };

  // For personalHealth section:
  const personalHealthDirFromEnv = getEnvVar('PERSONAL_HEALTH_DIR');
  let determinedPersonalHealthDir: string | undefined;
  if (personalHealthDirFromEnv && personalHealthDirFromEnv !== '') {
    determinedPersonalHealthDir = personalHealthDirFromEnv;
  } else {
    determinedPersonalHealthDir = DEFAULT_CONFIG.personalHealth?.healthDir;
  }
  currentConfig.personalHealth = {
    healthDir: determinedPersonalHealthDir
  };

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