import fs from 'fs';
import path from 'path';

export interface UCMConfig {
  enabled: boolean;
  extractorLlmPrompt: string | null;
}

export interface PluginsConfig {
  [pluginName: string]: boolean;
}

export interface AppConfig {
  ucm: UCMConfig;
  plugins: PluginsConfig;
}

const CONFIG_FILE_NAME = 'config.json';
const CONFIG_FILE_PATH = path.join(process.cwd(), CONFIG_FILE_NAME);

const DEFAULT_CONFIG: AppConfig = {
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
        ...DEFAULT_CONFIG,
        ...loadedConfig,
        ucm: {
          ...DEFAULT_CONFIG.ucm,
          ...(loadedConfig.ucm || {}),
        },
        plugins: {
          ...(loadedConfig.plugins || DEFAULT_CONFIG.plugins),
        },
      };

      console.log('Configuration loaded successfully.');
    } else {
      console.warn(`${CONFIG_FILE_NAME} not found. Using default configuration.`);
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log(`Created default ${CONFIG_FILE_NAME}. Please review and customize if needed.`);
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