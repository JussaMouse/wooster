# Wooster Plugin Development Guide

This guide provides instructions and best practices for developing plugins for Wooster. Adhering to these guidelines will help ensure your plugins are correctly loaded, initialized, and integrated into the Wooster ecosystem.

## Core Concepts

Wooster's `PluginManager` is responsible for discovering, loading, validating, and initializing all plugins. Plugins can extend Wooster's functionality by registering new agent tools, providing services, or scheduling background tasks.

## Plugin Structure

A plugin is typically a TypeScript class contained within its own directory under `src/plugins/`. For example, a plugin named "myPlugin" would reside in `src/plugins/myPlugin/`.

### Entry Point: `index.ts`

The main file for your plugin must be `src/plugins/yourPluginName/index.ts`. This file should contain the main plugin class and export it as the default export.

### Plugin Class Definition

Your plugin class must implement the `WoosterPlugin` interface (from `src/types/plugin.ts`).

#### 1. Static Properties (Crucial for Loading & Validation)

The `PluginManager` validates plugins by expecting certain static properties on the plugin's default exported class constructor. These properties are read *before* the plugin is instantiated.

-   **`pluginName` (string):** (Recommended) The canonical, unique name for your plugin (e.g., `'myPlugin'`). This is used as the key in configuration files (e.g., `config.plugins.myPlugin`) and for logging. While `name` is also checked for backward compatibility, `pluginName` is preferred to avoid conflicts with `Function.name`.
-   **`version` (string):** The version number of your plugin (e.g., `'0.1.0'`).
-   **`description` (string):** A brief description of what your plugin does.

These properties **must** be defined as `static readonly` on your plugin class.

**Example:**

```typescript
// src/plugins/myPlugin/index.ts
import { WoosterPlugin, AppConfig, CoreServices, LogLevel } from '../../types/plugin'; // Adjust path as needed

export class MyPlugin implements WoosterPlugin {
  // Static properties for PluginManager
  static readonly pluginName = 'myPlugin';
  static readonly version = '1.0.0';
  static readonly description = 'This plugin demonstrates best practices.';

  // Instance properties to satisfy WoosterPlugin interface (can mirror static ones)
  readonly name = MyPlugin.pluginName;
  readonly version = MyPlugin.version;
  readonly description = MyPlugin.description;

  private config!: AppConfig;
  private services!: CoreServices;

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.config = config;
    this.services = services;
    this.services.log(LogLevel.INFO, `MyPlugin (v${MyPlugin.version}): Initialized successfully.`);
    // Initialization logic for your plugin
  }

  async shutdown(): Promise<void> {
    this.services.log(LogLevel.INFO, `MyPlugin (v${MyPlugin.version}): Shutting down.`);
    // Cleanup logic for your plugin
  }

  // Optional: getAgentTools, getScheduledTaskSetups, etc.
  // getAgentTools?(): DynamicTool[] { /* ... */ }
}

export default MyPlugin; // Default export the class
```

#### 2. Default Export

Your plugin's `index.ts` file **must** have a `default export` of the plugin class itself.
`export default MyPluginClass;`

#### 3. Plugin Lifecycle Methods

The `WoosterPlugin` interface defines several lifecycle methods. The `PluginManager` will call these on an **instance** of your plugin class.

-   **`async initialize(config: AppConfig, services: CoreServices): Promise<void>`:**
    Called when the plugin is loaded. Use this to set up your plugin, store the provided `config` and `services` on `this` for later use, register services, etc.
-   **`async shutdown(): Promise<void>`:**
    Called when Wooster is shutting down. Use this for any cleanup tasks.
-   **`getAgentTools?(): DynamicTool[]`:** (Optional)
    If your plugin provides tools for the AI agent, implement this method to return an array of `DynamicTool` instances.
-   **`getScheduledTaskSetups?(): ScheduledTaskSetupOptions | ScheduledTaskSetupOptions[]`:** (Optional)
    If your plugin needs to run background tasks on a schedule, implement this to return setup options.

Since these methods are called on an instance, you can safely use `this` to access instance properties (like `this.config` or `this.services` that you stored during `initialize`).

## Compilation

Wooster is a TypeScript project. Your plugin's TypeScript code will be compiled into JavaScript and output to the `dist/` directory. The `PluginManager` loads plugins from their compiled JavaScript versions (e.g., `dist/plugins/myPlugin/index.js`).

-   Ensure your TypeScript code is free of compilation errors.
-   The build process (e.g., `pnpm build`) handles the compilation.

## Troubleshooting Plugin Loading

If your plugin isn't loading or you see warnings in the console:

1.  **Check Wooster Logs:** Look for messages from the `PluginManager`, especially:
    *   `Module at "..." does not export a valid Wooster plugin class. Missing or invalid static properties: ...`
    *   Errors related to module import or instantiation.
2.  **Verify Static Properties:**
    *   Are `pluginName` (or `name`), `version`, and `description` defined as `static readonly` strings on your plugin class?
3.  **Verify Default Export:**
    *   Is your plugin class the `default export` of its `index.ts` file?
4.  **Clean and Rebuild:**
    *   Delete the `dist/` directory entirely.
    *   Re-run the build command (e.g., `pnpm build`).
    *   Restart Wooster.
5.  **Inspect Compiled Output:**
    *   Check the generated JavaScript file for your plugin in `dist/plugins/yourPluginName/index.js`.
    *   Does it correctly show the static properties on the constructor?
    *   Is the class being correctly exported via `exports.default = ...;` (or the ESM equivalent if your tsconfig targets that)?
6.  **Configuration:**
    *   Ensure your plugin is enabled in the configuration (usually via environment variables like `PLUGIN_YOURPLUGINNAME_ENABLED=true`, which are mapped in `config/custom-environment-variables.json`). Check `.env.example` for patterns.

By following these guidelines, you can create robust and well-integrated plugins for Wooster. 