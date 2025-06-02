# 03 Wooster Plugins: Extending Capabilities

This guide explains how to extend Wooster's functionalities by creating plugins. Plugins serve as modular packages to introduce a wide range of features, including:

-   **Agent Tools**: New capabilities the AI agent can use directly.
-   **Services**: Background functionalities or APIs that other plugins or core Wooster can utilize.
-   **Scheduled Tasks**: Operations that run automatically on a predefined schedule.

For general Wooster configuration, see `06 CONFIG.MD`. For documentation on specific plugins already created, refer to the files in the `docs/plugins/` directory (e.g., `docs/plugins/PLUGIN_Gmail.MD`).

## 1. The `WoosterPlugin` Interface

All plugins must export a default object that implements the `WoosterPlugin` interface, defined in `src/types/plugin.ts`:

```typescript
import { DynamicTool } from "@langchain/core/tools";
import { AppConfig } from "./configLoader"; // Path relative to src/types/plugin.ts
import { CoreServices } from "./plugin"; // Self-reference for CoreServices
import { ScheduledTaskSetupOptions } from "./scheduler"; // Path relative to src/types/plugin.ts

export interface WoosterPlugin {
  readonly name: string;
  readonly version: string;
  readonly description: string;

  initialize?: (config: AppConfig, services: CoreServices) => Promise<void>;
  getAgentTools?: () => DynamicTool[];
  getScheduledTaskSetups?: () => ScheduledTaskSetupOptions | ScheduledTaskSetupOptions[];
  
  // Other lifecycle methods (e.g., onShutdown) could be added here if needed.
}

export interface CoreServices {
  getConfig: () => AppConfig;
  log: (level: LogLevel, message: string, ...args: any[]) => void;
  registerService: (name: string, service: any) => void;
  getService: (name: string) => any | undefined;
  emailService?: EmailService; // Example of a directly accessible registered service
  // Other direct accessors for commonly used services can be added
}

// (Other related interfaces like EmailService, LogLevel, ScheduledTaskSetupOptions would be defined elsewhere or imported)
```

Key aspects of the `WoosterPlugin` interface:
-   `name`, `description`, `version`: Essential metadata.
-   `initialize?(config: AppConfig, services: CoreServices)`: Optional. Called once when the plugin loads. Use this to:
    -   Perform any setup (e.g., initializing API clients).
    -   Access application configuration via `config`.
    -   Register services using `services.registerService("MyServiceName", myServiceInstance)`. These services can then be accessed by other plugins via `services.getService("MyServiceName")`.
-   `getAgentTools?(): DynamicTool[]`: Optional. Returns an array of `DynamicTool` instances if the plugin extends the agent's direct capabilities.
-   `getScheduledTaskSetups?(): ScheduledTaskSetupOptions | ScheduledTaskSetupOptions[]`: Optional. Returns configurations for tasks to be managed by Wooster's central scheduler.

## 2. Core Ways Plugins Extend Wooster

Plugins are the recommended way to introduce new functionalities to Wooster.

### a. Providing Agent Tools

If your plugin needs to give the AI agent a new skill it can directly invoke:
-   **Implement `getAgentTools()`**: Return an array of configured `DynamicTool` objects.
-   **`DynamicTool`**: Each tool needs:
    -   `name`: A unique, descriptive string (e.g., `send_jira_ticket`, `query_stock_price`).
    -   `description`: **Crucially important.** This tells the AI agent what your tool does, when it should be used, its expected input, and its output format.
    -   `func`: An `async` function containing the tool's logic.
-   **Integration**: Tools are collected by `pluginManager.ts` and made available to `agentExecutorService.ts`.

### b. Providing Services

Plugins can offer reusable services to other parts of the application:
-   **Implement within the plugin**: Define your service class or functions.
-   **Register in `initialize()`**: Use `coreServices.registerService("YourServiceName", serviceInstance)` during plugin initialization.
-   **Consumption**: Other plugins (or core Wooster modules) can access your service via `coreServices.getService("YourServiceName")` typically within their own `initialize()` method or at runtime if `CoreServices` is available.
-   **Example**: The Gmail plugin registers an `EmailService`, which the Daily Review plugin then uses to send emails.

### c. Providing Scheduled Tasks

Plugins can define tasks to be run automatically:
-   **Implement `getScheduledTaskSetups()`**: Return one or more `ScheduledTaskSetupOptions` objects.
-   **`ScheduledTaskSetupOptions`**: Defines:
    -   `taskKey`: A unique identifier for the task.
    -   `description`: User-friendly summary.
    -   `defaultScheduleExpression`: A cron string for the schedule.
    -   `functionToExecute`: The actual async function within your plugin that will be called.
    -   `executionPolicy`: How to handle missed schedules.
    -   Other options like `configKeyForSchedule` (to allow user overrides via `.env`) and `initialPayload`.
-   **Integration**: `pluginManager.ts` collects these setups and uses `schedulerService.ts` to manage and execute them. The scheduled function can be an internal plugin function or it can trigger an agent prompt (which might then use agent tools).

## 3. Creating a New Plugin: Step-by-Step (Example: Weather Feature)

Let's illustrate with a plugin that provides weather information. This plugin will:
1.  Offer an agent tool (`get_current_weather`).
2.  Potentially register a `WeatherService` (though not fully implemented in this brief example).
3.  Set up a scheduled task (e.g., to log daily weather summary).

**Step 1: Create the Plugin Directory and File**

Create `src/plugins/myWeather/index.ts`.

**Step 2: Implement the `WoosterPlugin` Interface**

```typescript
// src/plugins/myWeather/index.ts
import { DynamicTool } from "@langchain/core/tools";
import { AppConfig } from "../../configLoader"; // Adjusted path
import { WoosterPlugin, CoreServices } from "../../types/plugin";  // Adjusted path
import { ScheduledTaskSetupOptions } from "../../types/scheduler"; // Adjusted path
import { log, LogLevel } from "../../logger";     // Adjusted path

// --- Internal Service Logic (Conceptual) ---
interface WeatherData { temperature: number; condition: string; }
class MyWeatherService {
  private apiKey: string | undefined;
  constructor(apiKey?: string) { this.apiKey = apiKey; }
  async fetchWeather(location: string): Promise<WeatherData | string> {
    if (!this.apiKey) return "Weather Service API key not configured.";
    // Actual API call logic here
    log(LogLevel.DEBUG, `MyWeatherService: Fetching weather for ${location}`);
    return { temperature: 25, condition: "sunny" }; 
  }
  async getDailySummary(location: string): Promise<string> {
    const weather = await this.fetchWeather(location);
    if (typeof weather === 'string') return weather;
    return `Daily summary for ${location}: ${weather.condition}, ${weather.temperature}°C.`;
  }
}
// --- End Internal Service Logic ---

let weatherApiKey: string | undefined;
let core: CoreServices | null = null; // Store CoreServices if needed by other functions
let internalWeatherService: MyWeatherService | null = null;

const MyWeatherPlugin: WoosterPlugin = {
  name: "myWeather", // Keep names simple, often matches directory
  version: "0.1.0",
  description: "Provides weather information, tools, and scheduled summaries.",

  async initialize(config: AppConfig, services: CoreServices) {
    core = services; // Save CoreServices
    weatherApiKey = config.weather?.openWeatherMapApiKey; // Example: using top-level config
    
    internalWeatherService = new MyWeatherService(weatherApiKey);
    // Optionally register the service if other plugins might need it
    // services.registerService("MyWeatherService", internalWeatherService);

    if (config.plugins[this.name] && !weatherApiKey) {
      log(LogLevel.WARN, "MyWeatherPlugin: Enabled but API key (config.weather.openWeatherMapApiKey) is missing.");
    }
    log(LogLevel.INFO, `MyWeatherPlugin initialized. Enabled via config.plugins: ${config.plugins[this.name]}`);
  },

  getAgentTools: () => {
    const config = core?.getConfig();
    if (!config?.plugins["myWeather"] || !weatherApiKey || !internalWeatherService) {
      return [];
    }
    
    const serviceInstance = internalWeatherService; // Closure for the tool

    const getWeatherTool = new DynamicTool({
      name: "get_current_weather",
      description: "Fetches the current weather for a specified location. Input should be the city name (e.g., \"London\").",
      func: async (location: string) => {
        if (!location) return "Location must be provided to get weather.";
        const weatherData = await serviceInstance.fetchWeather(location);
        if (typeof weatherData === 'string') return weatherData;
        return `The weather in ${location} is ${weatherData.condition} at ${weatherData.temperature}°C.`;
      },
    });
    return [getWeatherTool];
  },

  getScheduledTaskSetups: () => {
    const config = core?.getConfig();
    if (!config?.plugins["myWeather"] || !internalWeatherService) {
        return []; // Don't provide tasks if plugin disabled or service not ready
    }
    const serviceInstance = internalWeatherService; // Closure for the task

    const dailyWeatherLog: ScheduledTaskSetupOptions = {
        taskKey: "myWeather.logDailySummary",
        description: "Logs a daily weather summary for a configured city.",
        defaultScheduleExpression: "0 7 * * *", // Every day at 7 AM
        // configKeyForSchedule: "plugins.myWeather.summarySchedule", // Optional: allow user override
        functionToExecute: async (payload?: any) => {
            const city = payload?.city || config?.weather?.city || "DefaultCity";
            log(LogLevel.INFO, `MyWeatherPlugin: Running scheduled task to log weather for ${city}.`);
            const summary = await serviceInstance.getDailySummary(city);
            log(LogLevel.INFO, `MyWeatherPlugin Daily Summary for ${city}: ${summary}`);
        },
        executionPolicy: 'DEFAULT_SKIP_MISSED',
        initialPayload: { city: config?.weather?.city } // Can use city from main config
    };
    return [dailyWeatherLog];
  }
};

export default MyWeatherPlugin;
```

**Step 3: Configure in `.env` and `configLoader.ts`**

-   **.env:**
    ```env
    # Enable/disable the plugin itself (true by default if directory exists and has index.ts)
    # PLUGIN_MYWEATHER_ENABLED=true # true is default if plugin dir exists

    # Plugin-specific configuration (example from existing weather plugin)
    WEATHER_OPENWEATHERMAPAPIKEY="your_weather_service_api_key_here"
    WEATHER_CITY="London"
    ```
-   **`configLoader.ts`**: Ensure `AppConfig` has a structure like `weather: { openWeatherMapApiKey?: string; city?: string; }` and that `configLoader.ts` loads these environment variables into it. The `PLUGIN_MYWEATHER_ENABLED` is automatically handled by `pluginManager.ts` checking `config.plugins["myWeather"]`.

**Step 4: Document Your Plugin**

-   Create `docs/plugins/PLUGIN_MyWeather.MD`: Describe the plugin, its purpose, setup (API keys), features (tools, services, scheduled tasks).
-   If it provides tools, create `docs/tools/TOOL_YourToolName.MD` for each.
-   Update `06 CONFIG.MD` for any new environment variables specific to this plugin's features (like `WEATHER_OPENWEATHERMAPAPIKEY`).

**Step 5: Restart Wooster**

Wooster will discover your new plugin. If `config.plugins["myWeather"]` is not explicitly set to `false` (or if `PLUGIN_MYWEATHER_ENABLED=false` is not in `.env`), it will be loaded. Its tools, services, and scheduled tasks will become active if their internal conditions (e.g., API key presence) are met.

## 4. Best Practices for Plugin Development

-   **Clear Naming**: Use a unique, descriptive `name` for your plugin (e.g., `myWeather`, `jiraIntegration`). Lower camelCase or simple lowercase for the directory and plugin name property is common.
-   **Scope Definition**: Clearly define what your plugin does. Is it primarily an agent tool provider, a background service, a set of scheduled tasks, or a mix?
-   **Tool Descriptions are Key**: For agent tools, write very clear, concise, and accurate `description` strings.
-   **Modular Logic**: For complex features, separate logic into dedicated files or classes within your plugin's directory.
-   **Configuration**: Use environment variables (loaded via `src/configLoader.ts` into `AppConfig`) for API keys, URLs, and feature flags. The `pluginManager.ts` uses `config.plugins[pluginName]` (from `PLUGIN_[NAME]_ENABLED` env var) as the primary switch for loading a plugin's features.
-   **Error Handling**: Implement robust error handling. For agent tools, return informative error messages as strings. For services and scheduled tasks, log errors appropriately.
-   **Idempotency & Safety**: Consider the nature of actions performed.
-   **Comprehensive Documentation**.

## 5. Plugin Activation & Management

-   Plugins placed in subdirectories of `src/plugins/` (each with an `index.ts` or `index.js` exporting a default `WoosterPlugin`) are automatically discovered by `pluginManager.ts`.
-   **Enabled by Default Logic**: A plugin is considered for loading if its directory exists. It becomes fully active if `config.plugins[plugin.name]` is not `false`. This value is typically derived from an environment variable like `PLUGIN_[PLUGIN_NAME_IN_UPPERCASE]_ENABLED=true/false`. If the variable is not set, it defaults to `true` (meaning the plugin features are loaded if the plugin directory exists).
-   **Disabling a Plugin's Features**: To prevent a discovered plugin from initializing or providing its tools/tasks, set the environment variable:
    `PLUGIN_[PLUGIN_NAME_IN_UPPERCASE]_ENABLED=false`
    (e.g., `PLUGIN_MYWEATHER_ENABLED=false` for a plugin named `myWeather`). The `pluginName` used in `config.plugins[pluginName]` corresponds to the `name` property in your plugin definition.

## 6. Advanced Considerations

-   **Inter-Plugin Dependencies**: If Plugin A needs a service from Plugin B, ensure Plugin B registers its service in `initialize()`, and Plugin A retrieves it using `coreServices.getService()` in its own `initialize()`. The loading order of plugins is based on directory reading order, which is usually alphabetical but not strictly guaranteed for complex dependency chains. For robust dependencies, check for service availability.
-   **Shared Types**: Place shared type definitions in `src/types/` (e.g., `src/types/plugin.ts`, `src/types/scheduler.ts`).

This revised documentation should provide a clearer and more comprehensive guide for developing various types of plugins for Wooster.
