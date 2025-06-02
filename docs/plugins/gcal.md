# Plugin: GCalPlugin

This document details the `GCalPlugin`, which integrates Google Calendar functionalities into Wooster.

## 1. Overview

- **Plugin Name**: `gcal` (as defined in `GCalPluginDefinition`)
- **Version**: `1.1.0` (as defined in the plugin file)
- **Provider**: `src/plugins/gcal/index.ts`
- **Purpose**: This plugin allows Wooster to interact with Google Calendar. It provides agent tools for creating and listing events, and it exposes services for other plugins to use these functionalities directly.

## 2. Services Provided

The `GCalPlugin` registers the following services for use by other plugins:

-   **`CreateCalendarEventService`**
    -   **Description**: Creates a new event in Google Calendar.
    -   **Input Type**: `CreateEventOptions` (from `src/plugins/gcal/types.ts`)
    -   **Output Type**: `Promise<string | GCalEventData>` (Returns `GCalEventData` on success, or an error string on failure).
-   **`ListCalendarEventsService`**
    -   **Description**: Lists events from Google Calendar based on specified options.
    -   **Input Type**: `ListEventsOptions` (optional, from `src/plugins/gcal/types.ts`)
    -   **Output Type**: `Promise<string | GCalEventData[]>` (Returns an array of `GCalEventData` on success, a string message if no events are found, or an error string on failure).

## 3. Agent Tools Provided

The `GCalPlugin` provides the following tool(s) to the agent if enabled and correctly configured:

-   **`create_calendar_event`**
    -   **Description**: Enables the agent to create new events in Google Calendar. Input is a JSON string with event options. Returns the created event data as a JSON string.
    -   **Detailed Documentation**: See `docs/tools/TOOL_GoogleCalendar.MD` (Tool 1), if available, or refer to `CreateEventOptions` in `src/plugins/gcal/types.ts` for input structure.
-   **`get_calendar_events`** (Formerly `list_calendar_events` in some older docs)
    -   **Description**: Enables the agent to list existing events from Google Calendar. Optional input is a JSON string with listing options. Returns event data as a JSON string.
    -   **Detailed Documentation**: See `docs/tools/TOOL_GoogleCalendar.MD` (Tool 2), if available, or refer to `ListEventsOptions` in `src/plugins/gcal/types.ts` for input structure.

*(Note: A `create_calendar` tool mentioned in older documentation is not currently implemented in this plugin version.)*

For input schemas, refer to `CreateEventOptions` and `ListEventsOptions` in `src/plugins/gcal/types.ts`.

## 4. Configuration

For the `GCalPlugin` to function correctly and provide its services and tools, it needs to be configured via environment variables in your `.env` file:

1.  **Plugin Activation**: 
    -   `PLUGIN_GCAL_ENABLED`: This variable controls whether the `GCalPlugin` itself is loaded by Wooster.
        -   Set to `true` to activate the plugin.
        -   Set to `false` (or omit, as the default is `false`) to disable the plugin. If disabled, the calendar services and tools will not be available.
        -   See main configuration documentation (e.g., `06 CONFIG.MD` or `README.md`) for general plugin management.

2.  **Google API Credentials**: 
    -   The plugin requires Google OAuth credentials to interact with the Calendar API.
    -   `GOOGLE_CLIENT_ID`: Your Google Cloud OAuth 2.0 Client ID.
    -   `GOOGLE_CLIENT_SECRET`: Your Google Cloud OAuth 2.0 Client Secret.
    -   `GOOGLE_CALENDAR_REFRESH_TOKEN`: OAuth 2.0 Refresh Token for Google Calendar access.
    -   `GOOGLE_CALENDAR_ID` (Optional): The ID of the Google Calendar to manage (e.g., `primary`). Defaults to `primary`.
    -   Refer to the main configuration documentation for details on obtaining these credentials.

*(Note: The environment variable `TOOLS_GOOGLE_CALENDAR_ENABLED` mentioned in older documentation is no longer used by this plugin. Enablement is controlled by `PLUGIN_GCAL_ENABLED` and the presence of valid credentials.)*

## 5. Initialization

- The `GCalPlugin` is discovered and loaded by the `PluginManager` (`src/pluginManager.ts`) during Wooster's startup if `PLUGIN_GCAL_ENABLED=true`.
- Its `initialize` method is called with the global `AppConfig`. During this phase, it attempts to initialize the Google Calendar API client using the provided credentials.
- If client initialization is successful, it registers the `CreateCalendarEventService` and `ListCalendarEventsService`.
- If the plugin is active and the client initializes successfully, its `getAgentTools` method will return the `create_calendar_event` and `get_calendar_events` `DynamicTool` instances.
- If client initialization fails (e.g., due to missing or invalid credentials), the services will not be registered, and tools will not be provided.

## 6. Dependencies

- Uses the `googleapis` library for Google Calendar API interaction.
- Defines its types in `src/plugins/gcal/types.ts`.
- Depends on `AppConfig` (from `src/configLoader.ts`) for its configuration settings. 