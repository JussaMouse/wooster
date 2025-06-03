# Wooster for Personal Productivity: A Markdown-Driven Approach

Wooster is an AI-powered assistant designed for seamless integration into your daily life and workflows. It leverages Large Language Models (LLMs) and a flexible plugin system to help you capture information, manage tasks, stay organized, and automate routines. Wooster is built with a **local-first, Markdown-driven philosophy**, emphasizing simplicity, maintainability, and data ownership.

This guide focuses on how to use Wooster's key systems for personal productivity.

## Core Design Principles for Productivity

*   **Markdown-First Data:** Wooster prioritizes storing your personal data (notes, tasks, health logs) in human-readable Markdown files in your local workspace. This ensures data longevity, easy backups, and interoperability with other tools.
*   **Local-First Workspace:** Your data resides locally, giving you full control and privacy.
*   **Extensible Plugin System**: Wooster's capabilities are modular and expandable through a plugin architecture (`src/plugins/`).
*   **API-Driven Interactions**: Key functionalities are exposed via a local API, enabling integration with external tools like mobile shortcuts (e.g., Siri/iPhone Shortcuts) and scripts.

## Key Productivity Systems

Wooster offers several interconnected systems to help you manage your information and automate tasks:

### 1. Universal Capture & Inbox Workflow

*   **Goal:** Quickly capture any thought, task, idea, or note from anywhere, ensuring nothing falls through the cracks.
*   **Mechanism:**
    *   **`capture` Plugin:** You can capture items by talking/typing directly to Wooster (e.g., "Wooster, capture: Call John about the project proposal") or by sending data to its API.
    *   **`inbox.md` File:** All captured items are appended with a local timestamp (in `YYYY-MM-DD HH:MM:SS` format) to a central `inbox.md` file. This file is located in your Wooster workspace root and serves as your primary collection point before items are processed.
        *   *Example entry in `inbox.md`:*
            ```markdown
            - [ ] 2023-10-27 10:30:00 Call John about the project proposal
            ```
    *   **API Endpoint:** `POST /api/v1/capture`
        *   **Request Body:** Expects JSON: `{"text": "Your item to capture"}`
        *   **Use Case:** Ideal for integrating with tools like Siri/iPhone Shortcuts, scripts, or other applications to send information directly into your Wooster inbox.
*   **Processing the Inbox:**
    *   **`sortInbox` Plugin:** This plugin provides an agent tool to go through items in your `inbox.md` one by one. Wooster will present each item to you and await your command for how to dispatch or handle it (e.g., move to a project, add to calendar, delegate, delete).

### 2. Personal Health Logging

*   **Goal:** Maintain a simple, private, and easily reviewable log of personal health-related events.
*   **Mechanism:**
    *   **`personalHealth` Plugin:** Log events like workouts, sleep patterns, mood changes, medication intake, or dietary notes.
    *   **`health_events.log.md` File:** All health events are appended with the current local timestamp (in `YYYY-MM-DD HH:MM:SS` format) to this dedicated log file in your Wooster workspace root.
        *   *Example entry in `health_events.log.md`:*
            ```markdown
            2023-10-27 08:15:00 Ran 3 miles
            2023-10-27 12:30:00 Lunch: Salad with chicken
            ```
    *   **API Endpoint:** `POST /api/v1/health/events`
        *   **Request Body:** Expects JSON: `{"text": "Your health event description"}`
        *   **Use Case:** Allows logging health data from scripts, other apps, or shortcuts.
*   **Reporting & Automation:**
    *   **`health.md` Report:** A human-readable summary report named `health.md` is automatically generated daily from the raw data in `health_events.log.md`. This report typically groups entries by date for easy review.
    *   **Configuration:**
        *   The daily generation of `health.md` can be toggled using the `PLUGIN_PERSONALHEALTH_DAILY_MARKDOWN_ENABLED` environment variable in your `.env` file (set to `true` to enable, `false` to disable).
        *   The schedule for this generation (default: 5:00 AM daily) can be customized via `appConfig` by setting `plugins.personalHealth.dailyReportCron` to your desired cron string.

### 3. Daily Review & Situational Awareness

*   **Goal:** Get a consolidated overview of your day and automate the gathering of routine information.
*   **`dailyReview` Plugin:**
    *   Provides a customizable daily summary that can be delivered via configured channels (e.g., email).
    *   **Content Modules:** You can choose what information to include:
        *   Calendar events for the day (integrates with the `gcal` plugin).
        *   Pending project actions (integrates with the `nextActions` plugin).
        *   Local weather forecast (integrates with a `weather` plugin).
        *   **Yesterday's health log summary** (compiled from the `personalHealth` plugin's data).
        *   (Other modules like inspirational quotes can be added).
    *   **Configuration:** Modules and delivery settings are primarily managed in the `config/dailyReview.json` file.
    *   **Automation:** The daily review generation and delivery is a scheduled task.

### 4. Unified API for External Integration

*   **Goal:** Provide a consistent and secure way for external tools and applications to interact with Wooster's capabilities.
*   **`ApiPlugin`:**
    *   Exposes key functionalities via a local HTTP API (default base URL: `/api/v1`).
    *   **Authentication:** The API supports security via:
        *   **API Key:** Set `PLUGIN_API_KEY` in your `.env` file and send it as a Bearer token in the `Authorization` header of your requests.
        *   **IP Whitelisting:** Enable with `PLUGIN_API_GLOBAL_IP_WHITELIST_ENABLED=true` and list allowed IPs in `PLUGIN_API_GLOBAL_ALLOWED_IPS` in your `.env` file.
    *   **Key Endpoints for Productivity:**
        *   `POST /api/v1/capture`: Captures text into `inbox.md`.
            *   Request Body: `{"text": "Content to capture"}`
        *   `POST /api/v1/health/events`: Logs an event to `health_events.log.md`.
            *   Request Body: `{"text": "Health event to log"}`

### 5. Extensible Scheduling & Automation

*   **Goal:** Allow Wooster and its plugins to perform tasks automatically on a recurring basis.
*   **Mechanism:** Plugins can define scheduled tasks (e.g., the `personalHealth` plugin schedules the daily generation of `health.md`; the `dailyReview` plugin schedules its summary).
*   **Underlying System:** Wooster's core scheduler manages these tasks.
*   **Transparency (Design Goal):** Wooster aims for a transparent scheduling system.
    *   *(Conceptual - for future implementation in Wooster Core)* A `scheduler_manifest.md` file will be generated to list all configured tasks, their schedules, and enabled statuses.
    *   *(Conceptual - for future implementation in Wooster Core)* A dedicated `logs/scheduler.log` will record when tasks are executed, aiding in debugging.

## Getting Started with Productivity Workflows

1.  **Configure your `.env` file:**
    *   Ensure `PLUGIN_CAPTURE_ENABLED=true` and `PLUGIN_SORTINBOX_ENABLED=true`.
    *   Enable `PLUGIN_PERSONALHEALTH_ENABLED=true`.
        *   Set `PLUGIN_PERSONALHEALTH_DAILY_MARKDOWN_ENABLED=true` if you want the daily `health.md` report.
    *   Enable `PLUGIN_DAILYREVIEW_ENABLED=true` and configure `config/dailyReview.json` as needed.
    *   Enable `PLUGIN_API_ENABLED=true` and set `PLUGIN_API_KEY` if you plan to use external tools like Shortcuts.
2.  **Interact with Wooster:** Start capturing items to your inbox, logging health events, and ask for your daily review.
3.  **Set up External Tools:** If using the API, configure your iPhone Shortcuts or other scripts to send data to the `/api/v1/capture` and `/api/v1/health/events` endpoints.

This Markdown-centric system provides a robust, flexible, and private foundation for managing your personal productivity with Wooster. 