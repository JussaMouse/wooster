# Plugin: Task Capture

**Version:** 0.1.0
**Author:** Wooster AI Assistant
**Description:** Provides a quick and reliable system for capturing tasks, ideas, and reminders.

## Features

*   **Capture Tasks:** Allows users to quickly save tasks or notes via an agent tool.
*   **Persistent Storage:** Tasks are stored in a dedicated SQLite database.
*   (Future) List open tasks.
*   (Future) Categorize tasks.
*   (Future) Add due dates and priorities.
*   (Future) Integrate with `DailyReviewPlugin` to show pending tasks.

## Configuration

*   **Environment Variable:** `PLUGIN_TASKCAPTURE_ENABLED`
    *   **Description:** Controls whether the Task Capture plugin is active.
    *   **Default:** `true` (if not set, the plugin will be enabled by default).
    *   **Values:** `true` or `false`.
    *   **Example:** `PLUGIN_TASKCAPTURE_ENABLED=true`
*   **Database File:**
    *   **Location:** `database/task_capture.sqlite3` (relative to the project root).
    *   **Details:** The plugin will automatically create and manage this SQLite database file. Ensure the `database` directory is writable by the application.

## Dependencies

*   None beyond standard Wooster core services.

## API Endpoint (Optional)

The Task Capture plugin can expose an HTTP API endpoint to allow capturing tasks from external sources (e.g., Siri Shortcuts, scripts).

*   **Configuration (Environment Variables):**
    *   `PLUGIN_TASKCAPTURE_API_ENABLED`: Set to `true` to enable the API endpoint. Defaults to `false`.
    *   `PLUGIN_TASKCAPTURE_API_PORT`: The port on which the API server will listen. Defaults to `3002`.
    *   `PLUGIN_TASKCAPTURE_API_KEY`: A secret API key that must be provided by clients for authentication.
        *   **Security Note:** It's crucial to use a strong, unique API key if the Wooster instance is accessible from the internet.
        *   **Generating an API Key:** You can generate a cryptographically strong key using Node.js in your terminal:
            ```bash
            node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
            ```
            Copy the output of this command and use it as the value for `PLUGIN_TASKCAPTURE_API_KEY` in your `.env` file.
            If not set, the API will not require authentication (not recommended for publicly exposed servers).
    *   `PLUGIN_TASKCAPTURE_API_WHITELIST_ENABLED`: Set to `true` to enable IP address whitelisting. Defaults to `false`.
    *   `PLUGIN_TASKCAPTURE_API_ALLOWED_IPS`: A comma-separated list of IP addresses that are allowed to access the API if whitelisting is enabled (e.g., "192.168.1.100,::1"). If whitelisting is enabled and this list is empty, no IPs will be allowed (effectively blocking all access).
*   **Endpoint:** `POST /capture`
*   **Authentication & Authorization:**
    *   **IP Whitelisting:** If `PLUGIN_TASKCAPTURE_API_WHITELIST_ENABLED` is `true`, the request's source IP address must be in the `PLUGIN_TASKCAPTURE_API_ALLOWED_IPS` list. If not, the request is rejected with a `403 Forbidden` status *before* API key checking.
    *   **API Key:** If `PLUGIN_TASKCAPTURE_API_KEY` is set, requests must include an `Authorization` header with the value `Bearer YOUR_API_KEY`. This is checked *after* IP whitelisting (if enabled).
*   **Request Body (JSON):**
    ```json
    {
      "description": "The task to capture"
    }
    ```
*   **Responses:**
    *   `200 OK`: Task captured successfully. Body: `{"message": "Task captured"}`
    *   `400 Bad Request`: Invalid request (e.g., missing description). Body: `{"error": "Description is required"}`
    *   `401 Unauthorized`: Missing or invalid API key (and IP was whitelisted or whitelisting is disabled).
    *   `403 Forbidden`: Source IP not in whitelist (if whitelisting is enabled).
    *   `500 Internal Server Error`: Error saving the task.

## Agent Tools

### 1. `captureTask`

*   **Description:** Saves a new task or note to the user's task list.
*   **Invocation:** Natural language, e.g., "Wooster, capture task: Buy milk after work" or "Add to my list: research new Javascript frameworks."
*   **Input (extracted by LLM):**
    *   `description` (string): The content of the task or note (e.g., "Buy milk after work").
*   **Output:**
    *   Success: "OK, I've captured: '[description]'."
    *   Failure: "Sorry, I couldn't capture that task. [Reason for failure]."

## Database Schema

The plugin will use a table named `tasks` with the following (initial) structure:

*   `id` (INTEGER PRIMARY KEY AUTOINCREMENT): Unique identifier for the task.
*   `description` (TEXT NOT NULL): The content of the task.
*   `status` (TEXT NOT NULL DEFAULT 'pending'): Current status of the task (e.g., 'pending', 'completed', 'deferred').
*   `createdAt` (TEXT NOT NULL): ISO 8601 timestamp of when the task was created.
*   `updatedAt` (TEXT NOT NULL): ISO 8601 timestamp of when the task was last updated.
*   (Future fields: `dueDate` TEXT, `priority` INTEGER, `category` TEXT)

## Future Ideas

*   Tools to query and manage tasks (list, complete, delete, update).
*   Ability to add metadata like due dates, projects, or contexts (GTD-style).
*   Synchronization with external task management services (e.g., Todoist, Asana - very ambitious).
*   Reminders for due tasks. 