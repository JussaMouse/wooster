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

This file serves as a "living document" or a project diary, maintained by Wooster. Its goals are to:

1.  **Track Project Context:** Record key information relevant to the current project.
2.  **Log Ingested Knowledge:** Keep a list of documents and data sources fed into Wooster for the project.
3.  **Summarize Interactions:** Capture the essence of significant conversations, decisions made, and tasks identified.
4.  **Record Wooster's Actions:** Log important actions taken by Wooster, such as file creation, scheduling tasks, or significant information retrieval.
5.  **Improve Transparency:** Allow users to see and understand what Wooster "knows" or "remembers" about the project over time.

#### Automatic Creation and Naming

-   When Wooster starts or a new project context is established, it will check for the existence of `[projectName].md` (e.g., `my-web-app.md` if the project is `my-web-app`).
-   If the file does not exist, Wooster will automatically create it using a default template.

#### Default File Structure

The `[projectName].md` file is organized into several sections:

```markdown
# Project: [ProjectName]

## Project Overview
(A brief, high-level summary of the project. Wooster may attempt to populate this based on interactions, or the user can edit it directly.)

## Ingested Documents
(A list of documents, data sources, or URLs that have been ingested by Wooster for RAG and knowledge base purposes within this project.)
- Example: `specification-v1.pdf` ( ingested on YYYY-MM-DD)
- Example: `https://api.example.com/docs` (crawled on YYYY-MM-DD)

## Conversation Log & Key Decisions
(Chronological or summarized log of important user-Wooster interactions, questions, answers, and decisions made.)
- YYYY-MM-DD: User asked to implement feature X. Wooster outlined steps A, B, C.
- YYYY-MM-DD: Decision made to use library Y for Z functionality.

## Wooster Actions
(A log of significant, non-trivial actions performed by Wooster within the project.)
- YYYY-MM-DD: Created files `src/components/NewFeature.tsx` and `src/styles/NewFeature.css`.
- YYYY-MM-DD: Scheduled an email reminder for "Project Review" in 3 days.

## Tasks & TODOs
(A list of tasks or to-do items identified during conversations or by Wooster.)
- [ ] Refactor the authentication module.
- [ ] Research alternative data storage solutions.
```

### Maintenance and Updates

#### Logging New Information

Wooster will automatically append information to the relevant sections of `[projectName].md` as events occur:

-   **Ingested Documents:** When a new document/source is successfully processed for the project.
-   **Conversation Log & Wooster Actions:** Periodically, or after significant interactions/tool uses, Wooster will add concise summaries or logs. The exact trigger and level of detail will be based on heuristics to keep the log meaningful without being overly verbose.

#### Summarization and Rewriting

To prevent the file from becoming excessively long and to maintain clarity, Wooster will periodically (or when triggered by a user command) perform a summarization and rewriting pass:

1.  The existing content of `[projectName].md` is read.
2.  This content is provided to an LLM with instructions to:
    -   Summarize and condense verbose sections (especially the "Conversation Log").
    -   Ensure consistent formatting.
    -   Organize information logically.
    -   Update the "Project Overview" if new insights have been gained.
3.  The LLM-generated refined version of the notes is then proposed to the user.

#### Displaying Proposed Changes (Diff View)

When Wooster proposes updates to `[projectName].md` (especially after a summarization/rewriting pass), it will display the changes in the terminal before applying them. This view will use a colored "diff" format:

-   **Added lines** will be highlighted (e.g., in green).
-   **Removed lines** will be highlighted (e.g., in red).
-   Unchanged lines will be shown for context.

This allows the user to review the proposed modifications and understand what Wooster intends to change in the project notes. Users will typically be prompted to accept or reject these changes.

### User Interaction with Project Notes

While much of the maintenance is automatic, users may have commands (refer to `04 TOOLS.MD`, specifically the `manageProjectNotes` tool) to:

-   Manually trigger an update/summarization of the notes.
-   View the current notes.
-   (Potentially in the future) Revert to previous versions or edit notes via Wooster. 