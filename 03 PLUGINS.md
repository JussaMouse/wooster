# Wooster Plugins Guide

Plugins let you extend Wooster's core behavior by hooking into its REPL lifecycle events. To create a plugin, you add a `.ts` file in `src/plugins/`. Wooster will discover these files, but their activation (i.e., whether their hooks are actually run) is controlled by the `plugins` section in `config.json`. See `06 CONFIG.MD` for details on configuring plugins.

## Plugin Interface

Each plugin exports a default object matching this shape:
```ts
interface PluginContext {
  apiKey: string; // OpenAI API Key
  // Consider if direct access to vectorStore and ragChain is always ideal for plugins,
  // or if they should interact via higher-level abstractions or agent-triggerable tools for core functionalities.
  vectorStore: any; // The currently active vector store (initially the default store)
  ragChain: any;    // The current RAG chain instance
}

interface Plugin {
  name: string;
  onInit?: (ctx: PluginContext) => void | Promise<void>;
  onUserInput?: (input: string) => string | Promise<string>; // Use with caution
  onAssistantResponse?: (response: string) => void | Promise<void>;
}
```

## Hook Points

- **onInit(ctx)**: Called once for each *active* plugin after all plugins are discovered and before the REPL starts. Use it to initialize resources (e.g., connecting to an external analytics service).

- **onUserInput(input)**: Runs for each *active* plugin before core command routing and RAG. Can be used to transform or intercept user input. **Caution:** Modifying user input here can significantly affect how built-in commands are processed and how the agent interprets the user's intent. Use this hook sparingly and with a clear understanding of its impact.

- **onAssistantResponse(response)**: Runs for each *active* plugin after the LLM reply or agent action. Ideal for side-effects that don't require agent decision-making, such as logging the interaction, sending a passive notification to an external system (if not covered by the scheduling tool), or collecting analytics.

> Note: Core functionalities like email sending and task scheduling (reminders) are now implemented as agent-driven tools (`sendEmail`, `scheduleAgentTask`). 
> Plugins are best suited for:
>   - Passive side-effects (e.g., logging, analytics).
>   - Simple, non-agent-driven notifications to external systems.
>   - Lifecycle interventions that don't involve the agent's decision-making process.

## Built-in Plugin Commands
- Wooster also supports a REPL command:
  - `list plugins`: outputs the names of all discovered plugin files and indicates whether they are active based on `config.json`.

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
3. Enable your plugin in `config.json` under the `plugins` key. For example:
   ```json
   {
     // ... other config ...
     "plugins": {
       "loggerPlugin": true // Filename without .ts extension
     }
   }
   ```
4. Restart Wooster: if enabled, you should see messages indicating your plugin's hooks are firing (or whatever behavior your plugin implements).

## Best Practices

- Give each plugin a unique `name`.
- Keep hook implementations quick and robust; catch and log errors.
- If a plugin needs to perform complex actions or interact with Wooster's core reasoning (e.g., accessing knowledge, making decisions), consider if implementing it as an Agent Tool (`04 TOOLS.MD`) would be more appropriate, allowing the agent to intelligently decide when and how to use that capability.
- Use environment variables (`.env`) for sensitive config.
- Document your plugin's purpose and usage in code comments.

---
Wooster's plugin system offers a way to hook into lifecycle events for specific side-effects, complementing the agent tool system which provides dynamic, agent-driven capabilities.

Plugin functionality is managed by `src/pluginManager.ts`. Plugins are enabled or disabled via the `plugins` section in `config.json`.

For example, to disable a hypothetical `examplePlugin`:

```json
// config.json
{
  // ... other config
  "plugins": {
    "examplePlugin": false
  }
}
```

If a plugin is not listed in `config.json`, it defaults to being enabled. To explicitly enable it, you would add:

```json
// config.json
{
  // ... other config
  "plugins": {
    "examplePlugin": true
  }
}
```
