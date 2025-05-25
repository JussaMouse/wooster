import fs from 'fs';
import path from 'path';

// Keep LogLevel here as it's fundamental to logging config
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface OpenAIConfig {
  apiKey: string;
  modelName: string;
}

export interface LoggingConfig {
  consoleLogLevel: LogLevel;
  fileLogLevel: LogLevel;
  logFile: string | null; // Null means file logging is disabled
  logAgentLLMInteractions: boolean;
}

export interface EmailConfig {
  enabled: boolean;
  sendingEmailAddress: string | null;
  userPersonalEmailAddress: string | null;
  emailAppPassword: string | null; // For Gmail App Passwords
  // Add other email provider settings as needed (e.g., SMTP host, port, user, pass for generic SMTP)
  // For Gmail OAuth (more complex setup, usually involves token management)
  // gmailClientId: string | null;
  // gmailClientSecret: string | null;
  // gmailRefreshToken: string | null;
}

export interface UCMConfig {
  enabled: boolean;
  extractorLlmPrompt: string | null;
}

export interface PluginsConfig {
  [pluginName: string]: boolean;
}

export interface AppConfig {
  openai: OpenAIConfig;
  logging: LoggingConfig;
  email: EmailConfig;
  ucm: UCMConfig;
  plugins: PluginsConfig;
}

const CONFIG_FILE_NAME = 'config.json';
const CONFIG_FILE_PATH = path.join(process.cwd(), CONFIG_FILE_NAME);

const DEFAULT_CONFIG: AppConfig = {
  openai: {
    apiKey: 'YOUR_OPENAI_API_KEY_HERE', // User MUST change this
    modelName: 'gpt-4o-mini',
  },
  logging: {
    consoleLogLevel: LogLevel.INFO,
    fileLogLevel: LogLevel.INFO,
    logFile: 'wooster_session.log', // Default log file name
    logAgentLLMInteractions: false,
  },
  email: {
    enabled: false,
    sendingEmailAddress: null,
    userPersonalEmailAddress: null,
    emailAppPassword: null,
    // gmailClientId: null,
    // gmailClientSecret: null,
    // gmailRefreshToken: null,
  },
  ucm: {
    enabled: false,
    extractorLlmPrompt: null,
  },
  plugins: {},
};

let currentConfig: AppConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

export function loadConfig(): void {
  console.log(`Attempting to load configuration from: ${CONFIG_FILE_PATH}`);
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const loadedConfig = JSON.parse(fileContent) as Partial<AppConfig>;
      
      currentConfig = {
        openai: {
          ...DEFAULT_CONFIG.openai,
          ...(loadedConfig.openai || {}),
        },
        logging: {
          ...DEFAULT_CONFIG.logging,
          ...(loadedConfig.logging || {}),
        },
        email: {
          ...DEFAULT_CONFIG.email,
          ...(loadedConfig.email || {}),
        },
        ucm: {
          ...DEFAULT_CONFIG.ucm,
          ...(loadedConfig.ucm || {}),
        },
        plugins: {
          ...DEFAULT_CONFIG.plugins,
          ...(loadedConfig.plugins || {}),
        },
      };

      console.log('Configuration loaded successfully.');
    } else {
      console.warn(`${CONFIG_FILE_NAME} not found. Using default configuration.`);
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log(`Created default ${CONFIG_FILE_NAME}. Please review and customize, especially 'openai.apiKey'.`);
      currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
  } catch (error) {
    console.error(`Error loading or parsing ${CONFIG_FILE_NAME}:`, error);
    console.warn('Using default configuration due to error.');
    currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

export function getConfig(): AppConfig {
  return currentConfig;
} 