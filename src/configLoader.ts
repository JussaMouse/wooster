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

export interface OpenAIConfig {
    apiKey: string;
    modelName: string;
    embeddingModelName: string;
    temperature: number;
    maxTokens: number;
}

export interface TavilyConfig {
    apiKey: string | null;
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

export interface UserProfileConfig {
    enabled: boolean;
    storePath?: string;
}

export interface GtdConfig {
  projectsDir?: string;
  basePath?: string;
  archiveDir?: string;
  nextActionsArchiveDirPath?: string;
  inboxPath?: string;
  nextActionsPath?: string;
  nextActionsViewFormat?: string;
  somedayMaybePath?: string;
  waitingForPath?: string;
}

export interface GmailConfig {
  senderEmailAddress: string | null;
  userPersonalEmailAddress: string | null;
  emailAppPassword: string | null;
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

export interface PersonalHealthConfig {
    healthDir?: string;
}

export interface ModelRoutingConfig {
  enabled: boolean;
  strategy: 'cost' | 'speed' | 'quality' | 'availability' | 'privacy';
  fallbackChain: string[];
  providers: {
    openai: {
      enabled: boolean;
      models: Record<string, string>;
      rateLimiting: boolean;
      costTracking: boolean;
      maxRequestsPerMinute?: number;
    };
    local: {
      enabled: boolean;
      serverUrl: string;
      autoStart: boolean;
      models: Record<string, string>;
      modelsDir?: string;
      healthCheckInterval?: number;
      embeddings?: {
        enabled: boolean;
        serverUrl: string;
        projects?: {
          enabled: boolean;
          model: string;
          dimensions: number;
        };
        userProfile?: {
          enabled: boolean;
          model: string;
          dimensions: number;
        };
      };
    };
    anthropic?: {
      enabled: boolean;
      models: Record<string, string>;
      rateLimiting: boolean;
    };
  };
  profiles: Record<string, any>;
  healthCheck: {
    interval: number;
    timeout: number;
    retries: number;
  };
  logging: {
    decisions: boolean;
    performance: boolean;
    errors: boolean;
  };
}

export interface AppConfig {
  env: string;
  appName: string;
  version: string;
  // chatMode is deprecated; retained for backward compatibility in config files.
  chatMode?: 'classic_tools' | 'code_agent';
  logging: LoggingConfig;
  openai: OpenAIConfig;
  tavily: TavilyConfig;
  google?: GoogleConfig;
  userProfile: UserProfileConfig;
  gtd?: GtdConfig;
  gmail?: GmailConfig;
  weather?: WeatherConfig;
  dailyReview?: DailyReviewConfig;
  captureApi?: CaptureApiConfig;
  apiPlugin?: ApiPluginConfig;
  personalHealth?: PersonalHealthConfig;
  routing?: ModelRoutingConfig;
  codeAgent: {
    maxAttempts: number;
    stepTimeoutMs: number;
    totalTimeoutMs: number;
    memoryLimitMb: number;
    maxOutputLength: number;
    logging: {
      enabled: boolean;
      redactions: boolean;
    };
  };
  plugins: {
    [key: string]: any;
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

  // Fix: Ensure temperature is a number (environment variables come as strings)
  if (typeof loadedConfig.openai.temperature === 'string') {
    loadedConfig.openai.temperature = parseFloat(loadedConfig.openai.temperature);
  }
  if (typeof loadedConfig.openai.maxTokens === 'string') {
    loadedConfig.openai.maxTokens = parseInt(loadedConfig.openai.maxTokens, 10);
  }

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

/**
 * Sets the application configuration in memory.
 * @param newConfig The new configuration object to set.
 */
export function setConfig(newConfig: AppConfig): void {
  currentConfig = newConfig;
}