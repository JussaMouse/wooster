# 06 CONFIG.MD: Wooster Configuration

Wooster uses a single JSON file named `config.json`, located in the project root, for managing all its core operational settings and credentials. If this file does not exist when Wooster starts, a default one will be created. **You MUST edit this file after its creation, especially to provide your `openai.apiKey`.**

## Configuration File: `config.json`

This file allows you to customize:

1.  **OpenAI Settings** (`openai` section): API key, model name.
2.  **Logging Settings** (`logging` section): Console and file log levels, log file path, and agent LLM interaction logging.
3.  **Email Tool Settings** (`email` section): Enablement, sender address, and app password.
4.  **User Contextual Memory (UCM)** (`ucm` section): Enablement and extractor prompt.
5.  **Plugin Activation** (`plugins` section).

### Default `config.json` Structure

If `config.json` is not found, Wooster will create it with the following default content. You will need to edit this, particularly `openai.apiKey`.

```json
{
  "openai": {
    "apiKey": "YOUR_OPENAI_API_KEY_HERE",
    "modelName": "gpt-4o-mini"
  },
  "logging": {
    "consoleLogLevel": "INFO",
    "fileLogLevel": "INFO",
    "logFile": "wooster_session.log",
    "logAgentLLMInteractions": false
  },
  "email": {
    "enabled": false,
    "sendingEmailAddress": null,
    "userPersonalEmailAddress": null,
    "emailAppPassword": null
  },
  "ucm": {
    "enabled": false,
    "extractorLlmPrompt": null
  },
  "plugins": {}
}
```

### Configuration Sections Explained

#### 1. `openai`

Controls settings related to the OpenAI API.

-   `openai.apiKey` (string):
    -   **Required.** Your OpenAI API key.
    -   The default value `"YOUR_OPENAI_API_KEY_HERE"` is a placeholder and **must be replaced** with your actual key for Wooster to function.
-   `openai.modelName` (string):
    -   The OpenAI model to be used by Wooster (e.g., `"gpt-4o-mini"`, `"gpt-4"`, `"gpt-3.5-turbo"`).
    -   **Default**: `"gpt-4o-mini"`.

#### 2. `logging`

Manages how Wooster logs information. See `08 LOGGING.MD` for more details.

-   `logging.consoleLogLevel` (string: `"DEBUG" | "INFO" | "WARN" | "ERROR"`):
    -   The minimum log level for messages displayed on the console.
    -   **Default**: `"INFO"`.
-   `logging.fileLogLevel` (string: `"DEBUG" | "INFO" | "WARN" | "ERROR"`):
    -   The minimum log level for messages written to the log file.
    -   **Default**: `"INFO"`.
-   `logging.logFile` (string | null):
    -   The name of the log file (e.g., `"wooster_session.log"`) or an absolute path to it.
    -   If only a filename is provided, it will be created in a `logs/` directory in the project root.
    -   Set to `null` to disable file logging entirely.
    -   **Default**: `"wooster_session.log"`.
-   `logging.logAgentLLMInteractions` (boolean):
    -   If `true`, detailed logs of interactions with the LLM (prompts and responses) will be written (typically at DEBUG level).
    -   Useful for debugging agent behavior.
    -   **Default**: `false`.

#### 3. `email`

Configures the built-in email sending tool.

-   `email.enabled` (boolean):
    -   Set to `true` to enable the email tool.
    -   If `false`, the email tool will not be available to the agent.
    -   **Default**: `false`.
-   `email.sendingEmailAddress` (string | null):
    -   The email address from which Wooster will send emails and authenticate with the email server (e.g., your Gmail address used for sending).
    -   Required if `email.enabled` is `true`.
    -   **Default**: `null`.
-   `email.userPersonalEmailAddress` (string | null):
    -   The user's personal email address. This is used as the recipient when the agent is instructed to send an email to the user (e.g., using the `SELF_EMAIL_RECIPIENT` placeholder).
    -   Optional. If not set and an email is sent to `SELF_EMAIL_RECIPIENT`, it will fall back to using `sendingEmailAddress` as the recipient.
    -   **Default**: `null`.
-   `email.emailAppPassword` (string | null):
    -   If using Gmail, this is your 16-character App Password associated with the `sendingEmailAddress`.
    -   Required if `email.enabled` is `true` and you are using Gmail with an App Password for the `sendingEmailAddress`.
    -   (OAuth2 configuration is not currently supported directly via `config.json`).
    -   **Default**: `null`.

#### 4. `ucm` (User Contextual Memory)

Controls the UCM feature. See `07 UCM.MD` for more details on UCM.

-   `ucm.enabled` (boolean):
    -   Set to `true` to enable UCM.
    -   **Default**: `false`.
-   `ucm.extractorLlmPrompt` (string | null):
    -   A custom prompt for the LLM that extracts user facts for UCM.
    -   If `null`, a system-defined default prompt is used.
    -   **Default**: `null`.

#### 5. `plugins`

Manages plugin activation. See `03 PLUGINS.MD` for plugin details.

-   The `plugins` object contains key-value pairs where:
    -   The key is the plugin filename (without the `.ts` extension) from `src/plugins/`.
    -   The value is a boolean (`true` to enable, `false` to disable).
-   If a plugin file exists in `src/plugins/` but is not listed here, it defaults to **enabled**.
-   **Default**: `{}` (empty object, meaning all found plugins are enabled by default).

**Example `plugins` configuration:**
```json
  "plugins": {
    "myAnalyticsPlugin": true,
    "experimentalFeaturePlugin": false
  }
```

## Loading Mechanism

The configuration is loaded at startup by `src/configLoader.ts`. If `config.json` is missing, `configLoader.ts` creates it with the default settings described above. Wooster will exit if essential configurations like `openai.apiKey` are missing or still placeholders after loading.

## `.env` File (Secondary Role)

While `config.json` is the primary configuration source for Wooster, a `.env` file can still be used for:
-   Plugin-specific environment variables.
-   Credentials for other third-party services not managed by Wooster.
-   Bootstrap `LOG_LEVEL` for initial console messages before `config.json` is parsed.
See `README.MD` and `.env.example` for more on the `.env` file's role. 