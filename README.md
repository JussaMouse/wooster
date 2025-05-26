**⚠️ Experimental Software Warning ⚠️**

1.  **This is experimental software.** There is no guarantee that it will work correctly or be maintained. Use at your own risk.
2.  **OpenAI API Usage & Data Privacy (Alpha Stage):** In its current alpha form, Wooster uses the OpenAI API by default for its core agent and other features. If you enable User Contextual Memory (UCM), this means that data Wooster collects about your interactions and preferences will be sent to OpenAI servers as part of the LLM requests. Wooster is planning an update in the future to accommodate local LLMs for users who prefer to keep their UCM data entirely on their own systems.

# Wooster: Your Agentic CLI Assistant

Wooster is a TypeScript-based, extensible command-line AI assistant designed for intelligent interaction. It leverages a Large Language Model (LLM) to understand your requests, maintain conversational context, and strategically access a variety of knowledge sources. Wooster can learn from your documents (organized into "Projects"), remember your preferences (User Contextual Memory), search the web for current information, send emails, schedule tasks, and more. Its capabilities are expanded through a system of agent-callable **Tools**. All configuration is managed through environment variables in an `.env` file.

## Core Concepts

Wooster's intelligence comes from its ability to orchestrate several components:

*   **Agent (`src/agent.ts`)**: The LLM-powered brain of Wooster. It interprets your input, maintains rich conversational context (including chat history), and decides whether to call a specific Tool, query its various knowledge sources, or respond directly. It is configured using environment variables in your `.env` file.
*   **Tools (`src/tools/` & `src/agent.ts`)**: These are specific, self-contained functions that the Agent can decide to call. Examples include `sendEmail`, `scheduleAgentTask`, `queryKnowledgeBase` (for project-specific RAG), `recall_user_context` (for personal memory), and `web_search` for accessing live internet data. Tool enablement and behavior are configured via `.env`.
*   **Knowledge Sources**:
    *   **Project-Specific Knowledge (RAG) (`src/projectIngestor.ts`, `src/memoryVector.ts`)**: Wooster can ingest documents and code into a local FAISS vector store. This knowledge is organized into "Projects." The Agent uses Retrieval Augmented Generation (RAG), typically via the `queryKnowledgeBase` tool, to answer questions based on the currently active project's ingested knowledge.
        *   A default project named **"home"** (located in `projects/home/`) is automatically created and loaded on startup.
    *   **User Contextual Memory (UCM) (`src/userKnowledgeExtractor.ts`, `src/tools/userContextTool.ts`)**: Wooster learns and recalls user-specific facts and preferences from your direct interactions, storing them in a dedicated vector store for personalization. This feature is enabled/disabled and configured via environment variables in your `.env` file (e.g., `UCM_ENABLED`).
    *   **Web Search (`src/tools/webSearchTool.ts`)**: Wooster can perform real-time web searches using the Tavily AI API to fetch current information. Requires a `TAVILY_API_KEY` and is enabled/disabled via environment variables in your `.env` file (e.g., `TOOLS_WEB_SEARCH_ENABLED`).
*   **Scheduler (`src/scheduler/`, `src/tools/scheduler.ts`)**: Allows scheduling tasks or reminders using natural language.
*   **Heartbeat (`src/heartbeat.ts`)**: A mechanism for monitoring Wooster's operational status.
*   **Plugins (`src/plugins/`, `src/pluginManager.ts`)**: Modules for lifecycle hooks. Plugin enablement is managed via environment variables in your `.env` file (e.g., `PLUGIN_MYPLUGIN_ENABLED=false`).
*   **Logging (`src/logger.ts`)**: Wooster uses a configurable logging system (console and file output) managed via environment variables in your `.env` file (e.g., `LOGGING_CONSOLE_LOG_LEVEL`).
*   **Configuration (`src/configLoader.ts`, `.env` file)**: Wooster's behavior, including logging, UCM, tool enablement, and plugin activation, is controlled by environment variables set in an `.env` file in the project root. See `06 CONFIG.MD` for a full list.

## Features

*   **Intelligent Conversational Interface**: Interact with Wooster using natural language, with the agent maintaining contextual understanding.
*   **Multi-Source Knowledge Access**: Wooster dynamically chooses between its base LLM knowledge, project-specific documents (RAG), User Contextual Memory (UCM), and live web search to answer queries.
*   **Real-time Web Search**: Fetches up-to-date information from the internet using Tavily AI.
*   **Personalized Interaction**: Learns and recalls your preferences through User Contextual Memory (UCM).
*   **Agent-Driven Tool Use**: Intelligently selects and uses available tools to fulfill requests (email, scheduling, web search, etc.).
*   **Project-Based Knowledge Management**: Load local documents and codebases for Wooster to learn from.
*   **Task Scheduling**: Schedule reminders and future tasks using natural language.
*   **Comprehensive Configuration**: Extensive settings via an `.env` file for API keys, LLM parameters, logging, UCM, and feature/tool enablement. See `06 CONFIG.MD`.

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
    # This will install all necessary packages, including Langchain, OpenAI, Tavily, etc.
    ```

4.  **Set up Configuration (`.env` file)**:
    *   Copy the example file: `cp .env.example .env`.
    *   **You MUST edit your `.env` file to provide, at a minimum, your `OPENAI_API_KEY`.**
    *   If you want to use the web search tool, you **MUST also provide your `TAVILY_API_KEY`** and ensure `TOOLS_WEB_SEARCH_ENABLED=true` (default).
    *   All other settings for features like email, UCM, logging, and plugin activation are also configured in this `.env` file.
    *   Refer to `06 CONFIG.MD` for a comprehensive list of all available environment variables and their purposes.

## Usage

1.  **Start Wooster**:
    ```bash
    pnpm dev
    ```

2.  **Interacting with Wooster**:
    Type commands or ask questions at the `>` prompt.

    **Built-in REPL Commands**:
    *   `create project <name_or_path>`
    *   `load project <name>`
    *   `quit project` (or `exit project`)
    *   `list files`
    *   `list plugins`
    *   `list tools`
    *   `list reminders`
    *   `cancel <id>`
    *   `status`
    *   `exit` or `quit`

    **Example Interactions**:
    *   `> What can you do?`
    *   `> When is the next G7 summit?` (Tests web search)
    *   `> My favorite programming language is Python.` (To teach UCM)
    *   `> What is my favorite programming language?` (Tests UCM recall)
    *   `> please send an email to test@example.com with subject Hello and body This is a test.`
    *   `> remind me to take out the trash in 1 hour`

## Configuration

Wooster's behavior is controlled by environment variables set in your `.env` file in the project root. 

*   **`.env`**: The main configuration file. See `06 CONFIG.MD` for a comprehensive list of all variables.
*   **`projects.json` (Optional)**: For advanced project path definitions. See `01 PROJECTS.MD`.

## Extending Wooster

Wooster's primary method for adding new capabilities is through **Agent Tools**.

*   **Creating Agent Tools**:
    1.  Develop your tool's logic, often in `src/tools/`.
    2.  Integrate it into `src/agent.ts` by adding it to `availableTools`.
    3.  Ensure the tool can be enabled/disabled via an environment variable in `.env` if appropriate (e.g., `TOOLS_MYNEWTOOL_ENABLED=true`).
    4.  Refer to `04 TOOLS.MD` for more details.

*   **Creating Plugins** (for lifecycle hooks):
    1.  Create plugin files in `src/plugins/`.
    2.  Ensure plugins can be enabled/disabled via environment variables in `.env` (e.g., `PLUGIN_MYPLUGIN_ENABLED=false`).
    3.  Refer to `03 PLUGINS.MD`.

---

This README provides a high-level overview. For more details, refer to the other markdown documents:

- `00 SYSTEM.MD`: Overall system architecture, boot sequence, and REPL loop.
- `01 PROJECTS.MD`: Managing project-specific knowledge (RAG).
- `02 UCM.MD`: User Contextual Memory for personalization.
- `03 PLUGINS.MD`: Creating plugins.
- `04 TOOLS.MD`: Defining and using agent tools (includes `web_search`).
- `05 SCHEDULER.MD`: Task scheduling.
- `06 CONFIG.MD`: Configuration via `.env` environment variables.
- `07 LOGGING.MD`: Logging system.