# Getting Things Done (GTD) with Wooster

This document outlines how Wooster can be used to implement David Allen's "Getting Things Done" (GTD) methodology. It describes the current capabilities, how different components work together, and areas for future improvement.

## 1. Introduction to GTD

Getting Things Done® is a productivity methodology that helps you achieve stress-free productivity. It involves a five-step process:

1.  **Capture:** Collect what has your attention.
2.  **Clarify:** Process what it means.
3.  **Organize:** Put it where it belongs.
4.  **Reflect:** Review frequently.
5.  **Engage:** Simply do.

Wooster aims to provide tools and a framework to support these steps within your digital environment.

## 2. Setting Up Your GTD System in Wooster

To effectively use Wooster for GTD, you'll need to configure a few things, primarily through environment variables in your `.env` file.

### Key Environment Variables:

Ensure the following plugins are enabled in your `.env` file:

```env
PLUGIN_CAPTURE_ENABLED=true
PLUGIN_SORTINBOX_ENABLED=true
PLUGIN_NEXTACTIONS_ENABLED=true
# PLUGIN_GCAL_ENABLED=true # Optional, for calendar integration
# PLUGIN_GTD_ENABLED=true # Currently a placeholder, but might be used for future GTD-specific orchestration
```

Configure your GTD file paths. These paths tell Wooster where to find and store your GTD-related information. It's recommended to have a main base directory for your GTD files (e.g., `gtd/`).

```env
# Main directory for GTD files
GTD_BASE_PATH=gtd/

# Specific file and directory paths (can be absolute or relative to GTD_BASE_PATH or workspace root)
# If GTD_BASE_PATH is set, these can be relative to it.
# Otherwise, ensure they are full paths or relative to the Wooster project root.

GTD_INBOX_PATH=gtd/inbox.md               # Your central inbox
GTD_NEXT_ACTIONS_PATH=gtd/next_actions.md   # Your list of next actions
GTD_SOMEDAY_MAYBE_PATH=gtd/someday_maybe.md # For items to review later
GTD_WAITING_FOR_PATH=gtd/waiting_for.md     # For delegated tasks or items you're awaiting
GTD_PROJECTS_DIR=projects/                # Directory to store notes for multi-step projects
GTD_ARCHIVE_DIR=logs/inboxArchive/        # Where processed inbox items and completed tasks are archived
```

### Recommended Directory Structure:

A common setup might look like this in your Wooster workspace:

```
wooster-project/
├── gtd/
│   ├── inbox.md
│   ├── next_actions.md
│   ├── someday_maybe.md
│   └── waiting_for.md
├── projects/
│   ├── project-alpha/
│   │   └── project-alpha.md  # Journal for Project-Alpha
│   └── project-beta/
│       └── project-beta.md
├── logs/
│   └── inboxArchive/       # Archived items
└── .env                    # Your environment configuration
```

## 3. The GTD Workflow with Wooster

Here's how Wooster supports each step of the GTD workflow:

### 3.1. Capture

*   **Goal:** Collect anything and everything that has your attention.
*   **Wooster Tool:** The `capture` plugin.
*   **How:**
    *   Use the agent command: `cap: Your thought or task here`
    *   This appends the item directly to your `gtd/inbox.md` file.
*   **Example:** `cap: Buy milk` or `cap: Draft proposal for Project X`

### 3.2. Clarify & Organize (Processing Your Inbox)

*   **Goal:** Decide what each inbox item is and what to do about it. Is it actionable? If so, what's the next action?
*   **Wooster Tool:** The `sortInbox` plugin.
*   **How:**
    *   Use the agent command: `sort inbox`
    *   This initiates an interactive command-line session where Wooster presents each item from `gtd/inbox.md` one by one.
    *   For each item, you'll be prompted to choose an action:
        *   `(t)rash`: Deletes the item.
        *   `(d)one`: Marks the item as completed and archives it. (Useful for quick tasks found in inbox).
        *   `(n)ext Action`: Moves the item to your `gtd/next_actions.md` list. You can add project/context tags (e.g., `+ProjectAlpha @home`) and due dates (`due:YYYY-MM-DD`).
        *   `(p)roject`:
            *   Create a new project: Wooster will create a new folder in your `GTD_PROJECTS_DIR`. The name you provide will be "slugified" (converted to lowercase, with spaces replaced by hyphens) to ensure consistent file and directory naming (e.g., "My New Project" becomes `projects/my-new-project/`). A main notes file (e.g., `my-new-project.md`) is also created, and the item is added as an initial task.
            *   Add to an existing project: Appends the item as a task to the selected project's main notes file.
        *   `(r)eference`: Adds the item as reference material to a selected project's main notes file (e.g., `projects/project-alpha/project-alpha.md`).
        *   `(s)omeday/Maybe`: Moves the item to `gtd/someday_maybe.md`.
        *   `(w)aiting For`: Moves the item to `gtd/waiting_for.md`. You'll be prompted for details (e.g., "Waiting for response from Bob").
        *   `(c)alendar`: Schedule the item. Wooster will attempt to parse date/time information (e.g., "tomorrow 3pm for 1 hour") and, if the `gcal` plugin is configured and `CalendarService` is available, create an event in your Google Calendar. If scheduling fails or the service isn't available, the item is typically moved to `next_actions.md` as a fallback.
        *   `(e)dit`: Opens the current inbox item in your system's default command-line editor (`$EDITOR`) for modification before further processing.
*   **Outcome:** Your inbox is emptied, and items are routed to their appropriate lists or destinations.

### 3.3. Organize (Managing Next Actions)

*   **Goal:** Maintain a clear and actionable list of your immediate tasks.
*   **Wooster Tool:** The `nextActions` plugin, operating on `gtd/next_actions.md`.
*   **How (using Agent commands):**
    *   **View Tasks:** `show next actions`
        *   Displays a user-friendly, numbered list of your open next actions.
        *   Supports JSON input for filtering (by context, project, due date, status) and sorting. Example: `show next actions {"filters": {"project": "+ProjectAlpha"}}`
    *   **Add Task:** `addNextAction {"description": "My new task @context +project", "dueDate": "YYYY-MM-DD"}`
        *   Directly adds a new task to `next_actions.md`.
    *   **Complete Task:** `completeNextAction {"identifier": "unique phrase from task or task_id"}`
        *   Marks the specified task as done and archives it. You can use a unique phrase from the task description or its ID (if known).
*   **Interactive Mode:** The `nextActions` plugin also has its own interactive CLI mode (can be triggered by a dedicated command if one is set up, or developer-invoked) for `l`ist, `a`dd, `d`one, `e`dit (edit not fully implemented yet).
*   **Task Format:** Tasks in `next_actions.md` can include contexts (`@home`), projects (`+ProjectX`), due dates (`due:YYYY-MM-DD`), and are automatically assigned a unique ID for robust tracking.

### 3.4. Reflect (Review)

*   **Goal:** Regularly review your lists and system to ensure it's up-to-date and complete.
*   **Wooster Current Capability:**
    *   Wooster currently **lacks dedicated tools or automated prompts** for comprehensive GTD reviews (e.g., a "Weekly Review" checklist or reminders to check `someday_maybe.md`).
    *   **Manual Review:** You'll need to manually open and review your `gtd/someday_maybe.md` and `gtd/waiting_for.md` files. You can use standard agent file reading tools if available and configured (e.g., `read_file_content`) for this.
    *   Project reviews also require manual navigation to project directories and files.
*   **Future Potential:** This is a key area for future Wooster enhancements, such as a "Weekly Review" plugin or agent prompts.

### 3.5. Engage (Do)

*   **Goal:** Execute your next actions.
*   **Wooster's Role:** By providing a clear, filterable, and sortable list of your next actions (via `viewNextActions`), Wooster helps you decide what to work on with confidence.

## 4. Advanced Configuration & Underlying Files

*   **Task Parsing (`TaskParser.ts`):** Wooster uses a sophisticated parser to understand and manage task metadata (contexts, projects, due dates, completion status, IDs) within your `.md` files. This allows for flexibility in how you write your tasks while enabling structured data retrieval.
*   **Archive:** Processed inbox items and completed next actions are moved to the directory specified by `GTD_ARCHIVE_DIR` (e.g., `logs/inboxArchive/`). Each archived item is typically saved as a separate `.md` file with a timestamp and metadata.

## 5. Current Status & Future Roadmap

### Strengths:

*   **Solid Capture & Inbox Processing:** The flow from capturing an idea to processing it through the `sortInbox` plugin is robust and feature-rich, including calendar integration.
*   **Effective Next Actions Management:** The `nextActions` plugin provides good tools for viewing, adding, and completing tasks.
*   **High Configurability:** `.env` variables for all key GTD file paths allow users to tailor the system to their preferred directory structure.
*   **Modularity:** The plugin-based architecture allows for independent development and enhancement of each GTD component.

### Current Gaps & Areas for Improvement:

*   **Formal Review Process:** The biggest gap is the lack of dedicated support for GTD review cycles (weekly, monthly).
*   **Project Management Depth:**
    *   Project-related functionality is basic. Enhanced tools for listing projects, viewing project-specific tasks across different states, and managing project metadata would be beneficial.
    *   Reference material handling could be more structured.
*   **Contextual Views:** While contexts can be assigned, viewing tasks by context across *all* GTD lists (not just next actions) isn't directly supported by a dedicated tool.
*   **`gtd` Plugin Role:** The dedicated `gtd` plugin is currently a placeholder and could be expanded to orchestrate GTD reviews or provide high-level dashboard-like views of the GTD system.

### Potential Future Features:

*   A "Weekly Review" plugin/agent prompt sequence.
*   Enhanced project management tools.
*   Dedicated views for "Someday/Maybe" and "Waiting For" lists.
*   More sophisticated context-based filtering and views.

By understanding these components and configurations, you can effectively leverage Wooster as a powerful digital assistant for implementing your Getting Things Done system. 