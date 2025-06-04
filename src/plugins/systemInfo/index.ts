import { WoosterPlugin, AppConfig, CoreServices } from '../../types/plugin';
import { DynamicTool } from 'langchain/tools';
import { LogLevel } from '../../logger';
import * as fs from 'fs';
import * as path from 'path';

interface PluginStatusInfo {
  name: string;
  configuredStatus: string;
  loadStatus: string;
  version?: string;
  description?: string;
  path?: string;
  error?: string;
}

export class SystemInfoPlugin implements WoosterPlugin {
  static readonly pluginName = 'systemInfo';
  static readonly version = '0.1.0';
  static readonly description = 'Provides system information tools, like listing plugin statuses.';

  readonly name = SystemInfoPlugin.pluginName;
  readonly version = SystemInfoPlugin.version;
  readonly description = SystemInfoPlugin.description;

  private config!: AppConfig;
  private services!: CoreServices;

  private logMsg(level: LogLevel, message: string, details?: object) {
    const fullMessage = `[${SystemInfoPlugin.pluginName} Plugin v${SystemInfoPlugin.version}] ${message}`;
    if (this.services && this.services.log) {
      this.services.log(level, fullMessage, details);
    } else {
      console.log(`[${level.toUpperCase()}] ${fullMessage}`, details || '');
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.config = config;
    this.services = services;
    this.logMsg(LogLevel.INFO, 'Initializing...');
    // In a real scenario, ensure services.getApplicationRootDir() or similar exists
    // For now, we will construct paths assuming a standard project structure.
    this.logMsg(LogLevel.INFO, 'Initialized successfully.');
  }

  getAgentTools?(): DynamicTool[] {
    const listPluginsStatusTool = new DynamicTool({
      name: 'listPluginsStatus',
      description: 'Lists all installed plugins, their configured enabled/disabled status, and their load status.',
      func: async () => {
        this.logMsg(LogLevel.INFO, 'listPluginsStatus tool called.');
        const pluginStatusList: PluginStatusInfo[] = [];

        // Determine the plugins directory - assumes this plugin is in src/plugins/systemInfo
        // So, ../../dist/plugins would be the target if running from source, or similar for dist.
        // For robustness, this path should ideally come from CoreServices or be more reliably determined.
        // Let's assume the compiled plugin will be in dist/plugins/systemInfo/index.js
        // So, the root of all compiled plugins is path.resolve(__dirname, '..')
        const pluginsDistPath = path.resolve(__dirname, '..');
        this.logMsg(LogLevel.DEBUG, `Scanning for plugins in: ${pluginsDistPath}`);

        let installedPluginDirs: string[];
        try {
          installedPluginDirs = fs.readdirSync(pluginsDistPath).filter(name => {
            try {
              return fs.statSync(path.join(pluginsDistPath, name)).isDirectory();
            } catch (statErr) {
              return false; // Not a directory or inaccessible
            }
          });
        } catch (err: any) {
          this.logMsg(LogLevel.ERROR, `Error reading plugins directory at ${pluginsDistPath}: ${err.message}`);
          return `Error: Could not list plugin directories. Path: ${pluginsDistPath}`;
        }

        for (const pluginDirName of installedPluginDirs) {
          if (pluginDirName === this.name) continue; // Skip self

          const pluginInfo: PluginStatusInfo = {
            name: pluginDirName,
            configuredStatus: 'Unknown',
            loadStatus: 'Not Attempted',
            path: path.join(pluginsDistPath, pluginDirName),
          };

          const isEnabledInConfig = this.config.plugins[pluginDirName] === true;
          pluginInfo.configuredStatus = isEnabledInConfig ? 'Enabled in config' : 'Disabled in config (or not specified)';

          if (isEnabledInConfig) {
            try {
              const pluginModulePath = path.join(pluginsDistPath, pluginDirName, 'index.js');
              if (!fs.existsSync(pluginModulePath)) {
                pluginInfo.loadStatus = 'Failed to Load (index.js missing)';
                pluginInfo.error = `File not found: ${pluginModulePath}`;
                this.logMsg(LogLevel.WARN, `Plugin ${pluginDirName}: index.js missing at ${pluginModulePath}`);
              } else {
                // Dynamic import needs a file URL or an absolute path that the runtime can resolve.
                // For CommonJS, require might be more straightforward if __dirname is reliable.
                // For ESM, import() with file:// protocol or ensuring the path is absolute and correct.
                // Let's try with require for simplicity assuming CommonJS output for plugins.
                const pluginModule = require(pluginModulePath);

                if (pluginModule && pluginModule.default && typeof pluginModule.default === 'function') {
                  const PluginClass = pluginModule.default;
                  pluginInfo.version = PluginClass.version || 'N/A';
                  pluginInfo.description = PluginClass.description || 'N/A';
                  // Use pluginName from class if available, otherwise stick to dir name
                  pluginInfo.name = PluginClass.pluginName || PluginClass.name || pluginDirName;
                  pluginInfo.loadStatus = 'Loaded Successfully';
                } else {
                  pluginInfo.loadStatus = 'Failed to Load (Invalid structure or no default export)';
                  pluginInfo.error = 'Module loaded but not a valid plugin class structure.';
                }
              }
            } catch (err: any) {
              this.logMsg(LogLevel.ERROR, `Error dynamically loading plugin ${pluginDirName}: ${err.message}`, { stack: err.stack });
              pluginInfo.loadStatus = 'Failed to Load (Error during import)';
              pluginInfo.error = err.message;
            }
          } else {
            pluginInfo.loadStatus = 'Not Loaded (disabled in config)';
          }
          pluginStatusList.push(pluginInfo);
        }

        if (pluginStatusList.length === 0) {
          return "No other plugins found or error listing them.";
        }

        // Format the output string
        let output = "Installed Plugins Status:\n";
        output += "===========================\n";
        pluginStatusList.forEach(p => {
          output += `Plugin: ${p.name}\n`;
          output += `  Version: ${p.version || 'N/A'}\n`;
          output += `  Description: ${p.description || 'N/A'}\n`;
          output += `  Config Status: ${p.configuredStatus}\n`;
          output += `  Load Status: ${p.loadStatus}\n`;
          if (p.error) {
            output += `  Error: ${p.error}\n`;
          }
          output += `  Path: ${p.path}\n`;
          output += "---------------------------\n";
        });
        return output;
      },
    });

    return [listPluginsStatusTool];
  }
}

export default SystemInfoPlugin; 