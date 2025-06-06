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
    *   This tool expects to be called with an object, which should contain a single key: `'input'`.
    *   The value for the `'input'` key must be a JSON string defining filters and/or sortOptions.
    *   To provide NO filters or sort options, the `'input'` key's value should be an **empty string** (e.g., called as `toolName({ input: '' })`) or the `'input'` key can be omitted entirely from the object passed to the tool.
    *   The JSON string, if provided and not empty, should represent an object like: `{ filters?: NextActionFilters, sortOptions?: NextActionSortOptions }`.
    *   Supported filters include `context`, `project`, `dueDate` ('today', 'tomorrow', 'YYYY-MM-DD'), `status` ('all', 'open', 'completed').
    *   Supported `sortBy` options are 'fileOrder', 'dueDate', 'project', 'context'. `sortOrder` can be 'asc' or 'desc'.
    *   Example of calling with filters: `toolName({ input: '{"filters": {"context": "@work"}, "sortOptions": {"sortBy": "dueDate"}}' })`
    *   Example of calling with no options (will list all): `toolName({ input: '' })` or just `toolName({})` if the agent can omit the input key when its value would be empty/undefined.

*   **`addNextAction`**:
    *   Adds a new next action.
    *   This tool expects to be called with an object containing a single key: `'input'`. The value for the `'input'` key must be a JSON string.
    *   This JSON string should represent an object with the following keys: `'description'` (string, required), and optional `'context'` (string), `'project'` (string), `'dueDate'` (string, YYYY-MM-DD).
    *   **Automatic Project Tagging**: If you add a task *without* specifying a project (either in the `project` field of the JSON input or as a `+project` tag within the `description` string), AND you have an active project set in Wooster (that is not "home"), then the system will automatically prepend the active project to your task (e.g., `+MyActiveProject Task description`).
    *   Example of how the agent should call the tool, providing the structured object with the `input` key: `toolName({ input: '{"description": "My new task", "context": "@home", "dueDate": "2024-12-01"}' })`
    *   The value of the `'input'` key (the JSON string itself) would look like: `'{"description": "My new task", "context": "@home", "dueDate": "2024-12-01"}'`

*   **`completeNextAction`**:
    *   Completes a single next action.
    *   This tool **MUST** be called with an object containing a single key: `'input'`.
    *   The value for this `'input'` key **MUST** be a JSON string.
    *   This JSON string **ITSELF MUST** represent an object with a single key: `'identifier'`.
    *   The value for `'identifier'` (inside the JSON string) should be the unique task ID (string), a unique phrase from the task's description (string), or the task's line number (number, if recently viewed).
    *   **Example Agent Calls:**
        *   To complete by task ID '123': `toolName({ input: '{"identifier": "123"}' })`
        *   To complete by line number 5: `toolName({ input: '{"identifier": 5}' })` (Note: the number 5 is valid JSON for the value here)
        *   To complete by description 'Buy milk': `toolName({ input: '{"identifier": "Buy milk"}' })`

*   **`editNextAction`**:
    *   Edits an existing next action.
    *   This tool **MUST** be called with an object containing a single key: `'input'`.
    *   The value for this `'input'` key **MUST** be a JSON string.
    *   This JSON string **ITSELF MUST** represent an object containing two keys:
        *   `'identifier'` (string, must be the task's unique ID).
        *   `'updates'` (an object with fields to change, e.g., `description`, `context`, `project`, `dueDate`, `isCompleted`). The task ID itself cannot be changed via the `'updates'` object.
    *   **Example Agent Call:** `toolName({ input: '{"identifier": "task-uuid", "updates": {"description": "New description", "dueDate": "2025-01-01"}}' })`

## Interaction with `TaskParser`

All tasks read from or written to `next_actions.md` by this plugin are processed through the `TaskParser`.
*   When reading, `TaskParser.parse()` converts each line into a `TaskItem` object.
*   When writing, `TaskParser.serialize()` converts a `TaskItem` object back into a correctly formatted string.

This ensures data integrity and consistent formatting of your tasks.

## Configuration

The `nextActions` plugin is configured through environment variables in your `.env` file:

*   `GTD_NEXT_ACTIONS_PATH`: The path to your `next_actions.md` file. Defaults to `gtd/next_actions.md` if `GTD_BASE_PATH` is set, or `./gtd/next_actions.md` otherwise.
*   `GTD_NEXT_ACTIONS_ARCHIVE_DIR_PATH`: The path to the directory where completed tasks are archived. Defaults to a subdirectory within your GTD base path or `logs/nextActionsArchive/`.
*   `GTD_NEXT_ACTIONS_VIEW_FORMAT`: A string to customize the display format of tasks when using the `show next actions` tool. If not set, it defaults to `'{checkbox} {context} {project}: {description} {dueDate}'`.

##### Custom View Formatting

You can control the exact appearance of tasks by setting the `GTD_NEXT_ACTIONS_VIEW_FORMAT` variable. The tool replaces placeholders in the string with task data.

**Available Placeholders:**
*   `{checkbox}`: Displays the task's completion status, like `[ ]` or `[x]`.
*   `{context}`: The task's context (e.g., `@work`).
*   `{project}`: The project's name (e.g., `MyProject`). This no longer includes brackets by default. The `+home` project is omitted.
*   `{description}`: The main text of the task.
*   `{dueDate}`: The due date, formatted as `due:YYYY-MM-DD`.
*   `{id}`: The unique identifier for the task.

**Important Note on Formatting:** If you wrap a placeholder in characters (e.g., `[{project}]`), and a task does not have that data (e.g., no project is assigned), the output may contain empty characters (e.g., `[]`). The template replacement is literal, so plan your format string accordingly.

**Example:**

To format tasks as `[ ] @context [ProjectName] The task description`, you would set this in your `.env` file:
```env
GTD_NEXT_ACTIONS_VIEW_FORMAT='{checkbox} {context} [{project}] {description}'
```

This allows for flexible and personalized views of your next actions. 