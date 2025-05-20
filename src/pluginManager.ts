import { readdirSync } from 'fs'
import { join } from 'path'

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
  let files: string[] = []
  try {
    files = readdirSync(dir).filter(f => /\.(ts|js)$/.test(f))
  } catch {
    return
  }
  for (const f of files) {
    const mod = await import(join(dir, f))
    const plugin: Plugin = mod.default
    if (plugin?.name) {
      plugins.push(plugin)
      console.log(`Loaded plugin: ${plugin.name}`)
    }
  }
}

/**
 * Call each plugin's initialization hook.
 */
export async function initPlugins(ctx: PluginContext) {
  for (const p of plugins) {
    if (p.onInit) {
      await p.onInit(ctx)
    }
  }
}

/**
 * Pass user input through each plugin's onUserInput hook.
 */
export async function handleUserInput(input: string): Promise<string> {
  let out = input
  for (const p of plugins) {
    if (p.onUserInput) {
      out = await p.onUserInput(out)
    }
  }
  return out
}

/**
 * Pass assistant response through each plugin's onAssistantResponse hook.
 */
export async function handleAssistantResponse(resp: string): Promise<void> {
  for (const p of plugins) {
    if (p.onAssistantResponse) await p.onAssistantResponse(resp)
  }
}

// Add a function to list loaded plugin names
type PluginName = string;
export function listPlugins(): PluginName[] {
  return plugins.map(p => p.name)
}
