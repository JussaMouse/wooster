# Wooster Productivity System Overview

## 1. Introduction

This document outlines the architecture and workflow of the Wooster productivity system. The primary goal is to provide a flexible and maintainable way to capture thoughts, tasks, and notes, and then process them efficiently.

## 2. Core Components & Workflow

The system revolves around a few key plugins and a central inbox file:

### 2.1. Capture Mechanism

**Goal:** To get items into the system quickly and reliably from various sources.

**a. `capture` Plugin:**
   - **Purpose:** Responsible for ingesting new items (notes, tasks, ideas).
   - **Input:** A text description of the item.
   - **Process:** When an item is captured, this plugin appends it as a new line to the `inbox.md` file.
   - **Timestamping:** Each item is timestamped with the **local date and time** of capture.
   - **Output Format in `inbox.md`:**
     ```markdown
     - [ ] YYYY-MM-DD HH:mm:ss The captured item description
     ```

**b. API Endpoint: `POST /api/v1/capture`**
   - **Provided by:** The `ApiPlugin`.
   - **Purpose:** Allows external applications (like an iPhone Shortcut) to send items to the `capture` plugin.
   - **Method:** `POST`
   - **Expected JSON Payload:** `{"description": "Text of the item to capture"}`
   - **Authentication:** Can be configured to use an API Key (sent as a Bearer token in the `Authorization` header) and/or IP whitelisting, as defined in the `.env` file (`PLUGIN_API_KEY`, `PLUGIN_API_GLOBAL_IP_WHITELIST_ENABLED`, `PLUGIN_API_GLOBAL_ALLOWED_IPS`).
   - **Workflow:** Receives the request -> Validates (auth, payload) -> Calls the `CaptureService` (provided by the `capture` plugin) -> `CaptureService` writes to `inbox.md`.

**c. iPhone Shortcut Integration:**
   - **Purpose:** Allows quick capture from an iPhone using Siri or the Shortcuts app.
   - **Mechanism:** The Shortcut is configured to take text input and send it to the `/api/v1/capture` endpoint.
   - **Setup Guide:** Detailed instructions for setting this up are in `docs/iphone_api_setup.md`.

**d. Agent Tool: `captureItem`**
   - **Provided by:** The `capture` plugin.
   - **Purpose:** Allows the Wooster agent itself to capture items directly to the `inbox.md` file based on user interaction or other automated processes.
   - **Input:** Text string to be captured.

### 2.2. Inbox & Processing

**Goal:** To systematically review and dispatch items that have been captured.

**a. `inbox.md` File:**
   - **Location:** Workspace root (e.g., `/Users/lon/projects/wooster/inbox.md`).
   - **Purpose:** Acts as the central, unprocessed inbox. All new items from any capture source land here.
   - **Format:** A plain text Markdown file where each line is a potential task or note, typically in the format mentioned above.

**b. `sortInbox` Plugin:**
   - **Purpose:** Provides a mechanism for the user to go through items in `inbox.md` one by one and decide what to do with them.
   - **Interaction Model:** Console-based. When invoked, it reads unprocessed items from `inbox.md`.
     - For each item, it prompts the user:
       - `Item: "<description>"`
       - `Action (s:skip, d:done, o:other [specify]): `
   - **Actions:**
     - **`s` (skip):** Leaves the item in `inbox.md` untouched for later processing.
     - **`d` (done):** Marks the item as completed in `inbox.md` by changing `- [ ]` to `- [x]`.
     - **`o` (other):** Removes the item from `inbox.md`. The user can specify further action details which are currently logged. (Future enhancement: integrate this with other tools/plugins).
   - **Agent Tool: `processInboxItems`**
     - **Provided by:** The `sortInbox` plugin.
     - **Purpose:** Allows the user (or an automated schedule) to initiate an interactive inbox sorting session via the Wooster agent.

## 3. Configuration & Environment

- **`.env` File:** Crucial for configuring API keys, ports, and enabling/disabling plugins (e.g., `PLUGIN_CAPTURE_ENABLED=true`, `PLUGIN_SORTINBOX_ENABLED=true`). An up-to-date `.env.example` is maintained.
- **`src/configLoader.ts`:** Loads configuration from environment variables and defaults.
- **`src/pluginManager.ts`:** Discovers and loads enabled plugins.
- **`src/agentExecutorService.ts`:** Initializes the agent and makes tools from enabled plugins available to it.

## 4. Overall Workflow Example

1.  **Capture:**
    - User has an idea: "Plan weekend trip".
    - User tells Siri: "Capture Wooster Task: Plan weekend trip".
    - iPhone Shortcut sends `{"description": "Plan weekend trip"}` to `POST /api/v1/capture`.
    - `ApiPlugin` receives it, authenticates, and passes it to `CaptureService`.
    - `capture` plugin writes to `inbox.md`:
      `- [ ] 2023-10-27 10:15:30 Plan weekend trip`
2.  **Processing:**
    - Later, user tells Wooster: `process my inbox` (or this could be a scheduled agent task).
    - Wooster agent calls the `processInboxItems` tool from the `sortInbox` plugin.
    - `sortInbox` plugin reads `inbox.md`.
    - In the console, Wooster shows: `Item: "Plan weekend trip"\nAction (s:skip, d:done, o:other [specify]):`
    - User types `o plan in calendar`.
    - `sortInbox` plugin removes the line from `inbox.md` and logs the intended action. (Future: this could trigger the calendar plugin).

## 5. Key Files for Reference

- **Capture Logic:** `src/plugins/capture/index.ts`
- **Inbox Sorting Logic:** `src/plugins/sortInbox/index.ts`
- **API Handling:** `src/plugins/api/index.ts`
- **iPhone Shortcut Guide:** `docs/iphone_api_setup.md`
- **This Document:** `docs/productivity_system_overview.md`

This overview should provide a good understanding of the current productivity system within Wooster. 