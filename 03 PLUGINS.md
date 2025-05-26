# Wooster Plugins Guide

Plugins let you extend Wooster's core behavior by hooking into its REPL lifecycle events. To create a plugin, you add a `.ts` file in `src/plugins/`. Wooster automatically discovers these files. Their activation (i.e., whether their hooks are actually run) is controlled by environment variables in your `.env` file. See `06 CONFIG.MD` for full details on configuring Wooster, including plugins.

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
  - `list plugins`: outputs the names of all discovered plugin files and indicates whether they are active based on your `.env` configuration (enabled by default, or explicitly set via `PLUGIN_PLUGINNAME_ENABLED=true/false` variables).

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
3. Configure plugin activation in your `.env` file. Plugins are **enabled by default** if found in `src/plugins/`.
   - To explicitly disable `loggerPlugin.ts` (whose name is `logger`), add this to your `.env`:
     ```env
     PLUGIN_LOGGER_ENABLED=false
     ```
   - To explicitly enable it (though it's enabled by default if the above line is missing), you could add:
     ```env
     PLUGIN_LOGGER_ENABLED=true
     ```
   (Note: The plugin name for the environment variable `PLUGIN_LOGGER_ENABLED` comes from the `name` field in the plugin object, e.g., `name: 'logger'` maps to `PLUGIN_LOGGER_ENABLED`. `configLoader.ts` actually derives the expected env key from the *filename* when checking defaults, e.g. `loggerPlugin.ts` -> `PLUGIN_LOGGERPLUGIN_ENABLED`. Ensure your plugin's `name` property matches the filename (without .ts) for consistent identification by `pluginManager.ts` if relying on default enablement or if `config.plugins[plugin.name]` is used directly after config load.)

4. Restart Wooster: if enabled, you should see messages indicating your plugin's hooks are firing (or whatever behavior your plugin implements).

## Best Practices

- Give each plugin a unique `name` that ideally matches its filename (without the `.ts` extension) for clarity with `.env` configuration conventions.
- Keep hook implementations quick and robust; catch and log errors.
- If a plugin needs to perform complex actions or interact with Wooster's core reasoning (e.g., accessing knowledge, making decisions), consider if implementing it as an Agent Tool (`04 TOOLS.MD`) would be more appropriate, allowing the agent to intelligently decide when and how to use that capability.
- Use environment variables in your `.env` file for any sensitive plugin-specific configuration (e.g., API keys for services your plugin uses). Wooster automatically loads variables from this file into `process.env` at startup, making them accessible to your plugin code (e.g., `process.env.MY_PLUGIN_API_KEY`). All of Wooster's configuration, including core settings and plugin activation, is now managed via this `.env` file.
- Document your plugin's purpose and usage in code comments.

---
Wooster's plugin system offers a way to hook into lifecycle events for specific side-effects, complementing the agent tool system which provides dynamic, agent-driven capabilities.

Plugin functionality is managed by `src/pluginManager.ts`. Plugins found in `src/plugins/` are **enabled by default**.

To explicitly disable a plugin, you define an environment variable in your `.env` file. The variable name should follow the pattern `PLUGIN_PLUGINFILENAME_ENABLED=false`, where `PLUGINFILENAME` is the name of the plugin file (without the `.ts` extension), converted to uppercase.

For example, to disable a plugin defined in `examplePlugin.ts`:

```env
# In your .env file
PLUGIN_EXAMPLEPLUGIN_ENABLED=false
```

If this line is absent, and `examplePlugin.ts` exists in `src/plugins/`, it will be considered enabled. You can also explicitly enable it with `PLUGIN_EXAMPLEPLUGIN_ENABLED=true`, though this is usually redundant.
