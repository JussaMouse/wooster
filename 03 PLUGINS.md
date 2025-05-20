# Wooster Plugins Guide

Plugins let you extend Wooster's core behavior by hooking into its REPL lifecycle events. Simply drop a new `.ts` file in `src/plugins/` and Wooster will auto-load it on startup.

## Plugin Interface

Each plugin exports a default object matching this shape:
```ts
interface Plugin {
  name: string;
  onInit?: (ctx: { apiKey: string; vectorStore: any; ragChain: any }) => void | Promise<void>;
  onUserInput?: (input: string) => string | Promise<string>;
  onAssistantResponse?: (response: string) => void | Promise<void>;
}
```

## Hook Points

- **onInit(ctx)**: Called once after all plugins load and before the REPL starts. Use it to initialize resources or register external services.

- **onUserInput(input)**: Runs before core command routing and RAG. Transform or intercept user input here; return the (possibly modified) string.

- **onAssistantResponse(response)**: Runs after the LLM reply. Ideal for side-effects (e.g. logging) when not implementing agentic tools.

> Note: Email sending is now implemented as an agent `sendEmail` tool; you no longer need an email plugin.  
> Use plugins for other side-effects (reminders, notifications, analytics).

## Built-in Plugin Commands
- Wooster also supports a REPL command:
  - `list plugins`: outputs the names of all loaded plugins.

## Creating a Plugin

1. Create a file in `src/plugins/`, e.g. `loggerPlugin.ts`.
2. Export a default `Plugin` object:
```ts
import type { Plugin } from '../pluginManager'

const loggerPlugin: Plugin = {
  name: 'logger',
  onUserInput: (input) => {
    console.log('[LOG] User input:', input)
    return input
  },
  onAssistantResponse: (resp) => {
    console.log('[LOG] Assistant responded:', resp)
  }
}

export default loggerPlugin
```
3. Restart Wooster: you'll see `Loaded plugin: logger` in the console.

## Best Practices

- Give each plugin a unique `name`.
- Keep hook implementations quick and robust; catch and log errors.
- Use environment variables (`.env`) for sensitive config.
- Document your plugin's purpose and usage in code comments.

---
Wooster's plugin system is your primary way to add new capabilities and customize its behavior with minimal friction.
