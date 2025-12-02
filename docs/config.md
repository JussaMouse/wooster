# Wooster Configuration System

This document explains how Wooster's configuration is managed.

## 1. Philosophy: Code + `.env`

Wooster uses a **"Code-First"** configuration system powered by TypeScript and environment variables.

-   **Single Source of Truth**: All configuration structure and defaults are defined in `src/configLoader.ts`.
-   **Environment Variables**: Users configure the application exclusively via the `.env` file.
-   **Type Safety**: The configuration is fully typed (TypeScript), ensuring that the rest of the application always receives valid data.

## 2. For Users: How to Configure Wooster

1.  **Create `.env`**: Copy `.env.example` to `.env` in the project root.
2.  **Edit Settings**: Open `.env` and change values.
    *   API Keys (e.g., `OPENAI_API_KEY`)
    *   Feature Toggles (e.g., `PLUGIN_SIGNAL_ENABLED=true`)
    *   Preferences (e.g., `WEATHER_UNITS=C`)

That's it! You do not need to edit any JSON files.

## 3. For Developers: Adding New Settings

To add a new configuration setting:

1.  Open `src/configLoader.ts`.
2.  Update the relevant Interface (e.g., `OpenAIConfig`) to include the new field.
3.  Update `buildConfigFromEnv()` to populate the field:
    ```typescript
    myField: process.env.MY_NEW_ENV_VAR || 'default_value'
    ```
4.  Add `MY_NEW_ENV_VAR` to `.env.example` so users know it exists.

## 4. Plugin Configuration

Plugins follow the same pattern.

-   **Enable/Disable**: Wooster automatically checks `PLUGIN_<NAME>_ENABLED` for every plugin.
    *   Example: `PLUGIN_WEATHER_ENABLED=false` disables the Weather plugin.
-   **Plugin Settings**: If your plugin needs specific settings (like an API key), add them to `src/configLoader.ts` (interface and loader) and mapping them to an environment variable.

## 5. Routing (Local vs Cloud)

Routing configuration is also handled in `src/configLoader.ts` via `ROUTING_*` environment variables.

```bash
ROUTING_ENABLED=true
ROUTING_LOCAL_ENABLED=true
ROUTING_LOCAL_SERVER_URL=http://127.0.0.1:8080
```

See `.env.example` for all available options.
