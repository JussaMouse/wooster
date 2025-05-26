# 06 CONFIG.MD: Wooster Configuration

Wooster now uses a single `.env` file, located in the project root, for managing all its core operational settings, credentials, and plugin activation. You must copy the provided `.env.example` to `.env` and fill in your actual values.

**Wooster will not start if essential configurations, such as `OPENAI_API_KEY`, are missing or still set to placeholder values in your `.env` file.**

## Configuration File: `.env`

This file allows you to customize various aspects of Wooster using environment variables. The application reads this file at startup and makes the settings available throughout the system.

### Setting Up Your `.env` File

1.  **Copy the Example:** In the root of your Wooster project, find the file named `.env.example`.
2.  **Rename:** Make a copy of this file and name it `.env`.
    ```bash
    cp .env.example .env
    ```
3.  **Edit:** Open the `.env` file in a text editor and modify the placeholder values with your actual settings and API keys.
    *   **Crucially, provide your `OPENAI_API_KEY`.**
    *   Review and adjust other settings as needed.

**Important:** The `.env` file should be added to your `.gitignore` file to prevent accidental commit of sensitive information.

### Configuration Sections Explained

#### 1. OpenAI Settings

Manages settings related to the OpenAI API. Variables are prefixed with `OPENAI_`.

-   `OPENAI_API_KEY`: Your OpenAI API key.
    -   **Required.**
-   `OPENAI_MODEL_NAME`: The OpenAI model to be used (e.g., `gpt-4o-mini`, `gpt-4`, `gpt-3.5-turbo`).
    -   **Default**: `gpt-4o-mini`

#### 2. Logging Configuration

Manages how Wooster logs information. Variables are prefixed with `LOGGING_`. See `08 LOGGING.MD` (if it exists, or relevant logger documentation) for more details on log levels.

-   `LOGGING_CONSOLE_LOG_LEVEL` (Valid values: `DEBUG`, `INFO`, `WARN`, `ERROR`):
    -   The minimum log level for messages displayed on the console.
    -   **Default**: `INFO`.
-   `LOGGING_FILE_LOG_LEVEL` (Valid values: `DEBUG`, `INFO`, `WARN`, `ERROR`):
    -   The minimum log level for messages written to the log file.
    -   **Default**: `INFO`.
-   `LOGGING_LOG_FILE` (string | empty):
    -   The name of the log file (e.g., `wooster_session.log`) or an absolute path.
    -   If only a filename is provided, it will be created in the project root (or a designated logs directory if implemented).
    -   Set to an empty string (e.g., `LOGGING_LOG_FILE=`) or omit the variable to disable file logging.
    -   **Default**: `wooster_session.log`.
-   `LOGGING_LOG_AGENT_LLM_INTERACTIONS` (boolean: `true` | `false`):
    -   If `true`, detailed logs of interactions with the LLM (prompts and responses) will be written.
    -   Useful for debugging agent behavior.
    -   **Default**: `false`.
-   `LOGGING_CONSOLE_QUIET_MODE` (boolean: `true` | `false`):
    -   If set to `true`, only `WARN` and `ERROR` level messages will be displayed on the console. `INFO` and `DEBUG` messages will be suppressed from console output (they will still be written to the log file if file logging is enabled and the `LOGGING_FILE_LOG_LEVEL` is appropriate).
    -   Useful for a less verbose console experience during normal operation.
    -   **Default**: `false`.

#### 3. Email Tool Configuration

Configures the built-in email sending tool. Variables are prefixed with `EMAIL_`.

-   `EMAIL_ENABLED` (boolean: `true` | `false`):
    -   Set to `true` to enable the email tool.
    -   If `false`, the email tool will not be available to the agent.
    -   **Default**: `false`.
-   `EMAIL_SENDING_EMAIL_ADDRESS` (string | empty):
    -   The email address from which Wooster will send emails.
    -   Required if `EMAIL_ENABLED=true`.
    -   **Default**: (empty, meaning null)
-   `EMAIL_USER_PERSONAL_EMAIL_ADDRESS` (string | empty):
    -   The user's personal email address, used as the recipient for `SELF_EMAIL_RECIPIENT`.
    -   Optional.
    -   **Default**: (empty, meaning null)
-   `EMAIL_EMAIL_APP_PASSWORD` (string | empty):
    -   Your email provider's app password (e.g., Gmail App Password) for the `EMAIL_SENDING_EMAIL_ADDRESS`.
    -   Required if `EMAIL_ENABLED=true` and using app password authentication.
    -   **Default**: (empty, meaning null)

#### 4. User Contextual Memory (UCM) Configuration

Controls the UCM feature. Variables are prefixed with `UCM_`.

-   `UCM_ENABLED` (boolean: `true` | `false`):
    -   Set to `true` to enable UCM.
    -   **Default**: `false`.
-   `UCM_EXTRACTOR_LLM_PROMPT` (string | empty):
    -   A custom prompt for the LLM that extracts user facts for UCM.
    -   If empty or omitted, a system-defined default prompt is used.
    -   **Default**: (empty, meaning null)

#### 5. Google Calendar Integration

Configures integration with Google Calendar. Variables are prefixed with `GOOGLE_`. These are required if you intend to use Google Calendar functionalities.

-   `GOOGLE_CLIENT_ID` (string | empty):
    -   Your Google Cloud OAuth 2.0 Client ID.
    -   **Default**: (empty, meaning null)
-   `GOOGLE_CLIENT_SECRET` (string | empty):
    -   Your Google Cloud OAuth 2.0 Client Secret.
    -   **Default**: (empty, meaning null)
-   `GOOGLE_REFRESH_TOKEN` (string | empty):
    -   The OAuth 2.0 Refresh Token obtained for Wooster's access to Google Calendar.
    -   **Default**: (empty, meaning null)
-   `WOOSTER_CALENDAR_ID` (string):
    -   The ID of the Google Calendar Wooster will primarily manage events on (e.g., `primary` for the authenticated user's main calendar, or a specific calendar ID).
    -   **Default**: `primary`.
-   `YOUR_PERSONAL_CALENDAR_EMAIL` (string | empty):
    -   Your personal Google Calendar email address. Wooster can use this to share events from its calendar to yours by adding you as an attendee.
    -   **Default**: (empty, meaning null)

#### 6. Plugin Activation

Manages which plugins are active. Wooster discovers plugins from the `src/plugins/` directory.

-   **General Rule:** Plugins are **ENABLED BY DEFAULT** if found in the `src/plugins/` directory.
-   **To Disable a Plugin:** You can explicitly disable a plugin by adding an environment variable to your `.env` file.
    -   The format is `PLUGIN_PLUGINNAME_ENABLED=false`.
    -   `PLUGINNAME` should be the plugin's filename without the `.ts` extension, converted to uppercase.
    -   Example: For a plugin file `src/plugins/myCoolPlugin.ts`, to disable it, add:
        `PLUGIN_MYCOOLPLUGIN_ENABLED=false`
-   **To Explicitly Enable a Plugin (Optional):**
    -   You can also explicitly set `PLUGIN_PLUGINNAME_ENABLED=true`. However, since the default is enabled, this is usually not necessary unless you want to be very explicit in your configuration.

#### 7. Bootstrap Log Level

This setting controls console log messages that occur very early in the application startup, even before the main logging configuration (above) is fully processed.

-   `LOG_LEVEL` (Valid values: `DEBUG`, `INFO`, `WARN`, `ERROR`):
    -   Sets the initial console log level.
    -   This is primarily for debugging startup issues.
    -   If omitted, a sensible default (likely INFO) will be used by the bootstrap logger.
    -   Example: `LOG_LEVEL=DEBUG`

## Loading Mechanism

The configuration variables from your `.env` file are loaded into `process.env` at the very beginning of the application's startup sequence. The `src/configLoader.ts` module then reads these environment variables, applies defaults for any that are missing (unless a missing variable is critical, like `OPENAI_API_KEY`), performs necessary type conversions, and constructs an `AppConfig` object that the rest of the application uses.

If critical variables are missing or invalid, Wooster will log an error and may refuse to start to prevent operational issues. Always check the console output if Wooster fails to start after you've modified your `.env` file. 