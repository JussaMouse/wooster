# 08 LOGGING.MD: Wooster Logging System

Wooster employs a straightforward logging system designed for clarity and configurability. It logs to both the console and, optionally, to a file.

## Core Features

*   **Dual Output**: Messages can be seen in real-time on the console and persisted in a log file for later review.
*   **Configurable Log Levels**: Separate log levels can be set for console and file output, allowing for verbose console output during development and less verbose file output for production, or vice-versa.
*   **Timestamped Messages**: All log messages are automatically timestamped.
*   **Formatted Output**: Uses `util.format` for message formatting, similar to `console.log`.
*   **Agent LLM Interaction Logging**: A specific option allows for detailed logging of prompts sent to and responses received from the Language Model, which is invaluable for debugging agent behavior.

## Configuration (`config.json`)

All logging settings are managed within the `logging` section of the `config.json` file located in the project root. See `06 CONFIG.MD` for details on the overall `config.json` structure.

**Example `logging` section in `config.json`:**

```json
{
  // ... other configurations (openai, email, ucm, plugins)
  "logging": {
    "consoleLogLevel": "INFO",
    "fileLogLevel": "INFO",
    "logFile": "wooster_session.log",
    "logAgentLLMInteractions": false
  }
  // ...
}
```

### Logging Configuration Fields:

-   `logging.consoleLogLevel` (string):
    -   Determines the minimum severity level for messages displayed on the console.
    -   Possible values: `"DEBUG"`, `"INFO"`, `"WARN"`, `"ERROR"`.
    -   **Default**: `"INFO"`.
-   `logging.fileLogLevel` (string):
    -   Determines the minimum severity level for messages written to the log file.
    -   Possible values: `"DEBUG"`, `"INFO"`, `"WARN"`, `"ERROR"`.
    -   **Default**: `"INFO"`.
-   `logging.logFile` (string | null):
    -   Specifies the name or path for the log file.
        -   If a relative filename (e.g., `"wooster_session.log"`) is given, the file is created/used within a `logs/` directory in the project root (e.g., `PROJECT_ROOT/logs/wooster_session.log`). The `logs/` directory will be created if it doesn't exist.
        -   An absolute path can also be provided.
    -   Set to `null` to disable file logging entirely.
    -   **Default**: `"wooster_session.log"`.
-   `logging.logAgentLLMInteractions` (boolean):
    -   If set to `true`, detailed information about interactions with the Language Model (including prompts and responses) will be logged. These logs are typically at the `DEBUG` level.
    -   This is very useful for debugging the agent's decision-making process.
    -   **Default**: `false`.

## Implementation (`src/logger.ts`)

The logger is implemented in `src/logger.ts`. It includes:

*   `LogLevel` enum: `DEBUG`, `INFO`, `WARN`, `ERROR` (shared with `configLoader.ts`).
*   `bootstrapLogger()`: An initial, minimal logger setup using the `LOG_LEVEL` environment variable (if set) for console messages that occur *before* `config.json` is fully loaded and parsed. This helps capture very early startup issues.
*   `applyLoggerConfig(config: LoggingConfig)`: A function called after `config.json` is loaded. It applies all the logging settings found in `config.json` to the logger.
*   `log(level: LogLevel, message: string, ...args: any[])`: The primary function used throughout the application to log messages.
*   `logLLMInteraction(message: string, ...args: any[])`: A dedicated function for logging detailed LLM interactions, controlled by `logging.logAgentLLMInteractions`.

## Usage in Code

```typescript
import { log, LogLevel, logLLMInteraction } from './logger';

// Standard logging
log(LogLevel.INFO, 'User %s initiated action X', userName);
log(LogLevel.ERROR, 'Failed to process request: %s', error.message, { details: error.stack });

// Conditional LLM interaction logging (handled internally by logLLMInteraction based on config)
logLLMInteraction('Sending prompt to LLM:', { prompt: fullPromptObject });
```

## Log Output Format

Log messages follow this general format:

`[YYYY-MM-DDTHH:mm:ss.sssZ] [LEVEL] Formatted message content`

Example:
`[2023-10-27T10:30:00.123Z] [INFO] User 'Alice' loaded project 'MyNotes'.`
`[2023-10-27T10:30:05.456Z] [DEBUG] [LLM_INTERACTION] LLM Response: { "tool_calls": [...] }`

## .gitignore

Ensure your log files and the `logs/` directory are included in `.gitignore` if you don't want to commit them to your repository (which is typical).

Example for `.gitignore`:
```
logs/
*.log
``` 