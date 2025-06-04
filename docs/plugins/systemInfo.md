# SystemInfo Plugin

**Version:** 0.1.0
**Description:** Provides system information tools, like listing plugin statuses.

## Purpose

The `SystemInfoPlugin` offers tools to inspect the current state and configuration of the Wooster plugin system. This is primarily useful for diagnostics and understanding which plugins are active and how they are configured.

## Tools Provided

### `listPluginsStatus`

-   **Description:** Lists all installed plugins found in the compiled plugins directory (`dist/plugins/`), their configured enabled/disabled status (from `config.plugins`), and their actual load status (whether they were successfully loaded by the system if enabled).
-   **Usage:** This tool takes no input.
-   **Output:** A formatted string detailing the status of each plugin, including its name, version, description, configured status, load status, any loading errors, and its file path.

#### Example Output Format:

```
Installed Plugins Status:
===========================
Plugin: somePlugin
  Version: 1.2.3
  Description: Does something interesting.
  Config Status: Enabled in config
  Load Status: Loaded Successfully
  Path: /path/to/your/project/dist/plugins/somePlugin
---------------------------
Plugin: anotherPlugin
  Version: 0.5.0
  Description: Another useful plugin.
  Config Status: Disabled in config (or not specified)
  Load Status: Not Loaded (disabled in config)
  Path: /path/to/your/project/dist/plugins/anotherPlugin
---------------------------
Plugin: faultyPlugin
  Version: N/A
  Description: N/A
  Config Status: Enabled in config
  Load Status: Failed to Load (Error during import)
  Error: Some import error message here
  Path: /path/to/your/project/dist/plugins/faultyPlugin
---------------------------
```

## Configuration

To use the `SystemInfoPlugin` and its tools, it must be enabled in your Wooster configuration.

1.  **Environment Variable:**
    Set `PLUGIN_SYSTEMINFO_ENABLED=true` in your environment variables (e.g., in your `.env` file).

2.  **Configuration File (e.g., `config/default.json` or `config/development.json`):
    Ensure the plugin is enabled under the `plugins` section:
    ```json
    {
      // ... other configurations ...
      "plugins": {
        // ... other plugins ...
        "systemInfo": true
      }
    }
    ```

Make sure to rebuild Wooster (e.g., `pnpm build`) after enabling the plugin or making configuration changes for it to take effect.

## Notes

- The tool scans the `dist/plugins` directory. Ensure your plugins are correctly compiled to this location.
- The `configuredStatus` reflects what is in your `config.plugins` settings. The `loadStatus` reflects the runtime outcome if the plugin was configured to be enabled. 