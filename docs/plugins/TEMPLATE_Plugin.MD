# Plugin: [PluginName]

This document details the `[PluginName]`, which integrates [briefly describe functionality] into Wooster.

## 1. Overview

- **Plugin Name**: `[PluginName]` (e.g., MyCoolPlugin)
- **Version**: [PluginVersion] (as defined in `src/plugins/[pluginFileName].ts`)
- **Provider**: `src/plugins/[pluginFileName].ts` (e.g., `src/plugins/myCoolPlugin.ts`)
- **Purpose**: This plugin allows Wooster to [explain the main goal and how it achieves it, e.g., "interact with the XYZ service to perform actions like A and B. It achieves this by providing the `tool_action_a` and `tool_action_b` tools to the agent."]

## 2. Tools Provided

The `[PluginName]` provides the following tool(s) to the agent:

-   **`[tool_name_1]`** (e.g., `do_something_cool`)
    -   **Description**: [Briefly describe what this tool enables the agent to do.]
    -   **Detailed Documentation**: See `docs/tools/TOOL_[ToolName1].MD` for the complete schema, agent-facing description, and specific configuration details.

-   **`[tool_name_2]`** (if applicable)
    -   **Description**: [Briefly describe what this tool enables the agent to do.]
    -   **Detailed Documentation**: See `docs/tools/TOOL_[ToolName2].MD`.

*For complete schemas, agent-facing descriptions, and specific configuration details for these tools, please refer to their individual documentation files linked above.*

## 3. Configuration & Setup

For the `[PluginName]` to function correctly and provide its tools, it needs to be configured via environment variables in your `.env` file.

### 3.1. Plugin Activation

-   **`PLUGIN_[PLUGINNAME_UPPERCASE]_ENABLED`**: This variable controls whether the `[PluginName]` itself is loaded by Wooster (e.g., `PLUGIN_MYCOOLPLUGIN_ENABLED`).
    -   Set to `true` (or omit, as plugins are enabled by default if found) to activate the plugin.
    -   Set to `false` to disable the plugin. If disabled, its tools will not be available, regardless of other settings.
    -   *Reference*: See `docs/config.md` (section "Plugin Activation") for general plugin management.

### 3.2. [Service/Tool] Functionality & Credentials

Describe the specific environment variables needed for this plugin's tools to function. This often includes an enablement flag for the feature set and any necessary API keys or credentials.

-   **`TOOLS_[SERVICENAME_UPPERCASE]_ENABLED`** (e.g., `TOOLS_MYCOOLSERVICE_ENABLED`):
    -   **Description**: Set to `true` for the [Service Name] tools provided by this plugin to be active and usable by the agent.
    -   **Required**: Typically Yes, if the plugin offers tools that depend on this service.

-   **`[SERVICENAME_UPPERCASE]_API_KEY`** (or similar, e.g., `MYCOOLSERVICE_API_KEY`):
    -   **Description**: Your API key for the [Service Name] service.
    -   **Required**: Yes, if `TOOLS_[SERVICENAME_UPPERCASE]_ENABLED=true`.
    -   **How to get credentials**: [Provide a brief step-by-step guide or a link to the official documentation where users can obtain these credentials. For example: 
        1. Go to [Service Website URL, e.g., `developer.mycoolservice.com`].
        2. Sign up or log in.
        3. Navigate to the "API Keys" or "Developer Settings" section.
        4. Generate a new API key.
        5. Copy the key and use it for this environment variable.]

-   **Other specific variables** (e.g., `[SERVICENAME_UPPERCASE]_USER_ID`, `[SERVICENAME_UPPERCASE]_ENDPOINT_URL`):
    -   **Description**: [Explain purpose]
    -   **Required**: [Yes/No/If applicable]

*Reference*: See the individual `docs/tools/TOOL_[ToolName].MD` files and `docs/config.md` for comprehensive details on all related settings.

## 4. Initialization

- The `[PluginName]` is discovered and loaded by the `PluginManager` (`src/pluginManager.ts`) during Wooster's startup sequence if not explicitly disabled via `PLUGIN_[PLUGINNAME_UPPERCASE]_ENABLED=false`.
- Its `initialize(config: AppConfig)` method (if implemented) is called with the global `AppConfig`. During this phase, it typically:
    - Checks its own enablement status (e.g., via `config.tools.[serviceName]?.enabled`).
    - Initializes any necessary API clients or services using credentials from `AppConfig`.
    - Logs its status (e.g., initialized, disabled, or error during initialization).
- If the plugin is active, its specific tool(s) are enabled in the configuration, and any necessary clients are initialized successfully, its `getAgentTools()` method will return the `DynamicTool` instances to the `AgentExecutorService`.
- If client initialization fails (e.g., due to missing or invalid credentials), the tools will not be provided even if the plugin is active and its features are marked as enabled.

## 5. Dependencies

-   Relies on [mention any core logic files, e.g., API client in `src/tools/[serviceName]Client.ts` (if applicable)].
-   Depends on `AppConfig` (from `src/configLoader.ts`) for its configuration settings.
-   [List any other significant external libraries if not already covered by core Wooster, e.g., specific SDKs for the service it integrates.]

## 6. (Optional) FAQs / Troubleshooting

-   **Q: My plugin's tools aren't showing up. What should I check?**
    -   A: 1. Ensure `PLUGIN_[PLUGINNAME_UPPERCASE]_ENABLED` is `true` or not set in your `.env`.
        2. Ensure `TOOLS_[SERVICENAME_UPPERCASE]_ENABLED` (or equivalent) is `true`.
        3. Check that all required API keys/credentials are correctly set in `.env`.
        4. Look for error messages in the console log during Wooster startup, particularly from `[PluginName]` or `PluginManager`.

-   **Q: [Another common question specific to this plugin's setup or usage.]**
    -   A: [Answer] 