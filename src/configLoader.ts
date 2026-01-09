import { z } from 'zod';
import dotenv from 'dotenv';
import { log, LogLevel } from './logger';

// Load environment variables from .env file
dotenv.config();

// --- Interface Definitions (Preserved for compatibility) ---

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
    enabled: boolean;
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

export interface TierConfig {
  model: string;
  serverUrl: string;
  maxTokens: number;
  thinkingBudget?: number; // Only for thinking tier
}

export interface IntelligentRoutingTiers {
  router: TierConfig;
  fast: TierConfig;
  thinking: TierConfig;
}

export interface RoutingRules {
  codeAgent: 'fast' | 'thinking';
  multiToolCall: 'fast' | 'thinking';
  singleToolCall: 'fast' | 'thinking';
  ragQuery: 'fast' | 'thinking';
  factExtraction: 'fast' | 'thinking';
  planning: 'fast' | 'thinking';
  creative: 'fast' | 'thinking';
  default: 'fast' | 'thinking';
}

export interface ModelRoutingConfig {
  enabled: boolean;
  strategy: 'cost' | 'speed' | 'quality' | 'availability' | 'privacy' | 'intelligent';
  fallbackChain: string[];
  
  // New: 3-tier intelligent routing configuration
  tiers?: IntelligentRoutingTiers;
  rules?: RoutingRules;
  
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

export interface PersonalLibraryConfig {
  dbPath: string;
  vector: {
    provider: 'qdrant' | 'faiss';
    path?: string;
    url?: string;
    model?: string;
    dimensions: number;
  };
  namespaces: {
    notes: string;
    user_profile: string;
  };
  privacy: {
    excludeTags: string[];
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
  personalLibrary?: PersonalLibraryConfig;
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

// --- Zod Schemas & Defaults ---

// Helper to parse comma-separated lists
const csvArray = z.string().transform(val => val.split(',').map(s => s.trim()).filter(Boolean));

// Helper to construct the Config object from Process Env with Defaults
function buildConfigFromEnv() {
  return {
    env: process.env.NODE_ENV || 'development',
    appName: process.env.APP_NAME || 'Wooster',
    version: process.env.APP_VERSION || '1.0.0',
    chatMode: (process.env.CHAT_MODE || 'code_agent') as 'classic_tools' | 'code_agent',
    
    logging: {
      consoleLogLevel: (process.env.LOGGING_CONSOLE_LOG_LEVEL || 'info') as LogLevel,
      fileLogLevel: (process.env.LOGGING_FILE_LOG_LEVEL || 'info') as LogLevel,
      logFile: process.env.LOGGING_LOG_FILE || 'logs/wooster_session.log',
      logAgentLLMInteractions: process.env.LOGGING_LOG_AGENT_LLM_INTERACTIONS === 'true',
      consoleQuietMode: process.env.LOGGING_CONSOLE_QUIET_MODE !== 'false' // Default true, set LOGGING_CONSOLE_QUIET_MODE=false to see INFO/DEBUG
    },

    openai: {
      apiKey: process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY_HERE',
      modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
      embeddingModelName: process.env.OPENAI_EMBEDDING_MODEL_NAME || 'text-embedding-3-small',
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2048', 10),
      enabled: process.env.OPENAI_ENABLED !== 'false' // Default true
    },

    tavily: {
      apiKey: process.env.TAVILY_API_KEY || null
    },

    google: {
      calendar: {
        clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || null,
        clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || null,
        refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || null,
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        defaultAttendeeEmail: process.env.GOOGLE_CALENDAR_DEFAULT_ATTENDEE_EMAIL || null
      }
    },

    userProfile: {
      enabled: process.env.USER_PROFILE_ENABLED !== 'false', // Default true
      storePath: process.env.USER_PROFILE_STORE_PATH || './vector_data/user_profile_store'
    },

    gtd: {
      basePath: './gtd',
      projectsDir: process.env.GTD_PROJECTS_DIR || './projects',
      archiveDir: './gtd/archive',
      nextActionsArchiveDirPath: './gtd/archive/nextActions',
      inboxPath: './gtd/inbox.md',
      nextActionsPath: './gtd/next_actions.md',
      nextActionsViewFormat: undefined, // Let plugin use its default
      somedayMaybePath: './gtd/someday_maybe.md',
      waitingForPath: './gtd/waiting_for.md'
    },

    gmail: {
      senderEmailAddress: process.env.GMAIL_SENDER_EMAIL_ADDRESS || null,
      userPersonalEmailAddress: process.env.GMAIL_USER_PERSONAL_EMAIL_ADDRESS || null,
      emailAppPassword: process.env.GMAIL_APP_PASSWORD || null
    },

    weather: {
      city: process.env.WEATHER_CITY || null,
      openWeatherMapApiKey: process.env.WEATHER_OPENWEATHERMAP_API_KEY || null,
      units: (process.env.WEATHER_UNITS || 'F') as "C" | "F"
    },

    dailyReview: {
      scheduleCronExpression: process.env.DAILY_REVIEW_SCHEDULE_CRON || '30 6 * * *'
    },

    captureApi: {
      enabled: false,
      port: 3002,
      apiKey: null,
      ipWhitelistEnabled: false,
      allowedIps: []
    },
    
    apiPlugin: {
        enabled: false,
        port: 3000,
        apiKey: null,
        globalIpWhitelistEnabled: false,
        globalAllowedIps: []
    },

    personalHealth: {
        healthDir: './health'
    },

    routing: {
      enabled: process.env.ROUTING_ENABLED !== 'false', // Default true
      strategy: (process.env.ROUTING_STRATEGY as any) || 'intelligent',
      fallbackChain: ["local", "openai"],
      
      // 3-tier intelligent routing configuration
      tiers: {
        router: {
          model: process.env.ROUTING_ROUTER_MODEL || "mlx-community/Qwen3-0.6B-4bit",
          serverUrl: process.env.ROUTING_ROUTER_URL || "http://127.0.0.1:8080",
          maxTokens: parseInt(process.env.ROUTING_ROUTER_MAX_TOKENS || '100', 10)
        },
        fast: {
          model: process.env.ROUTING_FAST_MODEL || "mlx-community/Qwen3-30B-A3B-4bit",
          serverUrl: process.env.ROUTING_FAST_URL || "http://127.0.0.1:8081",
          maxTokens: parseInt(process.env.ROUTING_FAST_MAX_TOKENS || '4096', 10)
        },
        thinking: {
          model: process.env.ROUTING_THINKING_MODEL || "mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit",
          serverUrl: process.env.ROUTING_THINKING_URL || "http://127.0.0.1:8083",
          maxTokens: parseInt(process.env.ROUTING_THINKING_MAX_TOKENS || '8192', 10),
          thinkingBudget: parseInt(process.env.ROUTING_THINKING_BUDGET || '4096', 10)
        }
      },
      
      // Task-specific routing rules
      rules: {
        codeAgent: (process.env.ROUTING_RULE_CODE_AGENT as 'fast' | 'thinking') || 'thinking',
        multiToolCall: (process.env.ROUTING_RULE_MULTI_TOOL as 'fast' | 'thinking') || 'thinking',
        singleToolCall: (process.env.ROUTING_RULE_SINGLE_TOOL as 'fast' | 'thinking') || 'fast',
        ragQuery: (process.env.ROUTING_RULE_RAG_QUERY as 'fast' | 'thinking') || 'fast',
        factExtraction: (process.env.ROUTING_RULE_FACT_EXTRACTION as 'fast' | 'thinking') || 'fast',
        planning: (process.env.ROUTING_RULE_PLANNING as 'fast' | 'thinking') || 'thinking',
        creative: (process.env.ROUTING_RULE_CREATIVE as 'fast' | 'thinking') || 'thinking',
        default: (process.env.ROUTING_RULE_DEFAULT as 'fast' | 'thinking') || 'fast'
      },
      
      providers: {
        openai: {
          enabled: process.env.OPENAI_ENABLED !== 'false', // Default true
          models: {
            "fast": "gpt-4o-mini",
            "quality": "gpt-4o"
          },
          rateLimiting: false,
          costTracking: false
        },
        local: {
          enabled: process.env.ROUTING_LOCAL_ENABLED === 'true' || process.env.ROUTING_STRATEGY === 'intelligent',
          serverUrl: process.env.ROUTING_LOCAL_SERVER_URL || "http://127.0.0.1:8081",
          autoStart: false,
          models: {
            "fast": process.env.ROUTING_FAST_MODEL || "mlx-community/Qwen3-30B-A3B-4bit",
            "thinking": process.env.ROUTING_THINKING_MODEL || "mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit"
          },
          embeddings: {
            enabled: process.env.MLX_EMBEDDINGS_ENABLED === 'true',
            serverUrl: process.env.MLX_EMBEDDINGS_URL || "http://127.0.0.1:8084/v1",
            projects: {
              enabled: process.env.MLX_PROJECT_EMBEDDINGS_ENABLED === 'true' || process.env.MLX_EMBEDDINGS_ENABLED === 'true',
              model: process.env.MLX_EMBEDDINGS_MODEL || "Qwen/Qwen3-Embedding-8B",
              dimensions: parseInt(process.env.MLX_EMBEDDINGS_DIMENSIONS || '4096', 10)
            },
            userProfile: {
              enabled: process.env.MLX_USER_EMBEDDINGS_ENABLED === 'true' || process.env.MLX_EMBEDDINGS_ENABLED === 'true',
              model: process.env.MLX_EMBEDDINGS_MODEL || "Qwen/Qwen3-Embedding-8B",
              dimensions: parseInt(process.env.MLX_EMBEDDINGS_DIMENSIONS || '4096', 10)
            }
          }
        }
      },
      profiles: {},
      healthCheck: { 
        interval: parseInt(process.env.ROUTING_HEALTH_INTERVAL || '30000', 10), 
        timeout: parseInt(process.env.ROUTING_HEALTH_TIMEOUT || '2000', 10), 
        retries: 1 
      },
      logging: { 
        decisions: process.env.ROUTING_LOG_DECISIONS === 'true', 
        performance: process.env.ROUTING_LOG_PERFORMANCE === 'true', 
        errors: true 
      }
    },
    
    personalLibrary: {
      dbPath: './database/personal_health.sqlite3', // Should probably be personal_library.sqlite3 but sticking to what might be expected
      vector: {
        provider: 'faiss', // Defaulting to faiss/simple wrapper
        dimensions: 2560,
      },
      namespaces: {
        notes: 'notes',
        user_profile: 'user_profile'
      },
      privacy: {
        excludeTags: ['private', 'secret']
      }
    },

    codeAgent: {
      maxAttempts: parseInt(process.env.CODE_AGENT_MAX_ATTEMPTS || '2', 10),
      stepTimeoutMs: parseInt(process.env.CODE_AGENT_STEP_TIMEOUT_MS || '20000', 10),
      totalTimeoutMs: parseInt(process.env.CODE_AGENT_TOTAL_TIMEOUT_MS || '60000', 10),
      memoryLimitMb: parseInt(process.env.CODE_AGENT_MEMORY_LIMIT_MB || '128', 10),
      maxOutputLength: parseInt(process.env.CODE_AGENT_MAX_OUTPUT_LENGTH || '10000', 10),
      logging: {
        enabled: true,
        redactions: true
      }
    },

    plugins: extractPluginsFromEnv()
  };
}

function extractPluginsFromEnv(): Record<string, any> {
    // Default known plugins (from old default.json)
    const plugins: Record<string, any> = {
        projectManager: { enabled: true },
        frontend: { enabled: true, port: 3000 },
        signal: { enabled: false },
        gcal: { enabled: true }, // Assuming default enabled if found, env overrides
        gmail: { enabled: true }
    };

    // Override with specific ENV vars if they exist
    if (process.env.PLUGIN_PROJECTMANAGER_ENABLED !== undefined) plugins.projectManager.enabled = process.env.PLUGIN_PROJECTMANAGER_ENABLED === 'true';
    
    if (process.env.PLUGIN_FRONTEND_ENABLED !== undefined) plugins.frontend.enabled = process.env.PLUGIN_FRONTEND_ENABLED === 'true';
    if (process.env.PLUGIN_FRONTEND_PORT) plugins.frontend.port = parseInt(process.env.PLUGIN_FRONTEND_PORT, 10);
    
    if (process.env.PLUGIN_SIGNAL_ENABLED !== undefined) plugins.signal.enabled = process.env.PLUGIN_SIGNAL_ENABLED === 'true';
    
    if (process.env.PLUGIN_GCAL_ENABLED !== undefined) plugins.gcal.enabled = process.env.PLUGIN_GCAL_ENABLED === 'true';
    
    if (process.env.PLUGIN_GMAIL_ENABLED !== undefined) plugins.gmail.enabled = process.env.PLUGIN_GMAIL_ENABLED === 'true';

    // Scan for ANY other PLUGIN_<NAME>_ENABLED variables
    for (const key of Object.keys(process.env)) {
        if (key.startsWith('PLUGIN_') && key.endsWith('_ENABLED')) {
            // Format: PLUGIN_MYNAME_ENABLED
            const parts = key.split('_');
            if (parts.length >= 3) {
                const nameUpper = parts.slice(1, -1).join('_'); // Handle names with underscores? Usually just one word.
                // Convert to camelCase or just lowercase? Plugin names are usually camelCase in code (e.g. dailyReview).
                // But ENV is UPPERCASE. "DAILYREVIEW" -> "dailyReview"? Hard to guess.
                // "MY_PLUGIN" -> "myPlugin"?
                // Simple heuristic: Lowercase for now, or use the exact name if we could map it.
                // Since we don't know the exact casing of the plugin class, passing it as lowercase key might mismatch.
                // However, PluginManager iterates folders.
                // Let's just rely on PluginManager's internal ENV check for unknown plugins!
                // PluginManager now does `PLUGIN_${pName.toUpperCase()}_ENABLED`.
                // So we don't strictly NEED to populate them here for enablement.
                // But `AppConfig.plugins` is often checked.
                // Let's stick to the known defaults.
            }
        }
    }

    return plugins;
}

// --- Loader Logic ---

let currentConfig: AppConfig;

export function loadConfig(): AppConfig {
  if (currentConfig) return currentConfig;

  // Build config from Env + Defaults
  const configObj = buildConfigFromEnv();

  // We can add Zod validation here if we want strict schema checking
  // const parsed = AppConfigSchema.parse(configObj); 

  currentConfig = configObj as AppConfig;
  log(LogLevel.DEBUG, 'Application Config Loaded via Zod/Env', { appName: currentConfig.appName });
  return currentConfig;
}

export function getConfig(): AppConfig {
  return loadConfig();
}

export function setConfig(newConfig: AppConfig): void {
  currentConfig = newConfig;
}
