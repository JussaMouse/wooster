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
  nextActionsArchiveDirPath?: string;
  inboxPath?: string;
  nextActionsPath?: string;
  nextActionsViewFormat?: string;
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
  plugins: Record<string, any>;
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
  storePath?: string;
}

export interface GoogleConfig {
  calendar?: {
    clientId: string | null;
    clientSecret: string | null;
    refreshToken: string | null;
    calendarId: string;
    defaultAttendeeEmail?: string | null;
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
      defaultAttendeeEmail: null,
    }
  },
  userProfile: {
    enabled: false,
    storePath: undefined,
  },
  plugins: {
    // Note: Default plugin enablement can be set here if needed,
    // but it's often better handled by the default.json to keep this file clean.
    // Example: projectManager: true
  },
  projects: {}, // Kept simple
  gtd: {
    basePath: undefined,
    projectsDir: undefined,
    archiveDir: undefined,
    nextActionsArchiveDirPath: undefined,
    inboxPath: undefined,
    nextActionsPath: undefined,
    nextActionsViewFormat: undefined,
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
  const loadedConfig: AppConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep copy

  // Populate from environment variables
  loadedConfig.env = getEnvVar('NODE_ENV') || DEFAULT_CONFIG.env;
  loadedConfig.appName = getEnvVar('APP_NAME') || DEFAULT_CONFIG.appName;
  loadedConfig.version = getEnvVar('APP_VERSION') || DEFAULT_CONFIG.version;

  // Logging configuration
  loadedConfig.logging.consoleLogLevel = parseLogLevel(getEnvVar('LOGGING_CONSOLE_LOG_LEVEL'), DEFAULT_CONFIG.logging.consoleLogLevel);
  loadedConfig.logging.fileLogLevel = parseLogLevel(getEnvVar('LOGGING_FILE_LOG_LEVEL'), DEFAULT_CONFIG.logging.fileLogLevel);
  loadedConfig.logging.logFile = parseString(getEnvVar('LOGGING_LOG_FILE'), DEFAULT_CONFIG.logging.logFile);
  loadedConfig.logging.logAgentLLMInteractions = parseBoolean(getEnvVar('LOGGING_LOG_AGENT_LLM_INTERACTIONS'), DEFAULT_CONFIG.logging.logAgentLLMInteractions);
  loadedConfig.logging.consoleQuietMode = parseBoolean(getEnvVar('LOGGING_CONSOLE_QUIET_MODE'), DEFAULT_CONFIG.logging.consoleQuietMode);
  
  // OpenAI configuration
  loadedConfig.openai.apiKey = getEnvVar('OPENAI_API_KEY') || DEFAULT_CONFIG.openai.apiKey;
  loadedConfig.openai.modelName = getEnvVar('OPENAI_MODEL_NAME') || DEFAULT_CONFIG.openai.modelName;
  loadedConfig.openai.embeddingModelName = getEnvVar('OPENAI_EMBEDDING_MODEL_NAME') || DEFAULT_CONFIG.openai.embeddingModelName;
  loadedConfig.openai.temperature = parseNumber(getEnvVar('OPENAI_TEMPERATURE'), DEFAULT_CONFIG.openai.temperature);
  loadedConfig.openai.maxTokens = parseNumber(getEnvVar('OPENAI_MAX_TOKENS'), DEFAULT_CONFIG.openai.maxTokens);

  // Tavily configuration
  loadedConfig.tavily.apiKey = parseNullableString(getEnvVar('TAVILY_API_KEY'), DEFAULT_CONFIG.tavily.apiKey);

  // Google Calendar configuration
  if (loadedConfig.google?.calendar) { // Ensure google.calendar object exists
    loadedConfig.google.calendar.clientId = parseNullableString(getEnvVar('GOOGLE_CALENDAR_CLIENT_ID'), DEFAULT_CONFIG.google?.calendar?.clientId ?? null);
    loadedConfig.google.calendar.clientSecret = parseNullableString(getEnvVar('GOOGLE_CALENDAR_CLIENT_SECRET'), DEFAULT_CONFIG.google?.calendar?.clientSecret ?? null);
    loadedConfig.google.calendar.refreshToken = parseNullableString(getEnvVar('GOOGLE_CALENDAR_REFRESH_TOKEN'), DEFAULT_CONFIG.google?.calendar?.refreshToken ?? null);
    loadedConfig.google.calendar.calendarId = parseString(getEnvVar('GOOGLE_CALENDAR_ID'), DEFAULT_CONFIG.google?.calendar?.calendarId ?? 'primary');
    loadedConfig.google.calendar.defaultAttendeeEmail = parseNullableString(getEnvVar('GOOGLE_CALENDAR_DEFAULT_ATTENDEE_EMAIL'), DEFAULT_CONFIG.google?.calendar?.defaultAttendeeEmail ?? null);
  }

  // UserProfile configuration
  loadedConfig.userProfile.enabled = parseBoolean(getEnvVar('USER_PROFILE_ENABLED'), DEFAULT_CONFIG.userProfile.enabled);
  loadedConfig.userProfile.storePath = getEnvVar('USER_PROFILE_STORE_PATH') || DEFAULT_CONFIG.userProfile.storePath || path.join(process.cwd(), 'vector_data', 'user_profile_store');

  // GTD configuration
  if (loadedConfig.gtd) {
    loadedConfig.gtd.basePath = getEnvVar('GTD_BASE_PATH') || DEFAULT_CONFIG.gtd?.basePath;
    loadedConfig.gtd.projectsDir = getEnvVar('GTD_PROJECTS_DIR') || DEFAULT_CONFIG.gtd?.projectsDir;
    loadedConfig.gtd.archiveDir = getEnvVar('GTD_ARCHIVE_DIR') || DEFAULT_CONFIG.gtd?.archiveDir;
    loadedConfig.gtd.nextActionsArchiveDirPath = getEnvVar('GTD_NEXT_ACTIONS_ARCHIVE_DIR_PATH') || DEFAULT_CONFIG.gtd?.nextActionsArchiveDirPath;
    loadedConfig.gtd.inboxPath = getEnvVar('GTD_INBOX_PATH') || DEFAULT_CONFIG.gtd?.inboxPath;
    loadedConfig.gtd.nextActionsPath = getEnvVar('GTD_NEXT_ACTIONS_PATH') || DEFAULT_CONFIG.gtd?.nextActionsPath;
    loadedConfig.gtd.nextActionsViewFormat = getEnvVar('GTD_NEXT_ACTIONS_VIEW_FORMAT') || DEFAULT_CONFIG.gtd?.nextActionsViewFormat;
    loadedConfig.gtd.somedayMaybePath = getEnvVar('GTD_SOMEDAY_MAYBE_PATH') || DEFAULT_CONFIG.gtd?.somedayMaybePath;
    loadedConfig.gtd.waitingForPath = getEnvVar('GTD_WAITING_FOR_PATH') || DEFAULT_CONFIG.gtd?.waitingForPath;
  }

  // Gmail configuration
  if (loadedConfig.gmail) {
    loadedConfig.gmail.senderEmailAddress = parseNullableString(getEnvVar('GMAIL_SENDER_EMAIL_ADDRESS'), DEFAULT_CONFIG.gmail?.senderEmailAddress ?? null);
    loadedConfig.gmail.userPersonalEmailAddress = parseNullableString(getEnvVar('GMAIL_USER_PERSONAL_EMAIL_ADDRESS'), DEFAULT_CONFIG.gmail?.userPersonalEmailAddress ?? null);
    loadedConfig.gmail.emailAppPassword = parseNullableString(getEnvVar('GMAIL_APP_PASSWORD'), DEFAULT_CONFIG.gmail?.emailAppPassword ?? null);
  }
  
  // Weather configuration
  if (loadedConfig.weather) {
    loadedConfig.weather.city = parseNullableString(getEnvVar('WEATHER_CITY'), DEFAULT_CONFIG.weather?.city ?? null);
    loadedConfig.weather.openWeatherMapApiKey = parseNullableString(getEnvVar('WEATHER_OPENWEATHERMAP_API_KEY'), DEFAULT_CONFIG.weather?.openWeatherMapApiKey ?? null);
    loadedConfig.weather.units = parseUnits(getEnvVar('WEATHER_UNITS'), DEFAULT_CONFIG.weather?.units ?? 'F');
  }

  // DailyReview configuration
  if (loadedConfig.dailyReview) {
    loadedConfig.dailyReview.scheduleCronExpression = parseString(getEnvVar('DAILY_REVIEW_SCHEDULE_CRON_EXPRESSION'), DEFAULT_CONFIG.dailyReview?.scheduleCronExpression ?? '30 6 * * *');
  }

  // CaptureAPI configuration
  if (loadedConfig.captureApi) {
    loadedConfig.captureApi.enabled = parseBoolean(getEnvVar('CAPTURE_API_ENABLED'), DEFAULT_CONFIG.captureApi?.enabled ?? false);
    loadedConfig.captureApi.port = parseNumber(getEnvVar('CAPTURE_API_PORT'), DEFAULT_CONFIG.captureApi?.port ?? 3002);
    loadedConfig.captureApi.apiKey = parseNullableString(getEnvVar('CAPTURE_API_KEY'), DEFAULT_CONFIG.captureApi?.apiKey ?? null);
    loadedConfig.captureApi.ipWhitelistEnabled = parseBoolean(getEnvVar('CAPTURE_API_IP_WHITELIST_ENABLED'), DEFAULT_CONFIG.captureApi?.ipWhitelistEnabled ?? false);
    loadedConfig.captureApi.allowedIps = (getEnvVar('CAPTURE_API_ALLOWED_IPS')?.split(',') ?? DEFAULT_CONFIG.captureApi?.allowedIps) || [];
  }

  // ApiPlugin configuration
  if (loadedConfig.apiPlugin) {
    loadedConfig.apiPlugin.enabled = parseBoolean(getEnvVar('API_PLUGIN_ENABLED'), DEFAULT_CONFIG.apiPlugin?.enabled ?? false);
    loadedConfig.apiPlugin.port = parseNumber(getEnvVar('API_PLUGIN_PORT'), DEFAULT_CONFIG.apiPlugin?.port ?? 3000);
    loadedConfig.apiPlugin.apiKey = parseNullableString(getEnvVar('API_PLUGIN_API_KEY'), DEFAULT_CONFIG.apiPlugin?.apiKey ?? null);
    loadedConfig.apiPlugin.globalIpWhitelistEnabled = parseBoolean(getEnvVar('API_PLUGIN_GLOBAL_IP_WHITELIST_ENABLED'), DEFAULT_CONFIG.apiPlugin?.globalIpWhitelistEnabled ?? false);
    loadedConfig.apiPlugin.globalAllowedIps = (getEnvVar('API_PLUGIN_GLOBAL_ALLOWED_IPS')?.split(',') ?? DEFAULT_CONFIG.apiPlugin?.globalAllowedIps) || [];
  }

  // PersonalHealth configuration
  if (loadedConfig.personalHealth) {
    loadedConfig.personalHealth.healthDir = getEnvVar('PERSONAL_HEALTH_DIR') || DEFAULT_CONFIG.personalHealth?.healthDir;
  }
  
  // Dynamically load plugin enablement status
  const pluginFiles = getPluginFileNames();
  pluginFiles.forEach(pluginName => {
    // Default to false if not specified in DEFAULT_CONFIG.plugins
    const defaultStatus = DEFAULT_CONFIG.plugins[pluginName] === undefined ? false : DEFAULT_CONFIG.plugins[pluginName];
    // Environment variable takes precedence, e.g., PLUGIN_MyPlugin_ENABLED=true
    loadedConfig.plugins[pluginName] = parseBoolean(getEnvVar(`PLUGIN_${pluginName.toUpperCase()}_ENABLED`), defaultStatus);
  });

  currentConfig = loadedConfig;
  log(LogLevel.DEBUG, 'Application Config:', { appConfig: currentConfig });
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