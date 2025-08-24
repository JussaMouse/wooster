# Wooster Configuration System

This document explains how Wooster's configuration is managed, with a focus on making customization simple and secure for users.

## 1. Configuration Philosophy: `.env` First

Our core principle is that **if at all possible, all user settings, including those for plugins, will live in the `.env` file.**

-   **For Users:** The `.env` file is the *only* file you should need to edit to configure your Wooster instance. It provides a simple, flat list of settings for everything from API keys to enabling and disabling features.
-   **For Developers:** The underlying JSON files in the `config/` directory provide the structure and default values, but they are considered the "scaffolding." The primary method for exposing a new setting to a user should always be by adding an entry to `.env.example` and mapping it in `custom-environment-variables.json`. Using JSON or other formats for settings is considered an exception, reserved for complex cases where a simple key-value pair is insufficient.

## 2. The Configuration Workflow

Wooster uses the [`node-config`](https://github.com/node-config/node-config) library to create a powerful, hierarchical configuration system. Here's how the pieces fit together from a user's perspective:

1.  **`.env` file:** You create a `.env` file at the project root (by copying `.env.example`). This is where you put your API keys and change settings. This file is ignored by git, so your secrets are safe.

2.  **`config/custom-environment-variables.json`:** This file acts as a **bridge**, mapping the variables you set in your `.env` file to their corresponding place in the application's configuration object. As a user, you will likely never need to edit this file. As a developer, this is where you connect a new environment variable to the config.

3.  **`config/default.json`:** This file contains the **base configuration** and defines the complete structure of all possible settings. It provides sensible, non-secret default values. It serves as a comprehensive reference for developers but should not be edited by users for configuration.

## 3. How Settings are Prioritized

The final configuration object is built by merging settings from different sources. The sources are merged in the following order, with later sources always overriding earlier ones:

1.  `config/default.json` (Lowest priority, contains defaults)
2.  `config/custom-environment-variables.json` & your `.env` file (Highest priority, contains your specific settings)

This hierarchy ensures that any setting you specify in your `.env` file will always take precedence, giving you full control over the application's behavior.

## 4. Best Practices

-   **Configure Everything in `.env`:** This is the central rule. Use your `.env` file to manage all your personal settings, from API keys to plugin toggles.
-   **Never Commit `.env`:** The `.env` file is explicitly listed in `.gitignore`. Never remove it from the gitignore file, as this could lead to accidentally committing your secrets.
-   **Refer to `.env.example`:** This file is the "source of truth" for all available user-configurable settings. When you want to know what you can customize, look here.
-   **(For Developers) Keep `default.json` Complete:** When adding a new feature, ensure its configuration is fully represented in `default.json` with sensible defaults. Then, expose it to users via `custom-environment-variables.json` and `.env.example`.

## 5. Routing envs (local vs cloud)

To route chat to a local OpenAI-compatible server (e.g., MLX):

```bash
# .env
ROUTING_ENABLED=true
ROUTING_LOCAL_ENABLED=true
ROUTING_LOCAL_SERVER_URL=http://127.0.0.1:8080
```

Notes:
- Health: Wooster probes `GET /v1/models` on the local server.
- Completions: Wooster uses `POST /v1/completions`.
- Tools/function-calling: stock MLX doesn’t implement OpenAI “tools”; prefer answer-first prompting and explicit `web_search` usage.

By following this structure, we ensure the configuration is secure, flexible, and easy to manage across different deployment scenarios. 