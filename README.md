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
*   **Plugins (`src/plugins/`, `src/pluginManager.ts`)**: Modules that can hook into Wooster's lifecycle events (e.g., `onInit`, `onUserInput`, `onAssistantResponse`) for specific side-effects like logging or analytics. They are distinct from Agent Tools, which provide capabilities for the agent to use in its decision-making process. This system is configurable via `config.json`.
*   **User Contextual Memory (UCM) (`src/userKnowledgeExtractor.ts`, `src/tools/userContextTool.ts`)**: Wooster can learn and recall user-specific facts and preferences, storing them in a dedicated vector store. This feature can be enabled/disabled and configured via `config.json`.
*   **Logging (`src/logger.ts`, `08 LOGGING.MD`)**: Wooster uses a simple logging system that outputs to both the console and a log file. Configuration for log levels, file path, and other logging settings is managed in `config.json`.

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
*   **Configurable Logging**: Control log verbosity and output via `config.json`.

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

4.  **Set up Configuration (`config.json`)**:
    *   Wooster's primary configuration is managed through a `config.json` file in the project root.
    *   If `config.json` does not exist when Wooster starts, a default one will be created based on `config.json.example`.
    *   **You MUST edit `config.json` after its creation (or edit `config.json.example` and rename it) to provide, at a minimum, your `openai.apiKey`.**
    *   Other settings like email credentials (for the email tool), logging preferences, UCM enablement, and plugin activation are also configured in `config.json`. Refer to `06 CONFIG.MD` for full details.
    *   A `.env` file can still be used for:
        *   Plugin-specific environment variables if a plugin is designed to read them.
        *   Credentials for other third-party services not managed directly by Wooster's core configuration.
        *   To set a `LOG_LEVEL` environment variable if you need to control the very initial console log level before `config.json` is loaded by the system (e.g., for debugging early startup issues). By default, the logger bootstraps to `INFO` level for console output.

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

Wooster's configuration is primarily managed through `config.json` and optionally `projects.json`.

*   **`config.json`**: This is the main configuration file for Wooster, located in the project root. It controls:
    *   OpenAI settings (API key, model name).
    *   Logging behavior (console/file levels, log file path, agent LLM interaction logging).
    *   Email tool (enablement, sender address, app password).
    *   User Contextual Memory (UCM) enablement and extractor prompt.
    *   Plugin activation.
    *   Wooster creates a default `config.json` if one isn't found, based on `config.json.example`. **You must edit `config.json` to add your OpenAI API key.** See `06 CONFIG.MD` for comprehensive details.
*   **`projects.json` (Optional)**: Can be used to define named collections of files/directories for Wooster's projects, especially for items outside the default `projects/` directory or needing complex glob patterns. See `01 PROJECTS.MD` for details.
*   **`.env` (Secondary Role)**: While core Wooster settings are in `config.json`, the `.env` file's role is now secondary:
    *   It can be used for environment variables for specific plugins that are designed to read them directly.
    *   It can hold credentials for other third-party services that your custom tools or plugins might interact with, if those services are not configured via `config.json`.
    *   You can set a `LOG_LEVEL` environment variable in a `.env` file (which you would manually create) if you need to control the very initial console log level before `config.json` is loaded by the system (e.g., for debugging early startup issues).

## Extending Wooster

Wooster's primary method for adding new capabilities is through **Agent Tools**.

*   **Creating Agent Tools**:
    1.  Develop your tool's logic as a function/class, typically in a new file within `src/tools/`.
    2.  In `src/agent.ts`, import your tool and ensure it's included in the dynamically generated list of tools (usually by adding it to the `getAvailableTools` function). This involves providing a name, a clear description for the agent to understand its purpose, the function to execute, and an argument schema (see the `parameters` field in the `AgentTool` interface).
    3.  The agent framework will then be able to consider and use your new tool based on its availability conditions (e.g., email tool requires configuration).
    4.  Refer to `04 TOOLS.MD` for more details.

*   **Creating Plugins** (for lifecycle hooks and side-effects):
    1.  Create a plugin file in `src/plugins/`.
    2.  Export a default object conforming to the `Plugin` interface (see `src/pluginManager.ts`).
    3.  Plugins can hook into events like `onInit`, `onUserInput`, and `onAssistantResponse`. This feature is configurable in `config.json`.
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