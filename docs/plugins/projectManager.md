# Wooster Plugin: Project Manager (`projectManager`)

**Version: 0.1.4**

## 1. Purpose

The `ProjectManagerPlugin` provides tools for managing projects within Wooster. Its key capabilities include creating new projects (which includes a project journal file), opening existing ones (automatically setting them as the active project), renaming projects, and listing files within the active project.

Future enhancements could include listing projects or other project-specific operations.

## 2. Setup & Configuration

To enable this plugin, ensure the following environment variable is set in your `.env` file:

```env
PLUGIN_PROJECTMANAGER_ENABLED=true
```

The plugin relies on the `projects` base directory (typically `projects/` relative to Wooster's root) to find and create project directories.

## 3. Provided Agent Tools

### 3.1. `createProject`

*   **Name:** `createProject`
*   **Description:** Creates a new project with the given name and sets it as the active project. Usage: `createProject project_name`
*   **Input:** `projectName: string` - The desired name for the new project. This should be a single string argument provided to the tool.
*   **Functionality:**
    *   Takes the provided `projectName`.
    *   Uses the `createNewProject` utility (`src/plugins/projectManager/createNewProject.ts`) to perform the actual file system operations. This involves creating a new directory named `projectName` (e.g., `projects/MyNewProject/`).
    *   It also creates a project journal file (e.g., `projects/MyNewProject/MyNewProject.md` with a heading like `# Journal: MyNewProject`) populated with default sections.
    *   **Crucially, it then attempts to set this newly created project as the active project within Wooster's core system.**
*   **Output:**
    *   On success: Returns a message like `"Project '[projectName]' created successfully. Path: [path/to/projectName.md]. It is now the active project."` or a message indicating if activation was not possible (though this is less likely with recent core changes).
    *   On failure (e.g., project already exists, invalid name, configuration issue, file system error): Returns an error message like `"Error creating project: [reason]"`.
*   **Example Agent Interaction:**
    ```
    User: create new project AlphaFoxtrot
    Agent: (Calls `createProject` tool with "AlphaFoxtrot")
    Tool Response: Project 'AlphaFoxtrot' created successfully. Path: projects/AlphaFoxtrot/AlphaFoxtrot.md. It is now the active project.
    Agent: Okay, I've created the project "AlphaFoxtrot" for you, and it's now the active project. The project journal file is at projects/AlphaFoxtrot/AlphaFoxtrot.md.
    ```
    Or in case of an error:
    ```
    User: create new project MyExistingProject
    Agent: (Calls `createProject` tool with "MyExistingProject")
    Tool Response: Error creating project: Project 'MyExistingProject' already exists at projects/MyExistingProject.
    Agent: It looks like a project named "MyExistingProject" already exists at projects/MyExistingProject.
    ```

### 3.2. `openProject`

*   **Name:** `openProject`
*   **Description:** Opens an existing project by its name and attempts to set it as the active project. This tool supports fuzzy matching for the project name.
*   **Input:** `projectName: string` - The name of the project to open.
*   **Functionality:**
    *   Takes the provided `projectName`.
    *   Uses an internal helper (`findMatchingProjectName`) to find the best match for the project name among the existing project directories (e.g., in `projects/`). It attempts exact matches, case-insensitive matches, and normalized matches (ignoring spaces, hyphens, underscores).
    *   If a clear match is found, it calls the `setActiveProjectInCore` utility to request Wooster's core system to make this project the active one. This involves re-initializing the project-specific vector store and updating the agent's context.
    *   If no match is found, or if the input is too ambiguous (matching multiple projects equally well), it informs the user.
*   **Output:**
    *   **Success:** `"Project '[matchedProjectName]' is now the active project."`
    *   **No Match:** `"No project found matching '[projectName]'."`
    *   **Ambiguous Match:** `"Your request '[projectName]' is ambiguous and could refer to multiple projects: [list of matches]. Please be more specific."`
    *   **Error:** `"Error opening project '[projectName]': [reason]"` (e.g., if setting active fails unexpectedly).
*   **Example Agent Interaction:**
    ```
    User: open project my notes
    Agent: (Calls `openProject` tool with "my notes")
    Tool Response: Project 'My Notes' is now the active project.
    Agent: Okay, I've opened your project "My Notes" and it's now the active project.
    ```
    ```
    User: open project nonExistent
    Agent: (Calls `openProject` tool with "nonExistent")
    Tool Response: No project found matching 'nonExistent'.
    Agent: I couldn't find a project named "nonExistent".
    ```

### 3.3. `renameProject`

*   **Name:** `renameProject`
*   **Description:** Renames an existing project. Input must be a JSON string with 'currentName' (the project to rename) and 'newName' (the desired new name). Example: `{"currentName": "old-project-name", "newName": "new-project-name"}`
*   **Input:** `jsonInput: string` - A JSON string containing `currentName` and `newName`.
*   **Functionality:**
    *   Parses the JSON input to get `currentName` and `newName`.
    *   Performs validation on the names.
    *   Calls the `performRenameProject` utility which handles the actual directory renaming and updates to the project's journal file if necessary.
    *   If the renamed project was the active project, it attempts to update the active project context in Wooster's core.
*   **Output:** A message indicating success or failure, e.g., `"Project 'old-name' renamed to 'new-name' successfully."` or an error message.
*   **Example Agent Interaction:**
    ```
    User: rename project "old docs" to "current documentation"
    Agent: (Calls `renameProject` tool with '{"currentName": "old docs", "newName": "current documentation"}')
    Tool Response: Project 'old docs' renamed to 'current documentation' successfully.
    Agent: Okay, I've renamed the project "old docs" to "current documentation".
    ```

### 3.4. `listFilesInActiveProject`

*   **Name:** `listFilesInActiveProject`
*   **Description:** Lists files and directories in the currently active project. Ignores common system files (like `.DS_Store`) and the project's vector store directory (`vectorStore`, `faiss.index`, `docstore.json`).
*   **Input:** This tool requires no functional parameters. If the agent MUST provide an input object, it should use `{"input": ""}`; this input will be ignored by the tool.
*   **Functionality:**
    *   Retrieves the path of the currently active project using `CoreServices.getActiveProjectPath()`.
    *   If no project is active, it returns a message indicating so.
    *   If a project is active, it reads the contents of the project directory.
    *   Filters out predefined ignored items (e.g., `.DS_Store`, `vectorStore`, `faiss.index`, `docstore.json`).
    *   Returns a list of the remaining file and directory names.
*   **Output:**
    *   If successful and files are found: `"Files in active project '[ProjectName]':\nfile1.md\ndirectoryA\nnotes.txt"`
    *   If the project directory is empty or only contains ignored files: `"The active project directory '[ProjectName]' is empty or contains only ignored files."`
    *   If no project is active: `"No project is currently active. Please open or create a project first."`
    *   On error (e.g., project path doesn't exist): An error message detailing the issue.
*   **Example Agent Interaction:**
    ```
    User: list the files in my current project
    Agent: (Calls `listFilesInActiveProject` tool)
    Tool Response: Files in active project 'MyNotes':\nmain_notes.md\nideas.txt\nresearch_links.md
    Agent: Okay, here are the files in your active project "MyNotes":\n- main_notes.md\n- ideas.txt\n- research_links.md
    ```

## 4. Dependencies

*   `createNewProject` utility from `src/plugins/projectManager/createNewProject.ts` for project creation logic.
*   `setActiveProjectInCore` utility from `src/setActiveProject.ts` for interacting with the core project activation mechanism.
*   Relies on the `CoreServices.setActiveProject` method being available from Wooster's core.
*   Application Configuration (`AppConfig`) to determine project paths.
*   Logger (`src/logger.ts`).
*   `fs` module for file system interactions.
*   `performRenameProject` utility from `src/plugins/projectManager/renameProject.ts`.
*   Relies on the `CoreServices.getActiveProjectPath` method being available from Wooster's core.

## 5. Future Enhancements

*   Tool to list existing projects (distinct from files in active project).
*   Tools for archiving or deleting projects.
