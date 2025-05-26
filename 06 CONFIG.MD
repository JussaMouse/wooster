# 06 CONFIG.MD: Wooster Configuration via Environment Variables

Wooster's configuration is managed exclusively through environment variables set in an `.env` file located in the project root. You must copy the provided `.env.example` to `.env` and fill in your actual values for Wooster to function correctly.

**Wooster will not start or may have features disabled if essential environment variables (like `OPENAI_API_KEY`) are missing or invalid.**

## Setting Up Your `.env` File

1.  **Copy the Example:** In the root of your Wooster project, find `.env.example`.
2.  **Rename:** Make a copy and name it `.env` (e.g., `cp .env.example .env`).
3.  **Edit:** Open `.env` with a text editor and provide your actual settings and API keys for the variables listed below.

**Important:** The `.env` file should always be added to your `.gitignore` file to prevent accidental commitment of sensitive information like API keys.

## Environment Variables Reference

Below are all the environment variables Wooster recognizes, their purpose, and default values if not set.

### 1. Core LLM Settings (OpenAI)

These variables configure the primary Language Model used by Wooster.

-   `OPENAI_API_KEY`
    -   **Description**: Your OpenAI API key.
    -   **Required**: Yes. Wooster will not function without this.
    -   **Default**: `YOUR_OPENAI_API_KEY_HERE` (placeholder - must be changed)
-   `OPENAI_MODEL_NAME`
    -   **Description**: The OpenAI model to be used for chat completions (e.g., `gpt-4o-mini`, `gpt-4`, `gpt-3.5-turbo`).
    -   **Default**: `gpt-4o-mini`
-   `OPENAI_EMBEDDING_MODEL_NAME`
    -   **Description**: The OpenAI model for creating embeddings (used for RAG, UCM).
    -   **Default**: `text-embedding-3-small`
-   `OPENAI_TEMPERATURE`
    -   **Description**: Controls the randomness of the LLM's output. Higher values (e.g., 0.9) make output more random, lower values (e.g., 0.2) make it more deterministic.
    -   **Default**: `0.7`
-   `OPENAI_MAX_TOKENS`
    -   **Description**: Maximum number of tokens to generate in the LLM response.
    -   **Default**: `2048`

### 2. Logging Configuration

These variables control Wooster's logging behavior. See `07 LOGGING.MD` for more on log levels.

-   `LOGGING_CONSOLE_LOG_LEVEL`
    -   **Description**: Minimum log level for console output.
    -   **Valid Values**: `DEBUG`, `INFO`, `WARN`, `ERROR`
    -   **Default**: `INFO`
-   `LOGGING_FILE_LOG_LEVEL`
    -   **Description**: Minimum log level for file output.
    -   **Valid Values**: `DEBUG`, `INFO`, `WARN`, `ERROR`
    -   **Default**: `INFO`
-   `LOGGING_LOG_FILE`
    -   **Description**: Path to the log file. If only a filename is given, it defaults to the `logs/` directory. Wooster typically appends a timestamp to this filename (e.g., `logs/wooster_session_YYYY-MM-DD_HH-MM-SS.log`). Set to an empty string to disable file logging.
    -   **Default**: `logs/wooster_session.log`
-   `LOGGING_LOG_AGENT_LLM_INTERACTIONS`
    -   **Description**: If `true`, logs detailed LLM prompts and responses (useful for debugging agent behavior).
    -   **Valid Values**: `true`, `false`
    -   **Default**: `false`
-   `LOGGING_CONSOLE_QUIET_MODE`
    -   **Description**: If `true`, suppresses `INFO` and `DEBUG` messages from console output (they are still logged to file if enabled).
    -   **Valid Values**: `true`, `false`
    -   **Default**: `false`
-   `LOG_LEVEL` (Bootstrap Log Level)
    -   **Description**: Sets an initial console log level for messages *before* full configuration is parsed. For debugging early startup issues.
    -   **Valid Values**: `DEBUG`, `INFO`, `WARN`, `ERROR`
    -   **Default**: `INFO` (or as determined by internal bootstrap logger)

### 3. User Contextual Memory (UCM)

Controls the User Contextual Memory feature.

-   `UCM_ENABLED`
    -   **Description**: Set to `true` to enable UCM.
    -   **Valid Values**: `true`, `false`
    -   **Default**: `false`
-   `UCM_EXTRACTOR_LLM_PROMPT`
    -   **Description**: Custom prompt for the UCM fact extractor. If empty, a system default is used. Supports placeholders like `{conversationHistory}`.
    -   **Default**: (empty string, uses system default)

### 4. Tools Configuration

Enable/disable and configure specific agent tools.

#### 4a. Email Tool

-   `TOOLS_EMAIL_ENABLED`
    -   **Description**: Set to `true` to enable the email tool.
    -   **Valid Values**: `true`, `false`
    -   **Default**: `false`
-   `EMAIL_SENDING_EMAIL_ADDRESS`
    -   **Description**: Email address from which Wooster will send emails. Required if `TOOLS_EMAIL_ENABLED=true`.
    -   **Default**: (none)
-   `EMAIL_USER_PERSONAL_EMAIL_ADDRESS`
    -   **Description**: User's personal email, can be used as a default recipient or for CC.
    -   **Default**: (none)
-   `EMAIL_EMAIL_APP_PASSWORD`
    -   **Description**: App password for the `EMAIL_SENDING_EMAIL_ADDRESS` (e.g., Gmail App Password). Required if `TOOLS_EMAIL_ENABLED=true`.
    -   **Default**: (none)

#### 4b. Google Calendar Tool

-   `TOOLS_GOOGLE_CALENDAR_ENABLED`
    -   **Description**: Set to `true` to enable Google Calendar features.
    -   **Valid Values**: `true`, `false`
    -   **Default**: `false`
-   `GOOGLE_CLIENT_ID`
    -   **Description**: Your Google Cloud OAuth 2.0 Client ID. Required if `TOOLS_GOOGLE_CALENDAR_ENABLED=true`.
    -   **Default**: (none)
-   `GOOGLE_CLIENT_SECRET`
    -   **Description**: Your Google Cloud OAuth 2.0 Client Secret. Required if `TOOLS_GOOGLE_CALENDAR_ENABLED=true`.
    -   **Default**: (none)
-   `GOOGLE_CALENDAR_REFRESH_TOKEN`
    -   **Description**: OAuth 2.0 Refresh Token for Google Calendar access. Required if `TOOLS_GOOGLE_CALENDAR_ENABLED=true`.
    -   **Default**: (none)
-   `GOOGLE_CALENDAR_ID`
    -   **Description**: The ID of the Google Calendar to manage (e.g., `primary`).
    -   **Default**: `primary`

#### 4c. Web Search Tool

-   `TOOLS_WEB_SEARCH_ENABLED`
    -   **Description**: Set to `true` to enable the web search tool. Requires `TAVILY_API_KEY` to be set.
    -   **Valid Values**: `true`, `false`
    -   **Default**: `true` (but will be auto-disabled if `TAVILY_API_KEY` is missing)
-   `TAVILY_API_KEY`
    -   **Description**: Your API key for Tavily AI, used by the web search tool.
    -   **Required**: If `TOOLS_WEB_SEARCH_ENABLED=true`.
    -   **Default**: (none)

### 5. Plugin Activation

Controls which plugins are active. Wooster discovers plugins from the `src/plugins/` directory (e.g., `myPlugin.ts`).

-   **General Rule:** Plugins are **ENABLED BY DEFAULT** if found.
-   **To Disable a Specific Plugin:** Set an environment variable `PLUGIN_[PLUGINNAME]_ENABLED=false`.
    -   Replace `[PLUGINNAME]` with the plugin's filename (without `.ts`), converted to uppercase.
    -   Example: For `src/plugins/myCoolPlugin.ts`, to disable it, add: `PLUGIN_MYCOOLPLUGIN_ENABLED=false`
-   **To Explicitly Enable (Optional):** `PLUGIN_[PLUGINNAME]_ENABLED=true`. Usually not needed due to the default-enabled behavior.

## Loading Mechanism

The `src/configLoader.ts` module reads these environment variables at startup, applies defaults for any that are missing (unless critical), performs type conversions, and constructs an internal `AppConfig` object used by Wooster.

If critical variables like `OPENAI_API_KEY` are missing, Wooster will log an error and may refuse to start. Always check console output after modifying your `.env` file. 