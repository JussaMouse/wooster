# NextActions Plugin

*   **Plugin Name**: `nextActions`
*   **Version**: `0.1.0`
*   **Description**: Manages and processes the Next Actions list, typically stored in `next_actions.md`.

## Core Functionality

The `nextActions` plugin is responsible for all operations related to managing your list of next actions. This includes:
*   Reading tasks from the `next_actions.md` file.
*   Parsing these tasks into a structured format.
*   Providing tools to view, add, complete, and edit tasks.
*   Writing changes back to the `next_actions.md` file.

It relies heavily on the `TaskParser` utility to understand and format tasks.

## Task Formatting (Crucial)

For the `nextActions` plugin to correctly interpret and manage your tasks, each task line in your `next_actions.md` file **must** adhere to a specific format. This format allows the underlying `TaskParser` to accurately extract information like contexts, projects, due dates, and unique task IDs.

**Key formatting conventions include:**
*   Prefixing contexts with `@` (e.g., `@home`, `@work`).
*   Prefixing projects with `+` (e.g., `+WoosterDevelopment`, `+HouseholdChores`).
*   Specifying due dates with `due:YYYY-MM-DD` (e.g., `due:2024-08-15`).
*   Including a unique ID as `(id:uuid-string-here)` (this is automatically managed by `TaskParser`).

**Refer to the [TaskParser documentation](../../docs/taskParser.md) for complete details on the expected task line format and how it populates the `TaskItem` object.** Deviations from this format can lead to tasks being misinterpreted.

## Agent Tools

The `nextActions` plugin provides the following tools for the agent to interact with your tasks:

*   **`viewNextActions`**:
    *   Views current next actions.
    *   Supports optional JSON input for filtering (by context, project, due date, status) and sorting (by file order, due date, project, context; ascending or descending).
    *   Example: `viewNextActions {"filters": {"context": "@work"}, "sortOptions": {"sortBy": "dueDate", "sortOrder": "asc"}}`

*   **`addNextAction`**:
    *   Adds a new next action.
    *   Requires a JSON input with at least a `description`. Can also include `context`, `project`, and `dueDate` (YYYY-MM-DD).
    *   Example: `addNextAction {"description": "Draft proposal for Q4", "project": "+WorkProject", "context": "@office", "dueDate": "2024-09-15"}`

*   **`completeNextAction`**:
    *   Completes a next action.
    *   Requires a JSON input with an `identifier` which can be the task's unique ID, a unique phrase from its description, or a line number (if recently viewed).
    *   Example: `completeNextAction {"identifier": "uuid-of-task-to-complete"}` or `completeNextAction {"identifier": "Draft proposal"}`

*   **`editNextAction`**:
    *   Edits an existing next action.
    *   Requires a JSON input with an `identifier` (must be the task ID) and an `updates` object containing the fields to change (e.g., `description`, `context`, `project`, `dueDate`, `isCompleted`). The task ID itself cannot be changed.
    *   Example: `editNextAction {"identifier": "uuid-of-task-to-edit", "updates": {"description": "Finalize and send Q4 proposal", "dueDate": "2024-09-20"}}`

## Interaction with `TaskParser`

All tasks read from or written to `next_actions.md` by this plugin are processed through the `TaskParser`.
*   When reading, `TaskParser.parse()` converts each line into a `TaskItem` object.
*   When writing, `TaskParser.serialize()` converts a `TaskItem` object back into a correctly formatted string.

This ensures data integrity and consistent formatting of your tasks. 