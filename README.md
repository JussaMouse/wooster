# Wooster: Your Agentic CLI Assistant

Wooster is a TypeScript-based, extensible command-line AI assistant. It leverages a Language Model (LLM) to understand your requests, interact with its tools, and access knowledge. Wooster can learn from documents you provide (organized into "Projects"), send emails, schedule tasks, and more. Its capabilities are expanded through a system of agent-callable **Tools**.

## Core Concepts

*   **Agent (`src/agent.ts`)**: The LLM-powered core of Wooster. It interprets your input, maintains conversational context, and decides whether to call a specific Tool, query its knowledge base, or respond directly. It is currently configured to use OpenAI models.
*   **Tools (`src/tools/` & `src/agent.ts`)**: These are specific, self-contained functions that the Agent can decide to call to perform actions or retrieve information. Examples include `sendEmail`, `scheduleAgentTask`, and `search_knowledge_base`. New tools are added by defining them and making them available to the agent in `src/agent.ts`.
*   **Knowledge Base & RAG (`src/projectIngestor.ts`, `src/memoryVector.ts`)**: Wooster can ingest documents and code into a local FAISS vector store using HuggingFace embeddings. This knowledge is organized into "Projects."
    *   A default project named **"home"** (located in `projects/home/`) is automatically created and loaded on startup. This serves as the base context if no other project is specified.
    *   Additional projects can be defined by creating a directory under `projects/` (e.g., `projects/my_notes/`) or by specifying paths and glob patterns in an optional `projects.json` file.
    *   The Agent uses Retrieval Augmented Generation (RAG), typically via the `search_knowledge_base` tool or as a fallback, to answer questions based on the currently active project's ingested knowledge.
*   **Scheduler (`src/scheduler/`, `src/tools/scheduler.ts`)**: A core system that allows users (or the agent itself via the `scheduleAgentTask` tool) to schedule tasks or set reminders using natural language (e.g., "remind me to check emails in 1 hour"). It uses `node-schedule` and `chrono-node`, persisting tasks in an SQLite database (`database/memory.db`).
*   **Heartbeat (`src/heartbeat.ts`)**: A mechanism where Wooster periodically writes a timestamp to its database, allowing external systems to monitor its operational status.
*   **Plugins (`src/plugins/`, `src/pluginManager.ts`)**: Modules that can hook into Wooster's lifecycle events (e.g., `onInit`, `onUserInput`, `onAssistantResponse`) for specific side-effects like logging or analytics. They are distinct from Agent Tools, which provide capabilities for the agent to use in its decision-making process. This system is configurable via `wooster.config.json`.
*   **User Contextual Memory (UCM) (`src/userKnowledgeExtractor.ts`, `src/tools/userContextTool.ts`)**: Wooster can learn and recall user-specific facts and preferences, storing them in a dedicated vector store. This feature can be enabled/disabled and configured via `wooster.config.json`.
*   **Logging (`src/logger.ts`, `08 LOGGING.MD`)**: Wooster uses a simple logging system that outputs to both the console and a log file. Log levels and file paths can be configured via environment variables (e.g., `LOG_LEVEL`, `LOG_FILE`).

## Features

*   **Conversational REPL Interface**: Interact with Wooster using natural language.
*   **Agent-Driven Tool Use**: Wooster intelligently selects and uses available tools to fulfill requests.
*   **Project-Based Knowledge Management**:
    *   Always operates within an active project context, defaulting to "home".
    *   Load local documents and codebases as "Projects" for Wooster to learn from and answer questions about.
    *   Easily create and switch between projects.
*   **Task Scheduling**: Schedule reminders and future tasks using natural language, handled by the agent.
*   **Conversation History**: Maintains context from recent interactions (in-memory) to inform responses.
*   **Persistent Task Storage**: Scheduled tasks are saved in an SQLite database.
*   **Personalized Interaction**: Learns user-specific facts and preferences with User Contextual Memory (UCM).
*   **Configurable Logging**: Control log verbosity and output.

## Installation

1.  **Prerequisites**:
    *   Node.js (>= 18, LTS recommended)
    *   pnpm (or npm/yarn, but `pnpm-lock.yaml` is provided)
    *   Git

2.  **Clone the Repository**:
    ```bash
    git clone <repository-url>
    cd wooster
    ```

3.  **Install Dependencies**:
    ```bash
    pnpm install
    ```

4.  **Set up Environment Variables**:
    *   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    *   Edit `.env` and add your `OPENAI_API_KEY`.
    *   To enable email functionality, provide relevant email credentials (e.g., for Gmail, an App Password or OAuth2 details). See `.env.example` for variables like `EMAIL_ADDRESS`, `EMAIL_APP_PASSWORD`, `GMAIL_CLIENT_ID`, etc.
    *   Configure logging behavior using `LOG_LEVEL` (e.g., `DEBUG`, `INFO`, `WARN`, `ERROR`) and `LOG_FILE` (e.g., `wooster_session.log` or an absolute path) in the `.env` file.

## Usage

1.  **Start Wooster**:
    ```bash
    pnpm dev
    ```
    This will start Wooster in development mode. The "home" project will be active by default.

2.  **Interacting with Wooster**:
    Once Wooster is running, you'll see a `>` prompt. You can type commands or ask questions. Wooster's initial startup message lists available REPL commands.

    **Built-in REPL Commands** (Wooster is primarily interacted with via natural language, but these direct commands are available):
    *   `create project <name_or_path>`: Creates a new project directory (e.g., in `projects/<name>` or at a specified path) and makes it the active project.
    *   `load project <name>`: Load a project's files, making it the active project.
    *   `quit project` (or `exit project`): Switches the active project to "home".
    *   `list files`: List files in the currently active project.
    *   `list plugins`: Show loaded plugin modules (if any are enabled).
    *   `list tools`: Show available agent tools.
    *   `list reminders`: Show pending scheduled tasks.
    *   `cancel <id>`: Cancel a scheduled task by its ID.
    *   `status`: Show scheduler status and last heartbeat.
    *   `exit` or `quit` (or Ctrl+C): Exit Wooster.

    **Example Interactions**:
    *   `> What can you do?`
    *   `> create project my_research_notes` (Wooster will switch to this project)
    *   (Manually add files to `projects/my_research_notes/`)
    *   `> load project my_research_notes` (To re-scan files if added after initial creation/load)
    *   `> What did I write about project X in my_research_notes?`
    *   `> please send an email to test@example.com with subject Hello and body This is a test.`
    *   `> remind me to take out the trash in 1 hour`
    *   `> list reminders`
    *   `> quit project` (Switches back to the "home" project)

## Configuration

*   **`.env`**: For API keys, sensitive credentials, and logging settings (`LOG_LEVEL`, `LOG_FILE`).
*   **`config.json`**: For operational settings like UCM feature enablement and plugin activation. Wooster creates a default version if one isn't found. See `06 CONFIG.MD` for full details.
*   **`projects.json` (Optional)**: Can be used to define named collections of files/directories that Wooster can ingest as "Projects", especially for projects outside the default `projects/` directory or those requiring complex glob patterns. If a project name is used with `load project` that isn't in `projects.json`, Wooster will look for a corresponding directory in `projects/<name>`.
    Example `projects.json`:
    ```json
    {
      "wooster_codebase": ["src/**/*.ts", "README.md"],
      "external_research": "/Users/me/Documents/ResearchPapers"
    }
    ```

## Extending Wooster

Wooster's primary method for adding new capabilities is through **Agent Tools**.

*   **Creating Agent Tools**:
    1.  Develop your tool's logic as a function/class, typically in a new file within `src/tools/`.
    2.  In `src/agent.ts`, import your tool and add it to the `availableTools` array. This involves providing a name, a clear description for the agent to understand its purpose, the function to execute, and an argument schema (see the `parameters` field in the `AgentTool` interface).
    3.  The agent framework will then be able to consider and use your new tool.
    4.  Refer to `04 TOOLS.MD` for more details.

*   **Creating Plugins** (for lifecycle hooks and side-effects):
    1.  Create a plugin file in `src/plugins/`.
    2.  Export a default object conforming to the `Plugin` interface (see `src/pluginManager.ts`).
    3.  Plugins can hook into events like `onInit`, `onUserInput`, and `onAssistantResponse`. This feature is configurable in `wooster.config.json`.
    4.  Refer to `03 PLUGINS.MD` for detailed guidance.

---

This README provides a high-level overview of Wooster. For more detailed information on specific aspects, refer to the other markdown documents in the root directory:

- `00 SYSTEM.MD`: Overall system architecture, boot sequence, and REPL loop.
- `01 PROJECTS.MD`: Managing and using project-specific knowledge.
- `03 PLUGINS.MD`: Creating plugins for lifecycle hooks.
- `04 TOOLS.MD`: Defining and using agent tools.
- `05 SCHEDULER.MD`: In-depth look at the task scheduling subsystem.
- `06 CONFIG.MD`: Details on configuring Wooster via `config.json`.
- `07 UCM.MD`: Detailed design for User Contextual Memory.
- `08 LOGGING.MD`: Details on the logging system and its configuration.