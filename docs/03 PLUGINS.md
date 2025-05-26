# 03 Wooster Plugins: Extending Capabilities

This guide explains how to extend Wooster's functionalities by creating plugins. The primary way plugins enhance Wooster is by providing new **Agent Tools**, which the AI agent can then use to perform a wider range of tasks and interactions.

While plugins can theoretically incorporate other lifecycle hooks, their main role in the current architecture is to serve as modular packages for delivering new tools to the agent.

For general Wooster configuration, see `06 CONFIG.MD`. For documentation on specific plugins already created, refer to the files in the `docs/plugins/` directory (e.g., `docs/plugins/PLUGIN_Gmail.MD`).

## 1. The `WoosterPlugin` Interface

All plugins must export a default object that implements the `WoosterPlugin` interface, defined in `src/pluginTypes.ts`:

```typescript
import { DynamicTool } from "@langchain/core/tools";
import { AppConfig } from "./configLoader"; // Path relative to src/pluginTypes.ts

export interface WoosterPlugin {
  /** The unique name of the plugin (e.g., "GmailPlugin", "GoogleCalendarPlugin") */
  name: string;
  /** A brief description of what the plugin does. */
  description: string;
  /** The version of the plugin. */
  version: string;

  /**
   * Optional asynchronous initialization function for the plugin.
   * This is called once by the PluginManager when the plugin is loaded.
   * @param config The global application configuration.
   */
  initialize?: (config: AppConfig) => Promise<void>;

  /**
   * Optional method to provide a list of agent tools (LangChain DynamicTool instances)
   * that this plugin makes available to the agent.
   * These tools will be aggregated by the PluginManager and made available to the AgentExecutorService.
   * @returns An array of DynamicTool instances, or undefined if the plugin provides no tools.
   */
  getAgentTools?: () => DynamicTool[];

  // Other lifecycle methods (e.g., onShutdown) could be added here if needed in the future.
}
```

Key methods:
-   `name`, `description`, `version`: Essential metadata for identifying and describing the plugin.
-   `initialize(config: AppConfig)`: Called once when the plugin loads. Use this to perform any setup, like initializing API clients or checking configurations using the provided `AppConfig`.
-   `getAgentTools(): DynamicTool[]`: This is the **core method** for plugins that add capabilities. It should return an array of `DynamicTool` instances that the agent can use.

## 2. Core Concept: Plugins as Tool Providers

Plugins are the recommended way to introduce new tools (skills) to Wooster's agent.

-   **`getAgentTools()`**: When your plugin is loaded, `pluginManager.ts` will call this method. You should return an array of configured `DynamicTool` objects.
-   **`DynamicTool`**: Each tool you define needs:
    -   `name`: A unique, descriptive string (e.g., `send_jira_ticket`, `query_stock_price`). This is how the agent refers to the tool.
    -   `description`: **Critically important.** This text tells the AI agent what your tool does, when it should be used, what kind of input it expects, and what output it produces. The agent's ability to correctly choose and use your tool depends almost entirely on the clarity and accuracy of this description.
    -   `func`: An `async` function that contains the actual logic for your tool. It takes an input (usually a string or an object parsed from a string) and returns a string result (the "observation") back to the agent.
-   **Integration**: Tools provided by active plugins are collected by `pluginManager.ts` and then passed to `agentExecutorService.ts`, making them available to the main agent.

## 3. Creating a New Plugin: Step-by-Step

Here's how to create a new plugin, for instance, one that interacts with a hypothetical "WeatherService":

**Step 1: Create the Plugin File**

Create `src/plugins/weatherPlugin.ts`.

**Step 2: Implement the `WoosterPlugin` Interface**

```typescript
// src/plugins/weatherPlugin.ts
import { DynamicTool } from "@langchain/core/tools";
import { AppConfig } from "../configLoader"; // Adjust path as necessary
import { WoosterPlugin } from "../pluginTypes";  // Adjust path as necessary
import { log, LogLevel } from "../logger";     // Adjust path as necessary

// Hypothetical function to get weather (could be in src/tools/weatherClient.ts)
async function fetchWeather(location: string, apiKey?: string): Promise<string> {
  if (!apiKey) return "Weather Service API key not configured.";
  // Actual API call logic here
  return `The weather in ${location} is sunny.`; 
}

let weatherApiKey: string | undefined;

const WeatherPlugin: WoosterPlugin = {
  name: "WeatherPlugin",
  version: "0.1.0",
  description: "Provides tools to get current weather information.",

  async initialize(config: AppConfig) {
    weatherApiKey = config.tools.weather?.apiKey; // Assuming AppConfig structure
    if (config.tools.weather?.enabled && !weatherApiKey) {
      log(LogLevel.WARN, "WeatherPlugin: Enabled but API key is missing.");
    }
    log(LogLevel.INFO, `WeatherPlugin initialized. Weather tools enabled: ${config.tools.weather?.enabled}`);
  },

  getAgentTools: () => {
    // Only provide tools if the feature is enabled in config AND API key is present
    const config = globalThis.appConfig; // Or get it from a module-scoped variable set in initialize
    if (!config?.tools.weather?.enabled || !weatherApiKey) {
      return [];
    }

    const getWeatherTool = new DynamicTool({
      name: "get_current_weather",
      description: "Fetches the current weather for a specified location. Input should be the city name (e.g., \"London\") or city and country (e.g., \"Paris, FR\").",
      func: async (input: string) => {
        if (!input) return "Location must be provided to get weather.";
        return fetchWeather(input, weatherApiKey);
      },
    });

    return [getWeatherTool];
  }
};

export default WeatherPlugin;
```
*(Note: Accessing `globalThis.appConfig` as shown above is a simplification; ensure `appConfig` is properly accessible, e.g., by storing it from `initialize` in a module-scoped variable if your `getAgentTools` is not a closure over it.)*

**Step 3: Configure in `.env`**

Add relevant variables to your `.env` file:

```env
# Enable/disable the plugin itself (optional, enabled by default if present)
# PLUGIN_WEATHERPLUGIN_ENABLED=true

# Enable/disable the weather tools provided by the plugin
TOOLS_WEATHER_ENABLED=true

# Plugin-specific configuration
TOOLS_WEATHER_API_KEY="your_weather_service_api_key_here"
```
*(`configLoader.ts` would need to be updated to load `TOOLS_WEATHER_ENABLED` and `TOOLS_WEATHER_API_KEY` into `AppConfig.tools.weather`)*

**Step 4: Document Your Plugin and its Tools**

-   Create `docs/plugins/PLUGIN_WeatherPlugin.MD`: Describe the plugin, its purpose, setup instructions (including how to get an API key if necessary), and list the tools it provides, linking to their detailed documentation.
-   Create `docs/tools/TOOL_GetCurrentWeather.MD`: Detail the `get_current_weather` tool's schema, agent-facing description, input/output examples, etc.
-   Update `04 TOOLS.MD` to include `get_current_weather` in the list of available tools.
-   Update `06 CONFIG.MD` to document the new `TOOLS_WEATHER_ENABLED` and `TOOLS_WEATHER_API_KEY` environment variables.

**Step 5: Restart Wooster**

Wooster will discover your new plugin. If enabled and configured correctly, its tools will be available to the agent.

## 4. Best Practices for Plugin Development

-   **Clear Naming**: Use a unique, descriptive `name` for your plugin (e.g., `WeatherPlugin`, `JiraIntegrationPlugin`). PascalCase is conventional.
-   **Tool Descriptions are Key**: Write very clear, concise, and accurate `description` strings for each tool. This is the primary information the AI agent uses to decide when and how to use your tool.
-   **Modular Logic**: For complex tools, separate the core logic into dedicated files (e.g., an API client in `src/tools/myApiClient.ts`) and have the tool's `func` call these. This keeps the plugin file cleaner.
-   **Configuration**: Always use environment variables (loaded via `src/configLoader.ts` into `AppConfig`) for API keys, service URLs, and feature flags. Never hardcode sensitive information.
-   **Error Handling**: Implement robust error handling within your tool's `func`. Return informative error messages as strings to the agent if something goes wrong.
-   **Comprehensive Documentation**: Good documentation is crucial.
    -   Each plugin should have its own `docs/plugins/PLUGIN_YourName.MD`.
    -   Each tool provided by a plugin should have its own `docs/tools/TOOL_YourToolName.MD`.
    -   Ensure `04 TOOLS.MD` and `06 CONFIG.MD` are updated.
-   **Idempotency & Safety**: Consider the nature of your tools. If they perform actions (e.g., creating a calendar event), ensure they handle retries gracefully or are designed to be idempotent if possible.

## 5. Plugin Activation & Management

-   Plugins placed in the `src/plugins/` directory are automatically discovered by `pluginManager.ts`.
-   **Enabled by Default**: Discovered plugins are active by default.
-   **Disabling a Plugin**: To disable a specific plugin, add an environment variable to your `.env` file:
    `PLUGIN_[PLUGIN_NAME_UPPERCASE]_ENABLED=false`
    (e.g., `PLUGIN_WEATHERPLUGIN_ENABLED=false` to disable `WeatherPlugin`).
    The `[PLUGIN_NAME_UPPERCASE]` should match the `name` property of your plugin, converted to uppercase.

## 6. Legacy Lifecycle Hooks

The previous plugin system focused on lifecycle hooks like `onInit`, `onUserInput`, and `onAssistantResponse`. While the `WoosterPlugin` interface can be extended to include such methods if a specific, rare use case arises, the primary and recommended way to extend Wooster's core capabilities and behaviors is by providing **Agent Tools** as described above. Direct manipulation of user input or assistant responses via hooks is discouraged as it can interfere with the agent's reasoning.

---
By focusing on plugins as providers of well-described tools, we create a modular, extensible, and maintainable system for enhancing Wooster's intelligence and capabilities.
