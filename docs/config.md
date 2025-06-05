# 06 CONFIG.MD: Wooster Configuration via Environment Variables

Wooster's configuration is managed exclusively through environment variables set in an `.env` file located in the project root. You must copy the provided `.env.example` to `.env` and fill in your actual values for Wooster to function correctly.

**Wooster will not start or may have features disabled if essential environment variables (like `OPENAI_API_KEY`) are missing or invalid.**

## Setting Up Your `.env` File

1.  **Copy the Example:** In the root of your Wooster project, find `.env.example`.
2.  **Rename:** Make a copy and name it `.env` (e.g., `cp .env.example .env`).
3.  **Edit:** Open `.env` with a text editor and provide your actual settings and API keys for the variables listed below.

**Important:** The `.env` file should always be added to your `.gitignore` file to prevent accidental commitment of sensitive information like API keys.

## Notes about getting OAth credentials for Google services:

### getting a refresh token
#### 1. In Google Cloud Platform:
- Go to "APIs & Services" -> "Credentials."
	- `https://console.cloud.google.com/apis/credentials`
- Click "+ CREATE CREDENTIALS" -> "OAuth client ID."
- For "Application type," select "Web application".
- Give it a name (e.g., "Wooster Web App Client for Playground").
- Under "Authorized redirect URIs," ADD A URI: `https://developers.google.com/oauthplayground`
- This is crucial. The Playground explicitly told you it needs to be listed as a valid redirect URI for the "Web application" client ID you're providing it.
- Click "Create." You will get a new Client ID and Client Secret.
#### 2. In OAuth 2.0 Playground:
- go to `https://developers.google.com/oauthplayground`
- Go back to the settings cog.
- Ensure "Use your own OAuth credentials" is checked.
- Enter the new Client ID and Client Secret you just generated for the "Web application" type.
- Ensure "OAuth flow" is set to "Server-side" (usually default and appropriate for web apps getting refresh tokens).
- Ensure "Access type" is set to "offline" (to get a refresh token).
#### 3. Re-authorize in OAuth 2.0 Playground:
- Go through "Step 1: Select & authorize APIs" again (select Calendar API v3, and the `https://www.googleapis.com/auth/calendar.events` scope).
- Click "Authorize APIs."
- Go through the Google Sign-In and Consent screen again.
- Exchange the new authorization code for tokens.
- Copy the new Refresh token that is generated.

### checking your OAuth client's client id and client secret 
- got to `https://console.cloud.google.com/auth/clients` and click on your client's name
- click the ℹ️ icon in the top right


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
    -   **Description**: The OpenAI model for creating embeddings (used for RAG, User Profile).
    -   **Default**: `text-embedding-3-small`
-   `OPENAI_TEMPERATURE`
    -   **Description**: Controls the randomness of the LLM's output. Higher values (e.g., 0.9) make output more random, lower values (e.g., 0.2) make it more deterministic.
    -   **Default**: `0.7`
-   `OPENAI_MAX_TOKENS`
    -   **Description**: Maximum number of tokens to generate in the LLM response.
    -   **Default**: `2048`

### 1a. System Prompt Customization

Wooster's system prompt, which provides its core instructions and persona to the LLM, can be customized:

-   **Base Prompt**: The foundational system prompt is loaded from `prompts/base_system_prompt.txt` at the project root.
-   **Appending Custom Instructions**: To add your own standing instructions, define a specific persona, or provide additional context, create one or more `.txt` files in the `prompts/` directory (e.g., `prompts/persona_definition.txt`, `prompts/domain_specific_rules.txt`).
    -   The content of each of these additional `.txt` files will be read, trimmed of whitespace, and appended to the base system prompt.
    -   Files are processed in alphabetical order by filename to ensure consistent application of appended prompts.
    -   Each appended prompt section will be separated from the previous section by two newline characters.
    -   This method provides a modular way to build up complex system prompts.

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

### 3. User Profile

Controls the User Profile feature, which allows Wooster to remember user-specific facts and preferences.

-   `USER_PROFILE_ENABLED`
    -   **Description**: Set to `true` to enable the User Profile feature. This works in conjunction with enabling the `userProfile` plugin in the application's plugin settings.
    -   **Valid Values**: `true`, `false`
    -   **Default**: `false`
-   `USER_PROFILE_STORE_PATH`
    -   **Description**: Specifies the directory path for the User Profile plugin's vector store files (e.g., `faiss.index`, `docstore.json`).
    -   **Default**: If not set, defaults to `<workspace_root>/vector_data/user_profile_store/`.
    -   **Example**: `USER_PROFILE_STORE_PATH="./my_data/user_profile_db"`

### 4. Tools Configuration

Enable/disable and configure specific agent tools. The agent uses these tools to perform actions and access information. For detailed information on each tool, including its purpose, agent-facing description, input/output schemas, and specific usage guidance, please refer to:

- `04 TOOLS.MD`: For an overview of the tooling system and an index of available tools.
- Individual tool documentation files in the `docs/tools/` directory (e.g., `docs/tools/TOOL_WebSearch.MD`).

#### 4a. Email Tool (Provided by GmailPlugin)

Manages the agent's ability to send emails. This tool is provided by the `GmailPlugin`. For the tool to be available, the `GmailPlugin` must be active (see Plugin Activation section below) AND `TOOLS_EMAIL_ENABLED` must be `true`. See `docs/tools/TOOL_Email.MD` for full details on the tool itself.

-   `TOOLS_EMAIL_ENABLED`
    -   **Description**: Set to `true` to enable the email tool features within the `GmailPlugin`.
    -   **Valid Values**: `true`, `false`
    -   **Default**: `false`
-   `TOOLS_EMAIL_SENDER_EMAIL_ADDRESS`
    -   **Description**: Email address from which Wooster will send emails. Required if `TOOLS_EMAIL_ENABLED=true`.
    -   **Default**: (none)
-   `TOOLS_EMAIL_USER_PERSONAL_EMAIL_ADDRESS`
    -   **Description**: User's personal email, can be used as a default recipient (e.g., for `SELF_EMAIL_RECIPIENT`).
    -   **Default**: (none)
-   `TOOLS_EMAIL_EMAIL_APP_PASSWORD`
    -   **Description**: App password for the `TOOLS_EMAIL_SENDER_EMAIL_ADDRESS`

#### 4b. Weather Tool (for Daily Review)

Provides weather forecasts, primarily for the Daily Review feature.

-   `WEATHER_CITY`
    -   **Description**: The city for which to fetch the weather forecast (e.g., "London", "New York, US").
    -   **Required**: Yes, if you want weather in the Daily Review.
    -   **Default**: (none) - If not set, the weather part of the Daily Review will be skipped.
-   `OPENWEATHERMAP_API_KEY` (Example API Key Variable)
    -   **Description**: Your API key for the chosen weather service (e.g., OpenWeatherMap). The specific variable name might change depending on the service selected.
    -   **Required**: Yes, if you want weather in the Daily Review.
    -   **Default**: (none) - If not set, the weather part of the Daily Review will be skipped.