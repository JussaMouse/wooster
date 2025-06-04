# TaskParser Utility

The `TaskParser` utility (`src/taskParser.ts`) is a crucial component in Wooster for handling tasks consistently across different plugins. It works in tandem with the `TaskItem` interface (`src/types/task.ts`).

## Purpose

The primary purpose of `TaskParser` is to provide a standardized way to:
1.  **Parse** raw text lines from task files (e.g., `next_actions.md`) into structured `TaskItem` objects.
2.  **Serialize** `TaskItem` objects back into formatted text lines for writing to files.

This ensures that all plugins that read or write tasks do so in a consistent format, preventing errors and improving interoperability.

## `TaskItem` Interface

This interface (`src/types/task.ts`) defines the structured representation of a task in memory. Key fields include:

*   `id: string`: A persistent, unique identifier (UUID) for the task.
*   `rawText: string`: The original, full text of the task line.
*   `description: string`: The core actionable text of the task, after all recognized metadata has been extracted.
*   `isCompleted: boolean`: Whether the task is marked as done (e.g., `- [x]`).
*   `context?: string | null`: The context tag (e.g., `@home`).
*   `project?: string | null`: The project tag (e.g., `+US Trip`).
*   `dueDate?: string | null`: The due date in `YYYY-MM-DD` format.
*   `capturedDate?: string | null`: The date the task was captured (e.g., `(Captured: YYYY-MM-DD HH:MM:SS)` or `(Captured: YYYY-MM-DD)`).
*   `completedDate?: string | null`: The date the task was completed (e.g., `(Completed: YYYY-MM-DD HH:MM:SS)` or `(Completed: YYYY-MM-DD)`).
*   `additionalMetadata?: string | null`: Any other text enclosed in parentheses that isn\'t an ID, captured date, or completed date.

## `TaskParser` Class

This class (`src/taskParser.ts`) contains static methods for parsing and serializing tasks.

### `public static parse(rawText: string): TaskItem | null`

*   **Input**: A single line of text from a task file.
*   **Output**: A `TaskItem` object, or `null` if the line doesn\'t match the basic task structure.

**Parsing Process:**

1.  **Basic Structure Check**:
    *   The line must match `^(?:-\\s*\\[\\s*(x|\\s)\\]\\s+)(.*)$/i`. This identifies the checkbox (`- [ ]` or `- [x]`) and captures the rest of the line as the initial `descriptionContent`.
    *   If it doesn\'t match, `null` is returned.
    *   `isCompleted` is determined from the checkbox.

2.  **Metadata Extraction (from `descriptionContent`):**
    The parser then attempts to extract specific metadata components from `descriptionContent`. Each component, once identified, is removed from `descriptionContent` to prevent re-parsing. The order of extraction is important:

    *   **Task ID (`id`)**:
        *   Regex: `\\(id:\\s*([a-f0-9\\-]+)\\)/i`
        *   Extracts a UUID from an `(id: uuid-string)` pattern.
        *   If not found, a new UUID will be generated for the task later.
    *   **Context (`context`)**:
        *   Regex: `(?:^|\\s)(@\\w+)/`
        *   Extracts a context tag like `@work` or `@email`. It captures the `@` symbol and the following word characters.
    *   **Project (`project`)**:
        *   Regex: `(?:^|\\s)(\\+[\\w-]+(?:(?:\\s[A-Z][\\w-]*)+)?(?:\\s\\d+)?)`
        *   Extracts a project tag. This regex is designed to be flexible:
            *   It must start with `+` (e.g., `+Chores`).
            *   It can include multiple words, typically where subsequent words are capitalized (e.g., `+US Trip`, `+Camping At The Lake`).
            *   It can also include a trailing number (e.g., `+Vacation 2024`).
            *   Example matches: `+Shopping`, `+HomeImprovement`, `+Side Project Alpha`, `+Q4 Report 2025`.
            *   It aims to be non-greedy and avoid consuming general task description words.
    *   **Due Date (`dueDate`)**:
        *   Regex: `due:(\\d{4}-\\d{2}-\\d{2})\\b/i`
        *   Extracts a due date in `YYYY-MM-DD` format (e.g., `due:2024-12-31`).
    *   **Captured Date (`capturedDate`)**:
        *   Regex: `\\(Captured:\\s*([^)]+)\\)/i`
        *   Extracts the content of `(Captured: ...)` (e.g., `YYYY-MM-DD HH:MM:SS` or `YYYY-MM-DD`).
    *   **Completed Date (`completedDate`)**:
        *   Regex: `\\(Completed:\\s*([^)]+)\\)/i`
        *   Extracts the content of `(Completed: ...)` (e.g., `YYYY-MM-DD HH:MM:SS` or `YYYY-MM-DD`).
    *   **Additional Metadata (`additionalMetadata`)**:
        *   Regex: `\\((?!id:|Captured:|Completed:)([^)]+)\\)/i`
        *   After the specific parenthesized items above are checked, this regex captures the content of any other parentheses. This is a fallback for general notes or custom metadata not fitting other fields.

3.  **Final Description**:
    *   After all recognized tags and metadata are extracted and removed from `descriptionContent`, any remaining text (with extra spaces trimmed) becomes the final `task.description`.

4.  **ID Generation**:
    *   If no `(id:...)` was found and extracted in step 2a, a new UUID is generated and assigned to `task.id`.

### `public static serialize(task: TaskItem): string`

*   **Input**: A `TaskItem` object.
*   **Output**: A string formatted for writing to a task file.

**Serialization Process:**

The method reconstructs the task line in a specific order to ensure consistency:

1.  Starts with the checkbox: `- [ ]` or `- [x]` based on `task.isCompleted`.
2.  A temporary `description` string is initialized with `task.description`.
3.  **Project Prepending**: If `task.project` exists, it\'s prepended to the temporary `description` (e.g., `+US Trip actual description text`).
4.  **Context Prepending**: If `task.context` exists, it\'s prepended to the temporary `description` (e.g., `@home +US Trip actual description text`). Note: This means context appears before project if both exist.
5.  The `line` now consists of the checkbox and the combined, trimmed `description` (which includes context and project if they were present).
6.  **Due Date Appending**: If `task.dueDate` exists, ` due:YYYY-MM-DD` is appended.
7.  **Captured Date Appending**: If `task.capturedDate` exists, ` (Captured: ...)` is appended.
8.  **Completed Date Appending**: If `task.completedDate` exists, ` (Completed: ...)` is appended.
9.  **Additional Metadata Appending**: If `task.additionalMetadata` exists, ` (...)` is appended.
10. **ID Appending**: Finally, the task\'s `id` is always appended as ` (id: uuid-string)`.

The resulting line has any multiple spaces collapsed to single spaces and is trimmed.

**Example Serialized Output:**
`- [ ] @home +US Trip Plan packing list due:2024-08-01 (Captured: 2024-07-15) (id:123e4567-e89b-12d3-a456-426614174000)`

## Importance of Formatting

The accuracy of `TaskParser.parse()` heavily relies on the task lines adhering to these conventions. Deviations can lead to metadata being missed or incorrectly included as part of the main task description. The `TaskParser.serialize()` method ensures that tasks created or modified by Wooster are written back in the standard, parsable format.

## How Plugins Use `TaskParser`

*   **Reading Tasks**: When a plugin (like `nextActions`) reads a task file, it iterates through each line and uses `TaskParser.parse()` to convert it into a `TaskItem`. This structured data is then used for internal logic (filtering, sorting, display).
*   **Writing Tasks**: After modifying tasks (adding, completing, editing), plugins use `TaskParser.serialize()` on each `TaskItem` to get the correct string format before writing back to the file.
*   **Creating New Tasks**: When new tasks are generated (e.g., by `sortInbox` sending an item to `next_actions.md`, or `nextActions` adding a new task), a `TaskItem` object should be created and then serialized using `TaskParser.serialize()` to ensure it's stored in the standard format.

## Benefits

*   **Consistency**: Ensures all task-related operations across plugins use the same data structure and file format.
*   **Decoupling**: Centralizes task parsing/formatting logic, so individual plugins don't need to implement it themselves.
*   **Robustness**: Reduces errors from inconsistent string manipulation.
*   **Maintainability**: Simplifies updates to the task format; changes are mostly localized to `TaskParser`.
*   **Extensibility**: New task attributes can be added to `TaskItem` and supported in `TaskParser` for system-wide use. 