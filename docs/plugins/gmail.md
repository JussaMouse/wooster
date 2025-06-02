# Plugin: GmailPlugin

This document details the `GmailPlugin`, which integrates email sending capabilities into Wooster.

## 1. Overview

- **Plugin Name**: `GmailPlugin`
- **Version**: 0.1.0 (as defined in `src/plugins/gmailPlugin.ts`)
- **Provider**: `src/plugins/gmailPlugin.ts`
- **Purpose**: This plugin allows Wooster to send emails using a configured Gmail account. It achieves this by providing the `sendEmail` tool to the agent.

## 2. Tools Provided

The `GmailPlugin` provides the following tool(s) to the agent:

-   **`sendEmail`**
    -   **Description**: Enables the agent to compose and send emails.
    -   **Detailed Documentation**: See `docs/tools/TOOL_Email.MD` for the complete schema, agent-facing description, and specific configuration details for the `sendEmail` tool itself.

## 3. Configuration & Setup

For the `GmailPlugin` to function correctly and provide the `sendEmail` tool, it needs to be configured via environment variables in your `.env` file.

### 3.1. Plugin Activation

-   **`PLUGIN_GMAILPLUGIN_ENABLED`**: This variable controls whether the `GmailPlugin` itself is loaded by Wooster.
    -   Set to `true` (or omit, as plugins are enabled by default if found) to activate the plugin.
    -   Set to `false` to disable the plugin. If disabled, the `sendEmail` tool will not be available, regardless of other settings.
    -   *Reference*: See `06 CONFIG.MD` (section "Plugin Activation") for general plugin management.

### 3.2. Email Tool Functionality & Credentials

The actual email sending capability provided by this plugin is further controlled by the `TOOLS_EMAIL_*` variables. The plugin checks these during its initialization and when providing the tool.

-   **`TOOLS_EMAIL_ENABLED`**: Must be `true` for the `sendEmail` tool to be active and usable by the agent.
-   **`TOOLS_EMAIL_SENDER_EMAIL_ADDRESS`**: Your Gmail address from which Wooster will send emails. **(Required if `TOOLS_EMAIL_ENABLED=true`)**
-   **`TOOLS_EMAIL_EMAIL_APP_PASSWORD`**: The Google App Password for the sender email address. **(Required if `TOOLS_EMAIL_ENABLED=true`)**
    -   **How to get a Google App Password**: 
        1. Go to your Google Account (`myaccount.google.com`).
        2. Navigate to "Security".
        3. Under "Signing in to Google," make sure "2-Step Verification" is turned ON.
        4. Below 2-Step Verification, you should see "App passwords." Click on it.
        5. You might need to sign in again.
        6. At the bottom, choose "Select app" and pick "Mail".
        7. Choose "Select device" and pick "Other (Custom name)". Give it a name (e.g., "WoosterCLI").
        8. Click "Generate".
        9. The 16-character password shown is your App Password. Copy this and use it for `TOOLS_EMAIL_EMAIL_APP_PASSWORD`.
-   **`TOOLS_EMAIL_USER_PERSONAL_EMAIL_ADDRESS`** (Optional): User's personal email for the `SELF_EMAIL_RECIPIENT` feature.

*Reference*: See `docs/tools/TOOL_Email.MD` (section 6) and `06 CONFIG.MD` (section "Email Tool") for comprehensive details on these email-specific settings.

## 4. Initialization

- The `GmailPlugin` is discovered and loaded by the `PluginManager` (`src/pluginManager.ts`) during Wooster's startup sequence if not explicitly disabled.
- Its `initialize` method is called with the global `AppConfig`. During this phase, it checks the `TOOLS_EMAIL_ENABLED` configuration.
- If `TOOLS_EMAIL_ENABLED` is `true` and the plugin itself is active, its `getAgentTools` method will return the `sendEmail` `DynamicTool` instance to the `AgentExecutorService`.

## 5. Dependencies

- Relies on the core email sending logic in `src/tools/email.ts` (which uses `nodemailer`).
- Depends on `AppConfig` (from `src/configLoader.ts`) for its configuration settings. 