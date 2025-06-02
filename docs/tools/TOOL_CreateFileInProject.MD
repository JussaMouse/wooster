# Tool: Create File In Project (`createFileInProject`)

This document details the `createFileInProject` tool available to Wooster's agent.

## 1. Purpose

The `createFileInProject` tool allows the agent to create a new file with specified content directly within the currently active project's directory. This is useful for saving notes, data, code snippets, or any other textual information generated or processed by the agent into the project context.

## 2. Agent-Facing Description

When deciding to use this tool, the agent is provided with the following description from the tool's definition:

```
Creates a new file with specified content within the currently active project's directory. Input MUST be a valid JSON object with three string keys: 'relativeFilePath', 'content', and 'currentProjectName'. Example: { "relativeFilePath": "notes/my_idea.txt", "content": "This is a new idea.", "currentProjectName": "my_active_project" }. 'relativeFilePath' is the path for the new file, relative to the project's root. 'content' is the text to be written into the file. 'currentProjectName' is the name of the currently loaded project (e.g. 'home').
```

## 3. Tool Name

`createFileInProject`

## 4. Input Schema

- **Type**: `object` (or a JSON string that parses to this object)
- **Properties**:
    -   `relativeFilePath` (string, required):
        -   Description: The path for the new file, relative to the current project's root directory. It should include the filename and any subdirectories. Subdirectories will be created if they don't exist.
        -   Example: `"notes/meeting_summary.md"`, `"data/output.json"`, `"new_code.py"`
        -   Constraints: Must be a non-empty string. Must not use `.` or `..` to navigate outside the project.
    -   `content` (string, required):
        -   Description: The textual content to be written into the new file.
        -   Example: `"# Meeting Summary\n\n- Discussed X\n- Decided Y"`
    -   `currentProjectName` (string, required):
        -   Description: The name of the currently active project. The agent must obtain this from its context or prior conversation turns. This is crucial for ensuring the file is saved in the correct project directory.
        -   Example: `"my_research_project"`, `"home"`

**Example JSON Input:**

```json
{
  "relativeFilePath": "src/new_module.ts",
  "content": "export function hello(): void {\n  console.log(\"Hello, world!\");\n}",
  "currentProjectName": "typescript_utils"
}
```

## 5. Output

- **Type**: `string`
- **Success**: A confirmation message indicating the file was created successfully, e.g., `"File 'src/new_module.ts' created successfully in project 'typescript_utils'."`
- **Failure**: An error message detailing what went wrong, e.g., `"Error: File path is outside the project directory. Blocked for security reasons."` or `"Error: Invalid arguments. relativeFilePath - String must contain at least 1 character(s). Please provide 'relativeFilePath' (string), 'content' (string), and 'currentProjectName' (string)."`

## 6. Security Considerations

- The tool strictly enforces that files can only be written *within* the designated directory for the specified `currentProjectName` (i.e., `PROJECT_ROOT/projects/<currentProjectName>/`).
- Attempts to use relative paths like `../` to escape the project directory will be blocked.
- Empty file paths or paths pointing to the project directory itself are not allowed.

## 7. Agent Usage Guidance

- The agent **must** know the `currentProjectName`. This might be explicitly stated by the user, inferred from the conversation context, or be the default project (e.g., "home"). If unsure, the agent should ask the user to confirm the target project if a file creation is requested.
- The `relativeFilePath` should be chosen carefully. If the agent is generating code, it should use appropriate file extensions (e.g., `.py`, `.js`, `.md`).
- The agent should inform the user upon successful file creation or if an error occurs.
- This tool is for creating new files. For modifying existing files, a different tool would be required (not yet implemented). 