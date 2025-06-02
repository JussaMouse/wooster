import fs from 'fs'
import path from 'path'
import { AppConfig, getConfig } from './configLoader'
import { log, LogLevel } from './logger'
import { WoosterPlugin, CoreServices, EmailService } from './types/plugin'
import { Tool } from '@langchain/core/tools'
import { ensureScheduleIsManaged } from './scheduler/schedulerService'
import type { NextActionsService } from './plugins/nextActions/types'

const loadedPlugins: WoosterPlugin[] = []
const pluginProvidedAgentTools: any[] = []
const registeredServices: Map<string, any> = new Map()

// Implementation of CoreServices
const coreServicesInstance: CoreServices = {
  getConfig: () => getConfig(), // Provide access to the current global config
  log: (level: LogLevel, message: string, ...args: any[]) => log(level, message, ...args),
  registerService: (name: string, service: any): void => {
    if (registeredServices.has(name)) {
      log(LogLevel.WARN, `PluginManager: Service with name "${name}" is already registered. Overwriting.`)
    }
    registeredServices.set(name, service)
    log(LogLevel.INFO, `PluginManager: Service "${name}" registered.`)

    if (name === 'EmailService') {
      coreServicesInstance.emailService = service as EmailService
    }
    if (name === 'NextActionsService') {
      coreServicesInstance.NextActionsService = service as NextActionsService
    }
  },
  getService: (name: string): any | undefined => {
    const service = registeredServices.get(name)
    if (!service) {
      log(LogLevel.WARN, `PluginManager: Service "${name}" requested but not found.`)
    }
    return service
  },
  // emailService and NextActionsService will be populated by registerService
}

async function processPlugin(plugin: WoosterPlugin, config: AppConfig, actualEntryPoint: string) {
  log(LogLevel.INFO, `PluginManager: processPlugin started for plugin candidate from entry point: "${actualEntryPoint}"`);
  if (plugin && typeof plugin.name === 'string' && plugin.name &&
      typeof plugin.version === 'string' && plugin.version &&
      typeof plugin.description === 'string' && plugin.description) {

    const isEnabled = config.plugins[plugin.name];
    if (isEnabled === false) {
      log(LogLevel.INFO, 'Plugin "%s" (v%s) is disabled via configuration. Skipping load.', plugin.name, plugin.version);
      return; // Return instead of continue as this is now a helper function
    }

    log(LogLevel.INFO, 'Loading plugin: "%s" v%s (Path: %s)', plugin.name, plugin.version, actualEntryPoint);

    if (typeof plugin.initialize === 'function') {
      try {
        await plugin.initialize(config, coreServicesInstance);
        log(LogLevel.INFO, 'Plugin "%s" initialized successfully.', plugin.name);
      } catch (initError: any) {
        log(LogLevel.ERROR, 'Error initializing plugin "%s": %s. Plugin will not be fully active.', plugin.name, initError.message, { error: initError });
        return; // Skip this plugin if initialization fails
      }
    }

    log(LogLevel.DEBUG, `PluginManager: Checking getScheduledTaskSetups for plugin "${plugin.name}"`);
    if (typeof plugin.getScheduledTaskSetups === 'function') {
      log(LogLevel.DEBUG, `PluginManager: Plugin "${plugin.name}" implements getScheduledTaskSetups. Calling it.`);
      try {
        const setups = plugin.getScheduledTaskSetups();
        log(LogLevel.DEBUG, `PluginManager: Raw setups from "${plugin.name}":`, { setups });
        const setupArray = Array.isArray(setups) ? setups : (setups ? [setups] : []);

        for (const setup of setupArray) {
          log(LogLevel.DEBUG, `PluginManager: Processing a setup object from "${plugin.name}":`, { setup });
          if (setup &&
              typeof setup.taskKey === 'string' && setup.taskKey &&
              typeof setup.description === 'string' && setup.description &&
              typeof setup.defaultScheduleExpression === 'string' && setup.defaultScheduleExpression &&
              typeof setup.functionToExecute === 'function' &&
              typeof setup.executionPolicy === 'string' && setup.executionPolicy
             ) {
            log(LogLevel.INFO, `PluginManager: Plugin "${plugin.name}" provides valid scheduled task setup for: "${setup.taskKey}". Preparing to manage with scheduler.`);
            await ensureScheduleIsManaged(setup, config);
          } else {
            log(LogLevel.WARN, `PluginManager: Plugin "${plugin.name}" provided an invalid or incomplete ScheduledTaskSetupOptions object. Skipping this setup.`, { setup });
          }
        }
      } catch (scheduleSetupError: any) {
        log(LogLevel.ERROR, `Error getting or processing scheduled task setups from plugin "${plugin.name}": ${scheduleSetupError.message}`, { error: scheduleSetupError });
      }
    }

    if (typeof plugin.getAgentTools === 'function') {
      try {
        const toolsFromPlugin = plugin.getAgentTools();
        if (Array.isArray(toolsFromPlugin)) {
          pluginProvidedAgentTools.push(...toolsFromPlugin);
          log(LogLevel.INFO, 'Plugin "%s" provided %d agent tool(s): %s', plugin.name, toolsFromPlugin.length, toolsFromPlugin.map(t => t.name).join(', '));
        } else if (toolsFromPlugin) {
          log(LogLevel.WARN, 'Plugin "%s" getAgentTools() did not return an array or was empty. Tools not loaded from this plugin.', plugin.name);
        }
      } catch (toolError: any) {
        log(LogLevel.ERROR, 'Error calling getAgentTools() on plugin "%s": %s. Tools not loaded from this plugin.', plugin.name, toolError.message, { error: toolError });
      }
    }
    loadedPlugins.push(plugin);

  } else {
    log(LogLevel.WARN, 'Module at "%s" does not export a valid Wooster plugin (missing default export, or name/description/version properties).', actualEntryPoint);
  }
}

/**
 * Dynamically load plugins from subdirectories within `src/plugins/`.
 * Initializes them and collects any agent tools or scheduled tasks they provide.
 */
export async function loadPlugins() {
  log(LogLevel.INFO, 'PluginManager: loadPlugins started.'); // Log start of loadPlugins
  const pluginsRootPath = path.join(__dirname, 'plugins')
  const config = getConfig()
  
  loadedPlugins.length = 0
  pluginProvidedAgentTools.length = 0
  registeredServices.clear()
  delete coreServicesInstance.emailService
  delete coreServicesInstance.NextActionsService

  // Scan and load ALL plugins from src/plugins/ directory
  let pluginDirectories: string[] = []
  try {
    pluginDirectories = fs.readdirSync(pluginsRootPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
  } catch (err: any) {
    // Log error but continue, as other initialization might be critical or already done.
    log(LogLevel.WARN, `Error reading plugins directory at ${pluginsRootPath}. No plugins will be loaded from here. Error: %s`, err.message)
  }

  if (pluginDirectories.length > 0) {
    log(LogLevel.INFO, 'Found %d potential plugin director(y/ies) in %s for dynamic loading.', pluginDirectories.length, pluginsRootPath);
  } else {
    log(LogLevel.INFO, 'No plugin directories found in %s or directory could not be read.', pluginsRootPath);
  }

  for (const pluginDirName of pluginDirectories) {
    log(LogLevel.INFO, `PluginManager: Processing plugin directory: "${pluginDirName}"`);
    const pluginEntryPoint = path.join(pluginsRootPath, pluginDirName, 'index.ts')
    const pluginEntryPointJs = path.join(pluginsRootPath, pluginDirName, 'index.js')
    
    let actualEntryPoint = ''
    if (fs.existsSync(pluginEntryPoint)) {
        actualEntryPoint = pluginEntryPoint
    } else if (fs.existsSync(pluginEntryPointJs)) {
        actualEntryPoint = pluginEntryPointJs
    }

    if (!actualEntryPoint) {
      log(LogLevel.WARN, 'PluginManager: Plugin directory "%s" does not contain an index.ts or index.js. Skipping.', pluginDirName)
      continue
    }
    log(LogLevel.INFO, `PluginManager: Determined entry point for "${pluginDirName}": "${actualEntryPoint}"`);

    try {
      log(LogLevel.INFO, `PluginManager: Attempting to import plugin module from "${actualEntryPoint}"`);
      const mod = await import(actualEntryPoint)
      log(LogLevel.INFO, `PluginManager: Successfully imported module from "${actualEntryPoint}". Has default export: ${!!mod.default}`);
      const plugin: WoosterPlugin = mod.default
      await processPlugin(plugin, config, actualEntryPoint); // Use the helper function
    } catch (error: any) {
      log(LogLevel.ERROR, 'Error loading plugin module from "%s": %s', actualEntryPoint, error.message, { error })
    }
  }
  log(LogLevel.INFO, 'Plugin loading complete. Total active plugins: %d. Total tools provided by plugins: %d.', loadedPlugins.length, pluginProvidedAgentTools.length)
}

/**
 * Returns a list of names of all loaded and active plugins.
 */
export function listPlugins(): string[] {
  return loadedPlugins.map(p => p.name)
}

/**
 * Returns a list of all agent tools collected from active plugins.
 */
export function getPluginAgentTools(): any[] {
  return [...pluginProvidedAgentTools]
}

/**
 * Returns a list of plugin directory names from `src/plugins/`.
 * This can be used by configLoader to help determine default enablement states if needed.
 */
export function getPluginDirectoryNames(): string[] {
  const pluginsRootPath = path.join(__dirname, 'plugins')
  try {
    return fs.readdirSync(pluginsRootPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
  } catch (err: any) {
    log(LogLevel.WARN, "Error reading plugins directory for getPluginDirectoryNames. Returning empty list. Error: %s", err.message, { directory: pluginsRootPath })
    return []
  }
}
