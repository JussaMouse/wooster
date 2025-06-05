# Plugin: GmailPlugin

This document details the `GmailPlugin`, which integrates email sending capabilities into Wooster.

## 1. Overview

- **Plugin Name**: `gmail` (as defined in `GmailPluginDefinition.pluginName`)
- **Version**: `1.0.0` (as defined in `src/plugins/gmail/index.ts`)
- **Provider**: `src/plugins/gmail/index.ts`
- **Purpose**: This plugin allows Wooster to send emails using a configured Gmail account. It achieves this by providing the `send_email` structured tool to the agent.

## 2. Tools Provided

The `GmailPlugin` provides the following tool(s) to the agent:

-   **`send_email`**
    -   **Description**: Enables the agent to compose and send emails.
    -   **Type**: `StructuredTool`
    -   **Input Schema**: The tool expects an object with the following properties:
        -   `to` (string, required): The recipient's email address. Can be a comma-separated list for multiple recipients.
        -   `subject` (string, required): The subject of the email.
        -   `body` (string, required): The main content/body of the email.
        -   `isHtml` (boolean, optional): Set to true if the body content is HTML. Defaults to false (plain text).
    -   **Example Usage (Agent's perspective for tool call)**:
        ```json
        {
          "to": "recipient@example.com",
          "subject": "Hello from Wooster",
          "body": "This is a test email sent by Wooster.",
          "isHtml": false
        }
        ```

## 3. Configuration & Setup

For the `GmailPlugin` to function correctly and provide the `send_email` tool, it needs specific configuration details made available through the application's configuration system (typically managed by `configLoader.ts` which may load from `.env` or other sources).

The plugin expects these settings under a `gmail` key in the application config:

-   **`config.gmail.senderEmailAddress`**: Your Gmail address from which Wooster will send emails. This is required for the plugin to operate.
-   **`config.gmail.emailAppPassword`**: The Google App Password for the sender email address. This is required for the plugin to operate.
    -   **How to get a Google App Password**:
        1.  Go to your Google Account (`myaccount.google.com`).
        2.  Navigate to "Security".
        3.  Under "Signing in to Google," make sure "2-Step Verification" is turned ON.
        4.  Below 2-Step Verification, you should see "App passwords." Click on it.
        5.  You might need to sign in again.
        6.  At the bottom, choose "Select app" and pick "Mail".
        7.  Choose "Select device" and pick "Other (Custom name)". Give it a name (e.g., "WoosterApp").
        8.  Click "Generate".
        9.  The 16-character password shown is your App Password. This should be securely stored and made available as `emailAppPassword` in your `gmail` configuration.

The plugin itself is typically enabled by default if present. If you need to explicitly control plugin loading (e.g., for different environments), refer to the general plugin management documentation for Wooster.

## 4. Initialization

- The `GmailPlugin` is discovered and loaded by the `PluginManager` during Wooster's startup sequence if not explicitly disabled by broader application settings.
- Its `initialize` method is called with the global `AppConfig`. During this phase, it checks for the presence of `senderEmailAddress` and `emailAppPassword` within the `config.gmail` object.
- If these details are present, the plugin registers itself as an `EmailService` and its `getAgentTools` method will return the `send_email` `SendEmailStructuredTool` instance to the `AgentExecutorService`. If not configured, the tool will not be available.

## 5. Dependencies

- **`nodemailer`**: Used for the actual email sending functionality.
- **`langchain/tools`**: Specifically, it extends `StructuredTool` to define the `send_email` tool.
- **`zod`**: Used to define the input schema for the `send_email` tool.
- Relies on `AppConfig` (from `src/configLoader.ts` or equivalent) for its configuration settings.

## 6. Notes on `SELF_EMAIL_PLACEHOLDER`

The plugin code contains a constant `SELF_EMAIL_PLACEHOLDER`. While the current implementation doesn't show direct usage of this for substituting a user's personal email, it's good to be aware of its presence if further features around sending emails to "self" are developed. Configuration for such a feature might involve a `userPersonalEmailAddress` in the `config.gmail` settings or through the `UserProfilePlugin`. 