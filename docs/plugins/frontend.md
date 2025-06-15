# Frontend Plugin Plan

## 1. Objective

To encapsulate the Wooster web UI server within a dedicated `frontend` plugin. This aligns with Wooster's modular architecture, allowing the web server to be managed by the `PluginManager` and be enabled or disabled via configuration. This approach keeps the core application decoupled from the UI.

## 2. Guiding Principles

-   **Simplicity (KISS):** The plugin's sole responsibility is to manage the lifecycle of the web server. It will not contain the business logic for routes, which will remain in a dedicated server file.
-   **Maintainability:** By separating the plugin's "wiring" from the Express application logic, both can be modified independently. The server code remains a standard Express app, while the plugin code is purely for integration with Wooster.
-   **Durability:** The plugin will implement a graceful shutdown procedure for the web server, ensuring clean exits.

## 3. Implementation Plan

### Step 1: File & Directory Restructuring

1.  **Create Plugin Directory:**
    -   `mkdir -p src/plugins/frontend`
2.  **Move Server Logic:**
    -   Move the existing `src/server/` directory into the new plugin directory: `mv src/server src/plugins/frontend/server`
3.  **Adjust Naming:**
    -   Rename `src/plugins/frontend/server/index.ts` to `src/plugins/frontend/server/app.ts` to better reflect its role as the Express application setup.
    -   Static assets will now be at `src/plugins/frontend/server/public/`.

### Step 2: Create the Plugin Entrypoint

-   Create the main plugin file: `src/plugins/frontend/index.ts`.

### Step 3: Develop the `FrontendPlugin` Class

-   Inside `src/plugins/frontend/index.ts`, create a `FrontendPlugin` class that implements the `WoosterPlugin` interface.
-   **Static Properties:** Define the required static properties for the `PluginManager`:
    ```typescript
    static readonly pluginName = 'frontend';
    static readonly version = '0.1.0';
    static readonly description = 'Manages and serves the Wooster web UI.';
    ```
-   **Instance Properties:** Include a private property to hold the running `http.Server` instance.
    ```typescript
    private server: http.Server | null = null;
    ```

### Step 4: Adapt the Express Application

-   Modify `src/plugins/frontend/server/app.ts`. Instead of starting the server directly, it will export a function, `startServer`, that:
    -   Accepts the `config` and `services` objects.
    -   Sets up all Express middleware and routes.
    -   Calls `app.listen()` and returns the resulting `http.Server` instance.
    -   Updates the path for serving static files from `public/` to `path.join(__dirname, 'public')`.

### Step 5: Implement Plugin Lifecycle Methods

-   **`initialize(config, services)`:**
    -   Check if `config.plugins.frontend.enabled` is `true`. If not, log a message and exit.
    -   Import `startServer` from `./server/app.ts`.
    -   Call `startServer(config, services)` to launch the web server.
    -   Store the returned `http.Server` instance in `this.server`.
-   **`shutdown()`:**
    -   If `this.server` exists, call `this.server.close()` to stop it gracefully.

### Step 6: Update Configuration

1.  **`config/default.json`:** Add a configuration block for the plugin:
    ```json
    "plugins": {
      "projectManager": { ... },
      "frontend": {
        "enabled": true,
        "port": 3000
      }
    }
    ```
2.  **`config/custom-environment-variables.json`:** Map environment variables:
    ```json
    "plugins": {
      "projectManager": { ... },
      "frontend": {
        "enabled": "PLUGIN_FRONTEND_ENABLED",
        "port": "PLUGIN_FRONTEND_PORT"
      }
    }
    ```
3.  **`.env.example`:** Add the new variables for users:
    ```
    PLUGIN_FRONTEND_ENABLED=true
    PLUGIN_FRONTEND_PORT=3000
    ```

### Step 7: Final Cleanup

-   Update `tsconfig.json` or any build/run scripts if the file restructuring requires path changes.
-   Delete the original (and now empty) `src/server` directory if it still exists.

This plan establishes a clear and modular foundation for the web UI, ensuring it integrates cleanly with Wooster's architecture. 