import fs from 'fs'
import path from 'path'
import { AppConfig, getConfig } from './configLoader'
import { log, LogLevel } from './logger'
import { WoosterPlugin, CoreServices, EmailService } from './types/plugin'
import { ensureScheduleIsManaged } from './scheduler/schedulerService'
import type { NextActionsService } from './plugins/nextActions/types'
import { 
  setActiveProject as coreSetActiveProject,
  getActiveProjectPath as coreGetActiveProjectPath
} from './agentExecutorService'

const loadedPlugins: WoosterPlugin[] = []
const pluginProvidedAgentTools: any[] = []
const registeredServices: Map<string, any> = new Map()

// Implementation of CoreServices
const coreServicesInstance: CoreServices = {
  getConfig: getConfig, // Provide access to the current global config
  log: (level: LogLevel, message: string, metadata?: object) => log(level, message, metadata),
  registerService: (name: string, service: any): void => {
    if (registeredServices.has(name)) {
      log(LogLevel.WARN, `PluginManager: Service with name "${name}" is already registered. Overwriting.`)
    }
    registeredServices.set(name, service)
    log(LogLevel.INFO, `PluginManager: Service "${name}" registered.`)

    // Example of how specific services could be directly assigned if CoreServices interface had them explicitly
    // if (name === 'EmailService') {
    //   (coreServicesInstance as any).emailService = service as EmailService;
    // }
    // if (name === 'NextActionsService') {
    //   (coreServicesInstance as any).NextActionsService = service as NextActionsService;
    // }
  },
  getService: (name: string): any | undefined => {
    const service = registeredServices.get(name)
    if (!service) {
      log(LogLevel.WARN, `PluginManager: Service "${name}" requested but not found. Current registered services: ${JSON.stringify(Array.from(registeredServices.keys()))}`)
    }
    return service
  },
  setActiveProject: coreSetActiveProject,
  getActiveProjectPath: coreGetActiveProjectPath, // Added service accessor
  // emailService and NextActionsService are examples; actual access is via getService
}

async function processPlugin(plugin: WoosterPlugin, config: AppConfig, actualEntryPoint: string) {
  log(LogLevel.INFO, `PluginManager: processPlugin started for plugin candidate from entry point: "${actualEntryPoint}"`);

  const pluginStatic = plugin as any; // Type assertion to access potential static members
  const pName = pluginStatic.pluginName || pluginStatic.name; // Prefer pluginName
  const pVersion = pluginStatic.version;
  const pDescription = pluginStatic.description;

  if (plugin && typeof pName === 'string' && pName &&
      typeof pVersion === 'string' && pVersion &&
      typeof pDescription === 'string' && pDescription) {

    const isEnabled = config.plugins[pName];
    if (isEnabled === false) {
      log(LogLevel.INFO, 'Plugin "%s" (v%s) is disabled via configuration. Skipping load.', pName, pVersion);
      return;
    }

    log(LogLevel.INFO, 'Loading plugin: "%s" v%s (Path: %s)', pName, pVersion, actualEntryPoint);

    if (typeof plugin.initialize === 'function') {
      try {
        await plugin.initialize(config, coreServicesInstance);
        log(LogLevel.INFO, 'Plugin "%s" initialized successfully.', pName);
      } catch (initError: any) {
        log(LogLevel.ERROR, 'Error initializing plugin "%s": %s. Plugin will not be fully active.', pName, initError.message, { error: initError });
        return;
      }
    }

    log(LogLevel.DEBUG, `PluginManager: Checking getScheduledTaskSetups for plugin "${pName}"`);
    if (typeof plugin.getScheduledTaskSetups === 'function') {
      log(LogLevel.DEBUG, `PluginManager: Plugin "${pName}" implements getScheduledTaskSetups. Calling it.`);
      try {
        const setups = plugin.getScheduledTaskSetups();
        log(LogLevel.DEBUG, `PluginManager: Raw setups from "${pName}":`, { setups });
        const setupArray = Array.isArray(setups) ? setups : (setups ? [setups] : []);

        for (const setup of setupArray) {
          log(LogLevel.DEBUG, `PluginManager: Processing a setup object from "${pName}":`, { setup });
          if (setup &&
              typeof setup.taskKey === 'string' && setup.taskKey &&
              typeof setup.description === 'string' && setup.description &&
              typeof setup.defaultScheduleExpression === 'string' && setup.defaultScheduleExpression &&
              typeof setup.functionToExecute === 'function' &&
              typeof setup.executionPolicy === 'string' && setup.executionPolicy
             ) {
            log(LogLevel.INFO, `PluginManager: Plugin "${pName}" provides valid scheduled task setup for: "${setup.taskKey}". Preparing to manage with scheduler.`);
            await ensureScheduleIsManaged(setup, config);
          } else {
            log(LogLevel.WARN, `PluginManager: Plugin "${pName}" provided an invalid or incomplete ScheduledTaskSetupOptions object. Skipping this setup.`, { setup });
          }
        }
      } catch (scheduleSetupError: any) {
        log(LogLevel.ERROR, `Error getting or processing scheduled task setups from plugin "${pName}": ${scheduleSetupError.message}`, { error: scheduleSetupError });
      }
    }

    if (typeof plugin.getAgentTools === 'function') {
      try {
        const toolsFromPlugin = plugin.getAgentTools();
        if (Array.isArray(toolsFromPlugin)) {
          pluginProvidedAgentTools.push(...toolsFromPlugin);
          log(LogLevel.INFO, 'Plugin "%s" provided %d agent tool(s): %s', pName, toolsFromPlugin.length, toolsFromPlugin.map(t => t.name).join(', '));
        } else if (toolsFromPlugin) {
          log(LogLevel.WARN, 'Plugin "%s" getAgentTools() did not return an array or was empty. Tools not loaded from this plugin.', pName);
        }
      } catch (toolError: any) {
        log(LogLevel.ERROR, 'Error calling getAgentTools() on plugin "%s": %s. Tools not loaded from this plugin.', pName, toolError.message, { error: toolError });
      }
    }
    loadedPlugins.push(plugin); // Still pushing the constructor

  } else {
    let missingDetails = [];
    if (!plugin) missingDetails.push("plugin definition");
    if (typeof pName !== 'string' || !pName) missingDetails.push("name (pluginName or name property)");
    if (typeof pVersion !== 'string' || !pVersion) missingDetails.push("version property");
    if (typeof pDescription !== 'string' || !pDescription) missingDetails.push("description property");
    log(LogLevel.WARN, 'Module at "%s" does not export a valid Wooster plugin class. Missing or invalid static properties: %s.', actualEntryPoint, missingDetails.join(', '));
  }
}

/**
 * Dynamically load plugins from subdirectories within `src/plugins/`.
 * Initializes them and collects any agent tools or scheduled tasks they provide.
 */
export async function loadPlugins() {
  log(LogLevel.INFO, 'PluginManager: loadPlugins started.');
  const pluginsRootPath = path.join(__dirname, 'plugins');
  const config = getConfig();
  
  loadedPlugins.length = 0;
  pluginProvidedAgentTools.length = 0;
  registeredServices.clear();
  delete coreServicesInstance.emailService;
  delete coreServicesInstance.NextActionsService;

  // Helper function to process each plugin
  async function processPlugin(pluginConstructor: WoosterPlugin, appConfig: AppConfig, entryPoint: string) {
    log(LogLevel.INFO, `PluginManager: processPlugin started for plugin candidate from entry point: "${entryPoint}"`);

    const PluginClass = pluginConstructor as any; // pluginConstructor is the class itself

    const pName = PluginClass.pluginName || PluginClass.name;
    const pVersion = PluginClass.version;
    const pDescription = PluginClass.description;

    if (PluginClass && typeof pName === 'string' && pName &&
        typeof pVersion === 'string' && pVersion &&
        typeof pDescription === 'string' && pDescription) {

      const isEnabled = appConfig.plugins[pName];
      if (isEnabled === false) {
        log(LogLevel.INFO, 'Plugin "%s" (v%s) is disabled via configuration. Skipping load.', pName, pVersion);
        return;
      }

      log(LogLevel.INFO, 'Loading plugin: "%s" v%s (Path: %s)', pName, pVersion, entryPoint);
      
      let instance: WoosterPlugin;
      try {
        // Instantiate the plugin class
        instance = new PluginClass(); 
      } catch (instantiationError: any) {
        log(LogLevel.ERROR, `Failed to instantiate plugin "${pName}" from "${entryPoint}": %s`, instantiationError.message, { error: instantiationError });
        return;
      }

      if (typeof instance.initialize === 'function') {
        try {
          await instance.initialize(appConfig, coreServicesInstance);
          log(LogLevel.INFO, 'Plugin "%s" initialized successfully.', pName);
        } catch (initError: any) {
          log(LogLevel.ERROR, 'Error initializing plugin instance "%s": %s. Plugin will not be fully active.', pName, initError.message, { error: initError });
          return; 
        }
      }

      log(LogLevel.DEBUG, `PluginManager: Checking getScheduledTaskSetups for plugin instance "${pName}"`);
      if (typeof instance.getScheduledTaskSetups === 'function') {
        log(LogLevel.DEBUG, `PluginManager: Plugin instance "${pName}" implements getScheduledTaskSetups. Calling it.`);
        try {
          // Type assertion as WoosterPlugin's getScheduledTaskSetups is optional
          const setups = (instance as any).getScheduledTaskSetups(); 
          log(LogLevel.DEBUG, `PluginManager: Raw setups from plugin instance "${pName}":`, { setups });
          const setupArray = Array.isArray(setups) ? setups : (setups ? [setups] : []);

          for (const setup of setupArray) {
            log(LogLevel.DEBUG, `PluginManager: Processing a setup object from plugin instance "${pName}":`, { setup });
            if (setup &&
                typeof setup.taskKey === 'string' && setup.taskKey &&
                typeof setup.description === 'string' && setup.description &&
                typeof setup.defaultScheduleExpression === 'string' && setup.defaultScheduleExpression &&
                typeof setup.functionToExecute === 'function' &&
                typeof setup.executionPolicy === 'string' && setup.executionPolicy
               ) {
              log(LogLevel.INFO, `PluginManager: Plugin instance "${pName}" provides valid scheduled task setup for: "${setup.taskKey}". Preparing to manage with scheduler.`);
              await ensureScheduleIsManaged(setup, appConfig);
            } else {
              log(LogLevel.WARN, `PluginManager: Plugin instance "${pName}" provided an invalid or incomplete ScheduledTaskSetupOptions object. Skipping this setup.`, { setup });
            }
          }
        } catch (scheduleSetupError: any) {
          log(LogLevel.ERROR, `Error getting or processing scheduled task setups from plugin instance "${pName}": ${scheduleSetupError.message}`, { error: scheduleSetupError });
        }
      }

      if (typeof instance.getAgentTools === 'function') {
        try {
          // Type assertion as WoosterPlugin's getAgentTools is optional
          const toolsFromPlugin = (instance as any).getAgentTools();
          if (Array.isArray(toolsFromPlugin)) {
            pluginProvidedAgentTools.push(...toolsFromPlugin);
            log(LogLevel.INFO, 'Plugin instance "%s" provided %d agent tool(s): %s', pName, toolsFromPlugin.length, toolsFromPlugin.map(t => t.name).join(', '));
          } else if (toolsFromPlugin) {
            log(LogLevel.WARN, 'Plugin instance "%s" getAgentTools() did not return an array or was empty. Tools not loaded from this plugin.', pName);
          }
        } catch (toolError: any) {
          log(LogLevel.ERROR, 'Error calling getAgentTools() on plugin instance "%s": %s. Tools not loaded from this plugin.', pName, toolError.message, { error: toolError });
        }
      }
      loadedPlugins.push(instance); // Push the instance

    } else {
      let missingDetails = [];
      if (!PluginClass) missingDetails.push("plugin definition");
      if (typeof pName !== 'string' || !pName) missingDetails.push("name (pluginName or name property)");
      if (typeof pVersion !== 'string' || !pVersion) missingDetails.push("version property");
      if (typeof pDescription !== 'string' || !pDescription) missingDetails.push("description property");
      log(LogLevel.WARN, 'Module at "%s" does not export a valid Wooster plugin class. Missing or invalid static properties: %s.', entryPoint, missingDetails.join(', '));
    }
  }

  // Scan and load ALL plugins from src/plugins/ directory
  let pluginDirectories: string[] = [];
  try {
    pluginDirectories = fs.readdirSync(pluginsRootPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (err: any) {
    log(LogLevel.WARN, `Error reading plugins directory at ${pluginsRootPath}. No plugins will be loaded from here. Error: %s`, err.message);
  }

  if (pluginDirectories.length > 0) {
    log(LogLevel.INFO, 'Found %d potential plugin director(y/ies) in %s for dynamic loading.', pluginDirectories.length, pluginsRootPath);
  } else {
    log(LogLevel.INFO, 'No plugin directories found in %s or directory could not be read.', pluginsRootPath);
  }

  for (const pluginDirName of pluginDirectories) {
    log(LogLevel.INFO, `PluginManager: Processing plugin directory: "${pluginDirName}"`);
    const pluginEntryPointTs = path.join(pluginsRootPath, pluginDirName, 'index.ts');
    const pluginEntryPointJs = path.join(pluginsRootPath, pluginDirName, 'index.js');
    
    let actualEntryPoint = '';
    if (fs.existsSync(pluginEntryPointTs)) { // Prefer .ts for context, though import will use .js from dist
        actualEntryPoint = pluginEntryPointTs;
    } else if (fs.existsSync(pluginEntryPointJs)) {
        actualEntryPoint = pluginEntryPointJs;
    }

    if (!actualEntryPoint) {
      log(LogLevel.WARN, 'PluginManager: Plugin directory "%s" does not contain an index.ts or index.js. Skipping.', pluginDirName);
      continue;
    }
    log(LogLevel.INFO, `PluginManager: Determined entry point for "${pluginDirName}": "${actualEntryPoint}"`);

    try {
      log(LogLevel.INFO, `PluginManager: Attempting to import plugin module from "${actualEntryPoint}"`);
      // Dynamic import will resolve to .js from the 'dist' folder based on tsconfig output
      const mod = await import(actualEntryPoint.replace(/^src/, '..\/dist').replace(/\\.[jt]s$/, '.js'));
      log(LogLevel.INFO, `PluginManager: Successfully imported module from "${actualEntryPoint}". Has default export: ${!!mod.default}`);
      
      if (mod.default) {
        await processPlugin(mod.default, config, actualEntryPoint);
      } else {
        log(LogLevel.WARN, `PluginManager: Module from "${actualEntryPoint}" does not have a default export. Skipping.`);
      }
    } catch (error: any) {
      log(LogLevel.ERROR, 'Error loading plugin module from "%s": %s', actualEntryPoint, error.message, { error });
    }
  }
  log(LogLevel.INFO, 'Plugin loading complete. Total active plugins: %d. Total tools provided by plugins: %d.', loadedPlugins.length, pluginProvidedAgentTools.length);
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
