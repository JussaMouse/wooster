# PluginManager

The `PluginManager` is a core component of Wooster responsible for the discovery, validation, loading, and lifecycle management of all plugins. It allows Wooster to be extended with new functionalities, agent tools, and scheduled tasks in a modular way.

## Overview of Operations

1.  **Discovery:** On startup, the `PluginManager` scans the `src/plugins/` directory for subdirectories. Each subdirectory is considered a potential plugin.
2.  **Entry Point:** It looks for an `index.ts` (or `index.js` in the compiled `dist` version) within each plugin directory to serve as the plugin's entry point.
3.  **Validation:** The module loaded from the entry point must:
    *   Have a `default export` which is the plugin class.
    *   The plugin class must have `static readonly` properties: `pluginName` (or `name`), `version`, and `description`. These are used for identification, logging, and configuration checks.
4.  **Configuration Check:** It checks if the plugin is enabled via application configuration (e.g., `config.plugins.yourPluginName`).
5.  **Instantiation:** If validated and enabled, the `PluginManager` creates an *instance* of the plugin class.
6.  **Initialization:** It calls the `async initialize(config, services)` method on the plugin instance, providing access to the application configuration and core services.
7.  **Tool & Task Collection:** It calls `getAgentTools()` and `getScheduledTaskSetups()` (if implemented) on the instance to collect tools for the AI agent and tasks for the scheduler.
8.  **Storage:** Valid and initialized plugin instances are stored for use throughout the application.

## Developing Plugins

For detailed instructions on how to create your own plugins, including class structure, required properties, lifecycle methods, and troubleshooting, please refer to the comprehensive **[Plugin Development Guide](./plugin_development_guide.md)**.

Understanding the `PluginManager`'s role is helpful, but the development guide contains all the necessary specifics for building plugins. 