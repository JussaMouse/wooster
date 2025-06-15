# Wooster Frontend Plugin

This document provides an overview of the `frontend` plugin, which serves the web-based user interface for Wooster.

## 1. Design Philosophy & Technology Stack

The primary goal for the Wooster frontend is **simplicity, speed, and maintainability**. We deliberately chose a stack that avoids heavy client-side frameworks and complex build steps, allowing for rapid development while keeping the focus on server-driven logic.

-   **Technology Stack:**
    -   **Express.js:** A minimal and flexible Node.js web application framework that provides a robust set of features for web and mobile applications.
    -   **HTMX:** Allows access to modern browser features directly from HTML, without using JavaScript. The core principle is that the server returns HTML, not JSON, which simplifies both the frontend and backend logic.
    -   **Alpine.js:** A rugged, minimal framework for composing behavior directly in your markup. It provides the small amount of client-side interactivity needed (like toggling visibility) without the overhead of a larger framework like React or Vue.

-   **Key Design Decisions:**
    -   **Server-Side Rendering (SSR) via HTMX:** The server is the single source of truth. It generates and returns HTML fragments in response to user actions. This eliminates the need for complex state management on the client.
    -   **Zero Build Step:** By using CDN-hosted versions of HTMX and Alpine.js, we avoid the need for bundlers like Webpack or Vite, which simplifies the development setup and deployment process.
    -   **Modular & Decoupled:** The entire web server is encapsulated within a Wooster plugin. This allows it to be enabled or disabled easily via configuration and keeps the UI concerns separate from the core application logic.

## 2. Architecture & File Structure

The frontend is managed by the `PluginManager` just like any other plugin.

-   `src/plugins/frontend/index.ts`: The main plugin entry point.
    -   Implements the `WoosterPlugin` interface.
    -   **`initialize()`**: Checks if the plugin is enabled in the configuration, then starts the Express server.
    -   **`shutdown()`**: Gracefully stops the Express server when Wooster shuts down.

-   `src/plugins/frontend/server/app.ts`: The Express server application.
    -   Exports a `startServer` function that is called by the plugin.
    -   Contains all route handlers (e.g., `/projects/list`, `/projects/create`).
    -   Route handlers perform their logic and respond with HTML fragments for HTMX to inject into the page.

-   `src/plugins/frontend/server/public/`: Static assets.
    -   `index.html`: The main entry point for the web UI. It includes the HTMX and Alpine.js scripts and contains the initial layout.
    -   Other static files (CSS, images) would go here.

## 3. Configuration

The frontend plugin's behavior is controlled by environment variables, which are documented in `.env.example`.

-   `PLUGIN_FRONTEND_ENABLED`: (default: `true`) Toggles the entire web server on or off.
-   `PLUGIN_FRONTEND_PORT`: (default: `3000`) Sets the port on which the web server will listen.

This setup ensures that the web UI is a modular, maintainable, and simple extension of the core Wooster application, adhering to our development principles. 