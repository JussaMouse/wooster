# GTD Plugin

**Plugin Name:** `gtd`
**Version:** 0.1.1
**Description:** Orchestrates GTD (Getting Things Done) workflows and manages GTD-related plugins. It is designed to work in conjunction with other more specific GTD plugins like `sortInbox`. This plugin does not manage its own file directory.

## Purpose

The GTD plugin serves as a central point for managing your GTD system within Wooster. While its direct responsibilities are currently minimal, it's intended to evolve to provide higher-level GTD commands, overviews, and coordination between different GTD components.

## Configuration

This plugin currently does not have any specific configuration options that need to be set via environment variables for its own operation. It relies on the configurations of the plugins it may interact with (e.g., `sortInbox`).

## Interaction with Other Plugins

*   **`sortInbox`**: The GTD plugin is aware of the ecosystem. The `sortInbox` plugin, for example, manages the processing of your main `inbox.md` and related files (`next_actions.md`, project files, etc.), which are configurable. Refer to the `sortInbox.md` documentation for its specific path configurations (e.g., `GTD_BASE_PATH`, `GTD_PROJECTS_DIR`, `GTD_ARCHIVE_DIR`).

## Future Development

Future enhancements may include:
*   Tools to provide an overview of the entire GTD system (e.g., number of inbox items, upcoming next actions).
*   Commands to trigger specific workflows across multiple GTD plugins.
*   Management of global GTD settings or contexts. 