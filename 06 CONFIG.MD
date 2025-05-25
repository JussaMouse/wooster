# 06 CONFIG.MD: Wooster Configuration

Wooster uses a JSON file named `config.json` located in the project root for managing certain operational settings. If this file does not exist when Wooster starts, a default one will be created.

## Configuration File: `config.json`

This file allows you to customize:

1.  **User Contextual Memory (UCM)** (`ucm` section)
2.  **Plugin Activation** (`plugins` section)

### Default `config.json`

If `config.json` is not found, Wooster will create it with the following default content:

```json
{
  "ucm": {
    "enabled": false, // UCM is disabled by default
    "extractorLlmPrompt": null
  },
  "plugins": {}
}
```

### 1. User Contextual Memory (UCM) Configuration

The `ucm` object in `config.json` controls the UCM feature.

-   `ucm.enabled` (boolean):
    -   Set to `true` to enable UCM.
    -   Set to `false` to disable UCM.
    -   **Default**: `false`.
-   `ucm.extractorLlmPrompt` (string | null):
    -   Allows you to provide a custom prompt for the LLM that extracts user facts for UCM.
    -   If set to `null` (the default), a system-defined default prompt is used.
    -   Example: `"extractorLlmPrompt": "Extract any specific preferences or facts mentioned by the user about themselves. Focus on information that would be useful for tailoring future interactions. Output as a concise list of statements."`

See `07 UCM.MD` for more details on the UCM feature itself.

### 2. Plugin Configuration

The `plugins` object in `config.json` allows you to enable or disable specific plugins.

-   Each key in the `plugins` object should correspond to a plugin filename (without the `.ts` extension) in the `src/plugins/` directory.
-   The value should be a boolean: `true` to enable the plugin, `false` to disable it.
-   If a plugin file exists in `src/plugins/` but is *not* listed in `config.json`, it defaults to being **enabled**.

**Example:**

Given you have `src/plugins/myCustomPlugin.ts` and `src/plugins/anotherPlugin.ts`:

```json
// config.json
{
  "ucm": {
    "enabled": false,
    "extractorLlmPrompt": null
  },
  "plugins": {
    "myCustomPlugin": true,  // This plugin is explicitly enabled
    "anotherPlugin": false // This plugin is explicitly disabled
    // Any other plugins in src/plugins/ would be enabled by default
  }
}
```

See `03 PLUGINS.MD` for more details on plugins.

## Loading Mechanism

The configuration is loaded at startup by `src/configLoader.ts`. If `config.json` is missing, `configLoader.ts` creates it with the default settings described above.

## Other Configuration (`.env`)

Sensitive information like API keys and specific service credentials (e.g., email) are managed via a `.env` file in the project root. See `README.MD` and `.env.example` for details on environment variables used by Wooster, including logging configuration (`LOG_LEVEL`, `LOG_FILE`). 