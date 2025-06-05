# Wooster Installation State: Plugins & Core Capabilities

This document outlines the detected plugins, their provided tools, and core system capabilities available in this Wooster installation. This information is based on an analysis of the system logs and recent updates, primarily around early May 2025.

## Plugins

This section lists all active plugins and the specific tools or major capabilities they provide.

### API Plugin (api)
-   **Version:** 1.0.0
-   **Capabilities:** Provides API endpoints for external interactions (e.g., item capture, health event logging). Does not provide direct agent tools.

### Capture Plugin (capture)
-   **Version:** 1.1.0
-   **Tools:**
    -   `captureItem`: Captures a new item, note, or task to the configured inbox file.

### Daily Review Plugin (dailyReview)
-   **Version:** 1.1.0
-   **Tools:**
    -   `get_daily_review`: Generates and returns the current daily review content as a JSON string.
    -   `get_daily_review_help`: Provides detailed help and current configuration status for the Daily Review feature.
-   **Other Capabilities:**
    -   Scheduled daily review email generation.
    -   Consumes `GetOpenNextActionsService` to include next actions in the review.

### Google Calendar Plugin (gcal)
-   **Version:** 1.1.0
-   **Tools:**
    -   `get_calendar_events`: Provides a summary of calendar events.
    -   `create_calendar_event`: Creates new events in Google Calendar.
-   **Services Provided:**
    -   `ListCalendarEventsService`
    -   `CalendarService`

### Gmail Plugin (gmail)
-   **Version:** 1.1.0 (Reflects update to StructuredTool for `send_email`)
-   **Tools:**
    -   `send_email`: Sends an email with specified 'to', 'subject', and 'body'.
-   **Services Provided:**
    -   `EmailService`

### Next Actions Plugin (nextActions)
-   **Version:** 0.2.0 (Reflects addition of GetOpenNextActionsService)
-   **Tools:**
    -   `viewNextActions`: Views current next actions.
    -   `addNextAction`: Adds a new next action.
    -   `completeNextAction`: Completes a single next action.
    -   `editNextAction`: Edits an existing next action.
-   **Services Provided:**
    -   `GetOpenNextActionsService`

### Personal Health Plugin (personalHealth)
-   **Version:** 2.1.0
-   **Tools:**
    -   `logHealthEvent`: Logs a health-related event (e.g., 'ran 3 miles', 'slept 8 hours').
    -   `generateHealthReport`: Generates a human-readable health report (health.md).
-   **Services Provided:**
    -   `PersonalHealthService`
-   **Other Capabilities:**
    -   Scheduled daily health report generation.

### Project Manager Plugin (projectManager)
-   **Version:** 0.1.4
-   **Tools:**
    -   `createProject`: Creates a new project.
    -   `openProject`: Opens an existing project and sets it as active.
    -   `renameProject`: Renames an existing project.
    -   `listFilesInActiveProject`: Lists files and directories in the currently active project.

### Sort Inbox Plugin (sortInbox)
-   **Version:** 1.5.0
-   **Tools:**
    -   `sortInboxInteractively`: Starts an interactive session to process items in the inbox.md file.
    -   `addWaitingForItem`: Adds an item to the 'Waiting For' list (waiting_for.md).
    -   `viewWaitingForItems`: Reads and displays the content of the 'waiting_for.md' file.
    -   `viewInboxItems`: Reads and displays the content of the 'inbox.md' file.

### Time Management Plugin (timeManagement)
-   **Version:** 0.1.1
-   **Tools:**
    -   `scheduleTimeBlock`: Schedules a time block in your calendar.
-   **Services Provided:**
    -   `TimeManagementService`

### User Profile Plugin (userProfile)
-   **Version:** 1.0.5 (Reflects refactoring to StructuredTools and UserProfileService)
-   **Tools:**
    -   `recall_user_profile`: Recalls stored user profile information based on a topic.
    -   `save_user_profile`: Saves or updates information (fact_category, fact_value) in the user profile.
-   **Services Provided:**
    -   `UserProfileService`

### Weather Plugin (weather)
-   **Version:** 1.0.1
-   **Tools:**
    -   `get_weather_forecast`: Provides the current weather forecast for the pre-configured city.
-   **Services Provided:**
    -   `getWeatherForecastFunction` (Exposed as a service for other components, like Daily Review).

### Web Search Plugin (webSearch)
-   **Version:** 1.0.1
-   **Tools:**
    -   `web_search`: Searches the web for current information using Tavily Search.

## Core System Tools & Capabilities

These are built-in tools and capabilities not tied to a specific dynamically loaded plugin listed above. They are fundamental to Wooster's operation.

-   **`queryKnowledgeBase`**
    -   **Description:** Searches and answers questions based exclusively on the documents and knowledge within the currently active project's vector store (RAG).
-   **`scheduleAgentTask`**
    -   **Description:** Schedules a task for the agent to perform at a specified future time using the system's scheduler.
-   **`create_file`**
    -   **Description:** Creates a new file with specified content within the active project's directory.
-   **`read_file_content`**
    -   **Description:** Reads and returns the entire content of a specified file within the active project.

---
*This document reflects the state of Wooster based on analysis around early May 2025. Plugin versions and tool availability may change with ongoing development.* 