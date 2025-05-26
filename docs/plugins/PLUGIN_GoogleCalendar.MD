# Plugin: GoogleCalendarPlugin

This document details the `GoogleCalendarPlugin`, which integrates Google Calendar functionalities into Wooster.

## 1. Overview

- **Plugin Name**: `GoogleCalendarPlugin`
- **Version**: 0.1.0 (as defined in the plugin file)
- **Provider**: `src/plugins/googleCalendarPlugin.ts`
- **Purpose**: This plugin allows Wooster to interact with Google Calendar to create events and list existing events. It achieves this by providing the `create_calendar_event` and `list_calendar_events` tools to the agent.

## 2. Tools Provided

The `GoogleCalendarPlugin` provides the following tool(s) to the agent:

-   **`create_calendar_event`**
    -   **Description**: Enables the agent to create new events in Google Calendar.
    -   **Detailed Documentation**: See `docs/tools/TOOL_GoogleCalendar.MD` (Tool 1).
-   **`list_calendar_events`**
    -   **Description**: Enables the agent to list existing events from Google Calendar.
    -   **Detailed Documentation**: See `docs/tools/TOOL_GoogleCalendar.MD` (Tool 2).

For complete schemas, agent-facing descriptions, and specific configuration details for these tools, please refer to the main `docs/tools/TOOL_GoogleCalendar.MD` document.

## 3. Configuration

For the `GoogleCalendarPlugin` to function correctly and provide its tools, it needs to be configured via environment variables in your `.env` file:

1.  **Plugin Activation**: 
    -   `PLUGIN_GOOGLECALENDARPLUGIN_ENABLED`: This variable controls whether the `GoogleCalendarPlugin` itself is loaded by Wooster.
        -   Set to `true` (or omit, as plugins are enabled by default if found) to activate the plugin.
        -   Set to `false` to disable the plugin. If disabled, the calendar tools will not be available.
        -   See `06 CONFIG.MD` (section "Plugin Activation") for general plugin management.

2.  **Google Calendar Tool Functionality & Credentials**: 
    -   The actual calendar interaction capabilities provided by this plugin are further controlled by the `TOOLS_GOOGLE_CALENDAR_*` and `GOOGLE_*` credential variables. The plugin checks these during its initialization and when providing tools.
    -   `TOOLS_GOOGLE_CALENDAR_ENABLED`: Must be `true` for the Google Calendar tools to be active and usable by the agent.
    -   `GOOGLE_CLIENT_ID`: Your Google Cloud OAuth 2.0 Client ID.
    -   `GOOGLE_CLIENT_SECRET`: Your Google Cloud OAuth 2.0 Client Secret.
    -   `GOOGLE_CALENDAR_REFRESH_TOKEN`: OAuth 2.0 Refresh Token for Google Calendar access.
    -   `GOOGLE_CALENDAR_ID` (Optional): The ID of the Google Calendar to manage (e.g., `primary`). Defaults to `primary`.
    -   Refer to `docs/tools/TOOL_GoogleCalendar.MD` (section 3) and `06 CONFIG.MD` (section 4b) for comprehensive details on these Google Calendar-specific settings and credentials.

## 4. Initialization

- The `GoogleCalendarPlugin` is discovered and loaded by the `PluginManager` (`src/pluginManager.ts`) during Wooster's startup sequence if not explicitly disabled.
- Its `initialize` method is called with the global `AppConfig`. During this phase, it checks the `TOOLS_GOOGLE_CALENDAR_ENABLED` configuration and attempts to initialize the `googleCalendarClient` using the provided credentials.
- If `TOOLS_GOOGLE_CALENDAR_ENABLED` is `true`, the plugin itself is active, and the `googleCalendarClient` initializes successfully, its `getAgentTools` method will return the `create_calendar_event` and `list_calendar_events` `DynamicTool` instances to the `AgentExecutorService`.
- If client initialization fails (e.g., due to missing or invalid credentials), the tools will not be provided even if the plugin is active and `TOOLS_GOOGLE_CALENDAR_ENABLED` is true.

## 5. Dependencies

- Relies on the Google Calendar API client logic in `src/tools/googleCalendarClient.ts` (which uses the `googleapis` library).
- Depends on `AppConfig` (from `src/configLoader.ts`) for its configuration settings. 