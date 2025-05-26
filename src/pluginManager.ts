import { readdirSync } from 'fs'
import { join } from 'path'
import { getConfig } from './configLoader'
import { log, LogLevel } from './logger'

export type PluginContext = { apiKey: string; vectorStore: any; ragChain: any }

export interface Plugin {
  name: string
  onInit?: (ctx: PluginContext) => Promise<void> | void
  onUserInput?: (input: string) => Promise<string> | string
  onAssistantResponse?: (response: string) => Promise<void> | void
}

const plugins: Plugin[] = []

/**
 * Dynamically load plugins from the `plugins/` directory.
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

  for (const f of files) {
    try {
    const mod = await import(join(dir, f))
    const plugin: Plugin = mod.default
      
    if (plugin?.name) {
        const isEnabled = config.plugins[plugin.name];

        if (isEnabled === false) {
          log(LogLevel.INFO, 'Plugin "%s" is disabled via configuration. Skipping load.', plugin.name);
          continue;
        }
        
        if (isEnabled === undefined) {
          log(LogLevel.WARN, 'Plugin "%s" was not found in the centrally managed plugin configuration. Assuming enabled, but this might indicate an issue.', plugin.name);
        }

        plugins.push(plugin);
        log(LogLevel.INFO, 'Loaded plugin: "%s" (Enabled: %s)', plugin.name, isEnabled === undefined ? "true (implicit)" : isEnabled.toString());
      } else {
        log(LogLevel.WARN, 'File "%s" in plugins directory does not export a valid plugin (missing default export or name property).', f);
      }
    } catch (error: any) {
      log(LogLevel.ERROR, 'Error loading plugin from file "%s": %s', f, error.message, { error });
    }
  }
}

/**
 * Call each plugin's initialization hook.
 */
export async function initPlugins(ctx: PluginContext) {
  if (plugins.length === 0) {
    log(LogLevel.INFO, "No enabled plugins to initialize.");
    return
  }
  log(LogLevel.INFO, 'Initializing %d enabled plugins...', plugins.length);
  for (const p of plugins) {
    if (p.onInit) {
      try {
        log(LogLevel.DEBUG, 'Initializing plugin: "%s"', p.name);
      await p.onInit(ctx)
        log(LogLevel.INFO, 'Plugin "%s" initialized successfully.', p.name);
      } catch (error: any) {
        log(LogLevel.ERROR, 'Error initializing plugin "%s": %s', p.name, error.message, { error });
      }
    }
  }
}

/**
 * Pass user input through each plugin's onUserInput hook.
 */
export async function handleUserInput(input: string): Promise<string> {
  let out = input
  if (plugins.length === 0) return out

  for (const p of plugins) {
    if (p.onUserInput) {
      try {
        log(LogLevel.DEBUG, 'Plugin "%s" processing onUserInput.', p.name);
      out = await p.onUserInput(out)
      } catch (error: any) {
        log(LogLevel.ERROR, 'Error in plugin "%s" onUserInput hook: %s', p.name, error.message, { error });
        // Decide if we should continue or stop processing (for now, continue)
      }
    }
  }
  return out
}

/**
 * Pass assistant response through each plugin's onAssistantResponse hook.
 */
export async function handleAssistantResponse(resp: string): Promise<void> {
  if (plugins.length === 0) return

  for (const p of plugins) {
    if (p.onAssistantResponse) {
      try {
        log(LogLevel.DEBUG, 'Plugin "%s" processing onAssistantResponse.', p.name);
      await p.onAssistantResponse(resp)
      } catch (error: any) {
        log(LogLevel.ERROR, 'Error in plugin "%s" onAssistantResponse hook: %s', p.name, error.message, { error });
      }
    }
  }
}

// Add a function to list loaded plugin names
type PluginName = string
export function listPlugins(): PluginName[] {
  return plugins.map(p => p.name)
}

/**
 * Returns a list of potential plugin filenames from the plugins directory.
 * This is used by configLoader to determine default enablement states.
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
