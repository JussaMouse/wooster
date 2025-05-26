import { readdirSync } from 'fs'
import { join } from 'path'
import { AppConfig, getConfig } from './configLoader'
import { log, LogLevel } from './logger'
import { WoosterPlugin } from './pluginTypes'
import { DynamicTool } from '@langchain/core/tools'

const plugins: WoosterPlugin[] = []
const pluginProvidedAgentTools: DynamicTool[] = []

/**
 * Dynamically load plugins from the `plugins/` directory.
 * Initializes them and collects any agent tools they provide.
 */
export async function loadPlugins() {
  const dir = join(__dirname, 'plugins')
  const config = getConfig()
  let files: string[] = []
  try {
    files = readdirSync(dir).filter(f => /\.(ts|js)$/.test(f))
  } catch (err: any) {
    log(LogLevel.WARN, "Error reading plugins directory. No plugins will be loaded. Error: %s", err.message, { directory: dir });
    return
  }

  log(LogLevel.INFO, 'Found %d potential plugin files in %s.', files.length, dir);
  pluginProvidedAgentTools.length = 0;
  plugins.length = 0;

  for (const f of files) {
    try {
      const mod = await import(join(dir, f))
      const plugin: WoosterPlugin = mod.default
      
      if (plugin?.name && plugin.description && plugin.version) {
        const isEnabled = config.plugins[plugin.name];

        if (isEnabled === false) {
          log(LogLevel.INFO, 'Plugin "%s" (v%s) is disabled via configuration. Skipping load.', plugin.name, plugin.version);
          continue;
        }
        
        log(LogLevel.INFO, 'Loading plugin: "%s" v%s (Description: %s)', plugin.name, plugin.version, plugin.description);

        if (plugin.initialize) {
          try {
            await plugin.initialize(config);
            log(LogLevel.INFO, 'Plugin "%s" initialized successfully.', plugin.name);
          } catch (initError: any) {
            log(LogLevel.ERROR, 'Error initializing plugin "%s": %s. Plugin will not be fully active.', plugin.name, initError.message, { error: initError });
            continue;
          }
        }

        if (plugin.getAgentTools) {
          try {
            const toolsFromPlugin = plugin.getAgentTools();
            if (Array.isArray(toolsFromPlugin)) {
              pluginProvidedAgentTools.push(...toolsFromPlugin);
              log(LogLevel.INFO, 'Plugin "%s" provided %d agent tool(s): %s', plugin.name, toolsFromPlugin.length, toolsFromPlugin.map(t => t.name).join(', '));
            } else if (toolsFromPlugin) {
              log(LogLevel.WARN, 'Plugin "%s" getAgentTools() did not return an array. Tools not loaded from this plugin.', plugin.name);
            }
          } catch (toolError: any) {
            log(LogLevel.ERROR, 'Error calling getAgentTools() on plugin "%s": %s. Tools not loaded from this plugin.', plugin.name, toolError.message, { error: toolError });
          }
        }
        plugins.push(plugin);

      } else {
        log(LogLevel.WARN, 'File "%s" in plugins directory does not export a valid Wooster plugin (missing default export, or name/description/version properties).', f);
      }
    } catch (error: any) {
      log(LogLevel.ERROR, 'Error loading plugin module from file "%s": %s', f, error.message, { error });
    }
  }
  log(LogLevel.INFO, 'Plugin loading complete. Total active plugins: %d. Total tools provided by plugins: %d.', plugins.length, pluginProvidedAgentTools.length);
}

/**
 * Returns a list of names of all loaded and active plugins.
 */
export function listPlugins(): string[] {
  return plugins.map(p => p.name);
}

/**
 * Returns a list of all agent tools collected from active plugins.
 */
export function getPluginAgentTools(): DynamicTool[] {
  return [...pluginProvidedAgentTools];
}

/**
 * Returns a list of potential plugin filenames from the plugins directory.
 * This is used by configLoader to help determine default enablement states.
 */
export function getPluginFileNames(): string[] {
  const dir = join(__dirname, 'plugins');
  try {
    return readdirSync(dir).filter(f => /\.(ts|js)$/.test(f));
  } catch (err: any) {
    log(LogLevel.WARN, "Error reading plugins directory for getPluginFileNames. Returning empty list. Error: %s", err.message, { directory: dir });
    return [];
  }
}
