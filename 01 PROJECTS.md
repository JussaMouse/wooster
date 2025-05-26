# Wooster Project Management

Wooster organizes its knowledge into "Projects." It always operates within the context of an **active project**, allowing it to focus its information retrieval and knowledge on a specific set of documents or code.

## 1. The "Home" Project - Your Default Context

- On startup, Wooster automatically creates a directory at `projects/home/` if it doesn't already exist.
- This "home" project is then loaded and becomes the **active project** by default.
- You can add any general documents or notes to the `projects/home/` directory that you want Wooster to have access to as a baseline.

## 2. Defining and Creating Projects

There are two main ways to define and work with projects beyond the default "home" project:

**a) Directory-Based Projects (Simple & Recommended):**
- Simply create a new directory inside the `projects/` folder in your Wooster workspace (e.g., `mkdir projects/my_research`).
- Add your files (documents, code, notes) into this new directory.
- Use the `load project my_research` or `create project my_research` command in Wooster's REPL (see section 3).

**b) Using `projects.json` (Optional, for advanced cases):**
- For projects located outside the standard `projects/` directory, or for those requiring complex file glob patterns, you can (optionally) define them in a `projects.json` file at the root of your Wooster workspace.
- This file maps a project name to a directory path or an array of glob patterns.
Example `projects.json`:
```json
{
    "wooster_codebase": ["src/**/*.ts", "README.md", "*.MD"],
    "external_docs": "/Users/yourname/Documents/important_pdfs"
  }
  ```
- When `load project <name>` is used, and `<name>` is found in `projects.json`, Wooster will use the specified paths/patterns to find files.

## 3. Managing Active Projects via REPL Commands

- **`create project <name_or_path>`**
  1.  **Directory Creation**: 
      *   If `<name_or_path>` is a simple name (e.g., `my_new_project`), Wooster creates a directory at `projects/my_new_project/`.
      *   If `<name_or_path>` is a full path (e.g., `/Users/me/special_project`), Wooster attempts to create that directory.
  2.  **Activation**: After successful directory creation, this new project becomes the **active project**.
      *   `currentProjectName` is set to the base name of the project path.
      *   `createProjectStore(currentProjectName)` from `src/projectIngestor.ts` is called. This function:
          *   Finds all files within the newly created project directory.
          *   Loads their content, splits it, generates embeddings, and builds a new, in-memory `FaissStore` specifically for this project.
      *   The RAG chain is re-initialized (`initializeRagChain()`) to use this new project-specific vector store.
  3.  **Effect**: Wooster is now focused on the content (if any) of this newly created and activated project.

- **`load project <name>`**
  1.  The `currentProjectName` is updated to `<name>`.
  2.  `createProjectStore(name)` is called. This function:
      *   If `<name>` is defined in `projects.json`, it uses those file paths/glob patterns.
      *   Otherwise, it assumes `<name>` corresponds to a directory at `projects/<name>/`.
      *   It reads all relevant files, processes them (loads, splits, embeds), and constructs a new, in-memory `FaissStore` for this project.
      *   **Note**: Project-specific vector stores are built in-memory on each load and are *not* saved to or loaded from `vector_data/` for individual projects (unlike the UCM store).
  3.  The RAG chain is re-initialized (`initializeRagChain()`) to use the new project-specific `vectorStore`.
  4.  **Effect**: Wooster's knowledge is now focused on the documents within the loaded project.

- **`quit project`** (Alias: `exit project`)
  1.  This command switches the active project back to the default **"home"** project.
  2.  `currentProjectName` is set to `'home'`.
  3.  The "home" project is loaded by calling `createProjectStore('home')`, building its in-memory vector store from files in `projects/home/`.
  4.  The RAG chain is re-initialized to use the "home" project's vector store.
  5.  **Effect**: Wooster reverts to its baseline knowledge context.

## 4. How Projects Affect RAG (Information Retrieval)

When you ask Wooster a question or give it a task that requires information from its knowledge base:

1.  The RAG chain uses a retriever associated with the **currently active project's** in-memory `FaissStore`.
2.  Similarity searches for relevant information are performed *only* against the documents and text chunks that were part of that active project when it was loaded or created.
3.  This ensures that answers and actions are grounded in the specific context you've set by choosing the active project.

## 5. Adding or Modifying Files in a Project

- If you add new files to a project's directory (e.g., add a new note to `projects/my_research/`) or modify existing files:
  1.  Save your changes to the files.
  2.  In the Wooster REPL, simply run `> load project <project_name>` again (e.g., `> load project my_research`).
- This will trigger `createProjectStore` to re-read all files for that project, including your new/modified ones, and rebuild its in-memory vector store with the updated content.
- There is no need to manually delete any cached vector data for projects; they are always built fresh from the source files on load.

## 6. Example Interaction

```bash
> list files 
# (Lists files in the default 'home' project)

> create project meeting_notes
✅ Project "meeting_notes" created and is now active.
# (Now, manually add some .txt files into the projects/meeting_notes/ directory)

> load project meeting_notes
✅ Project "meeting_notes" loaded.

> list files
# (Lists files in the 'meeting_notes' project)

> What was discussed in the Q3 planning session?
Assistant: (Responds based on content in `projects/meeting_notes/`)

> quit project
✅ Switched to "home" project.

> list files
# (Lists files in the 'home' project again)
```

## 7. Implementation Details
- **Core Logic**: `createProjectStore(projectName)` in `src/projectIngestor.ts` is responsible for finding files (using `projects.json` or `projects/<name>/` convention) and building the in-memory `FaissStore`.
- **File Discovery**: Uses `fast-glob` for finding files based on patterns or directory listings.
- **Embeddings**: `HuggingFaceTransformersEmbeddings` (`Xenova/all-MiniLM-L6-v2`).
- **Vector Store**: `FaissStore` (in-memory for active project).
- **REPL Commands**: Handled in `src/index.ts`.

This project system allows Wooster to maintain a focused context, improving relevance and performance, while providing flexibility in how you organize and access your information. 

## 8. Project-Specific Notes (`[projectName].md`)

### Overview of Project Notes

The Project Notes system is designed to enhance Wooster's contextual understanding and provide users with a persistent, evolving record of their interactions and Wooster's activities within a specific project. This is achieved through an automatically managed Markdown file, typically named `[projectName].md`, located in the root of the project directory.

### The `[projectName].md` File

#### Purpose

This file serves as a "living document" or a project diary, primarily maintained by Wooster through direct logging. Its goals are to:

1.  **Track Project Context:** Record key information relevant to the current project.
2.  **Log User Interactions:** Capture truncated user inputs and Wooster responses.
3.  **Record Wooster's Actions:** Log tool executions with their inputs and results.
4.  **Improve Transparency:** Allow users to see a history of interactions and actions within the project.

#### Automatic Creation and Naming

-   When Wooster starts or a new project context is established (e.g., via `create project` or `load project`), it will check for the existence of `[projectName].md` (e.g., `my-web-app.md` if the project is `my-web-app`) using the `initProjectMetadataService` and `ensureProjectMDFile` functions.
-   If the file does not exist, Wooster will automatically create it with a default template using `getDefaultProjectMDContent`.

#### Default File Structure

The `[projectName].md` file is organized into several sections:

```markdown
# Project: [ProjectName]

## Project Overview
(A brief, high-level summary of the project. Wooster may attempt to populate this based on interactions, or the user can edit it directly. Currently, this section is primarily for manual user input.)

## Ingested Documents
(A list of documents, data sources, or URLs that have been ingested by Wooster for RAG and knowledge base purposes within this project. Currently, this section is primarily for manual user input or for plugins/tools to potentially write to if designed to do so.)

## Conversation Log & Key Decisions
(Chronological log of user-Wooster interactions. Wooster automatically appends truncated user inputs and assistant responses here via `logConversationTurn`.)

## Wooster Actions
(A log of significant actions performed by Wooster, specifically tool executions. Wooster automatically appends tool name, input, and result here via `logWoosterAction`.)

## Tasks & TODOs
(A list of tasks or to-do items identified during conversations. Currently, this section is primarily for manual user input or for plugins/tools to potentially write to.)
```

### Maintenance and Updates

#### Logging New Information

Wooster automatically appends information to specific sections of `[projectName].md` as events occur:

-   **Conversation Log & Key Decisions:** After each user query and Wooster response in the REPL, `logConversationTurn` (from `src/projectMetadataService.ts`, called by `src/index.ts`) appends a timestamped, truncated record of the exchange.
-   **Wooster Actions:** After a tool is successfully executed by the agent, `logWoosterAction` (from `src/projectMetadataService.ts`, called by `src/agent.ts`) appends a timestamped record of the tool name, its input parameters, and its result.

Currently, content is appended directly to these sections. There is no automated LLM-based summarization or rewriting of the entire notes file, nor a diff-based approval step for such summaries.

**(Future Considerations for `[projectName].md` Management):**
*   *LLM-based Summarization:* A potential future enhancement could involve Wooster periodically using an LLM to summarize and condense the contents of `[projectName].md`, especially the conversation log, to maintain clarity and conciseness. This might involve using a utility like `displayProposedChanges` to show users the suggested modifications before they are applied.
*   *Automated Ingested Document Logging:* Future enhancements could include more direct mechanisms for tools or the core system to log to the "Ingested Documents" section when new data sources are processed for a project.

### User Interaction with Project Notes

Users can directly view and edit the `[projectName].md` file in their project directory using any text editor. The information logged by Wooster provides a history that can be manually reviewed or augmented.

(When reviewing `04 TOOLS.MD`, we will check for any tools related to `manageProjectNotes` and update this section if necessary.) 