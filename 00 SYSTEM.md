# Wooster System Architecture & REPL Guide

Wooster is a modular, extensible CLI assistant. This document explains its boot sequence, REPL loop, configuration via environment variables, project management, and other core systems.

## 1. Primary Configuration: `.env` File
- Wooster's entire configuration is managed through environment variables set in an `.env` file located in the project root. This file is loaded at the very start of the application by `src/configLoader.ts`.
- Key configurations include:
  - OpenAI API Key and Model Settings (e.g., `OPENAI_API_KEY`, `OPENAI_MODEL_NAME`)
  - Logging settings (e.g., `LOGGING_CONSOLE_LOG_LEVEL`, `LOGGING_LOG_FILE`)
  - Tool enablement and settings (e.g., `TOOLS_EMAIL_ENABLED`, `TOOLS_WEB_SEARCH_ENABLED`, `TAVILY_API_KEY`)
  - User Contextual Memory (UCM) enablement and prompt (e.g., `UCM_ENABLED`, `UCM_EXTRACTOR_LLM_PROMPT`)
  - Plugin activation (e.g., `PLUGIN_MYPLUGIN_ENABLED=false`)
- You **must copy `.env.example` to `.env` and edit this file**, providing at least your `OPENAI_API_KEY` for Wooster to function.
- See `06 CONFIG.MD` for a comprehensive list of all environment variables, their purpose, and default values.
- The `.env` file should always be included in `.gitignore`.

## 2. Bootstrap Logging (Emergency Override via `LOG_LEVEL`)
- The `LOG_LEVEL` environment variable in `.env` can set an *initial* console log level for messages occurring *before* the full configuration (including more specific logging variables like `LOGGING_CONSOLE_LOG_LEVEL`) is parsed by `configLoader.ts`. This is a fallback for debugging very early startup issues.
- The primary log level control is through specific `LOGGING_*` variables detailed in `06 CONFIG.MD`.

## 3. Boot Sequence (from `src/index.ts` `main()`)
1.  Load all environment variables from `.env` using `dotenv/config`.
2.  Bootstrap Logger (`bootstrapLogger()` from `src/logger.ts`) - uses `LOG_LEVEL` from `.env` (if set and valid) for initial console output.
3.  Load and parse all configurations by `configLoader.ts`, which reads `process.env` and populates an `AppConfig` object with defaults applied for any omitted variables.
4.  Apply full logging configuration (`logger.configure()` or similar) using settings from the loaded `AppConfig` (derived from `.env` variables like `LOGGING_CONSOLE_LOG_LEVEL`, etc.).
5.  Validate `appConfig.openai.apiKey` (from `OPENAI_API_KEY` in `.env`). Exit if missing or placeholder.
6.  Initialize LLM (`new ChatOpenAI(...)`) using settings from `appConfig.openai`.
7.  Pass the loaded `AppConfig` to the agent module (`setAgentConfig()`).
8.  Initialize User Knowledge Extractor (for UCM, uses settings from `appConfig.ucm`, derived from `UCM_*` env vars).
9.  Initialize Scheduler Database (`database/memory.db`).
10. Initialize Scheduler Service (`initSchedulerService(schedulerAgentCallback)`).
11. Initialize Heartbeat Service.
12. **Default Project Setup**:
    *   Ensure `projects/home/` directory exists; create it if not.
    *   Set `currentProjectName = 'home'`. 
    *   Initialize `vectorStore` for the "home" project using `createProjectStore('home')`.
13. Initialize User Context Memory (UCM) Vector Store if `appConfig.ucm.enabled` (from `UCM_ENABLED` env var) is true.
14. Initialize Web Search Tool (`initializeWebSearchTool()`) if `appConfig.tools.webSearch.enabled` (from `TOOLS_WEB_SEARCH_ENABLED` env var) and `appConfig.tavilyApiKey` (from `TAVILY_API_KEY` env var) are set.
15. Initialize RAG chain (`initializeRagChain()`).
16. Load plugins (`loadPlugins()`), respecting their enablement status derived from `PLUGIN_*_ENABLED` env vars.
17. Initialize enabled plugins (`initPlugins()`), passing `appConfig.openai.apiKey` if needed.
18. Initialize Project Metadata Service (ensures `[projectName].md` exists in the project directory).
19. Start interactive REPL (`startREPL()`).

## 4. REPL Loop & Agent Interaction
- Prompts `> ` using Node's `readline`. Startup message lists available REPL commands.
- On each input line:
  1. User input is captured and added to `conversationHistory` (as a user message).
  2. Built-in REPL commands are checked first (see section 5).
  3. If not a REPL command, the input and the full `conversationHistory` are passed to `agentRespond(...)` in `src/agent.ts`.
     - The `agentRespond` function, using the loaded `AppConfig` (derived from `.env`), consults its system prompt.
     - It then decides whether to call a **Tool** (e.g., `query_knowledge_base`, `recall_user_context`, `web_search`, etc.) or respond directly.
  4. The RAG chain itself (`ragChain` in `src/index.ts`) for project-specific knowledge involves standard RAG steps.
  5. The agent's final response is printed and added to `conversationHistory`.
  6. If `appConfig.ucm.enabled` (from `UCM_ENABLED` env var) is true, `extractUserKnowledge` analyzes the turn.
  7. Significant interactions may be logged to `projects/[projectName]/[projectName].md`.
- On `exit`, `quit`, or Ctrl+C, the application shuts down gracefully.

## 5. Built-in REPL Commands
(These commands are for direct system control. Most interactions are via natural language.)

- `create project <name_or_path>`
- `load project <name>`
- `quit project` (alias: `exit project`)
- `list projects`
- `list files`
- `list plugins`:
    - Shows plugin modules and their enablement status based on `PLUGIN_*_ENABLED` environment variables (see `06 CONFIG.MD`).
- `list tools`:
    - Shows available agent tools that the LLM can use, based on `TOOLS_*_ENABLED` environment variables (see `06 CONFIG.MD`).
- `list reminders` / `cancel <id>` / `status`: Standard scheduler commands.
- `exit` or `quit`: Exits Wooster.

## 6. Scheduler Subsystem
Wooster includes a Scheduler for deferring the execution of agent logic or specific tasks. When a user makes a request that should happen later (e.g., "email me the weather tomorrow at 8 am"), the agent can use the `scheduleAgentTask` tool. This tool takes the core task/query and a future time, and the Scheduler stores this.

At the scheduled time, the Scheduler triggers a re-invocation of the agent's core logic (`agentRespond`), providing it with the stored task. This ensures that data fetching (like weather) and decision-making occur with the most current information at the moment of execution.

The Scheduler uses `chrono-node` to parse natural language time expressions and `node-schedule` for managing the actual job execution. Scheduled tasks are persisted in an SQLite database (`database/memory.db`) to survive restarts.

## 7. Heartbeat Monitoring
To ensure Wooster is running and operational, it features a Heartbeat system. This system periodically writes a timestamp to a dedicated table in its SQLite database (`database/memory.db`). External monitoring tools can check this timestamp to verify Wooster's liveness.

## 8. Plugin Architecture
Plugins are for user-driven extensions. Configuration of which plugins are active is done via `PLUGIN_[PLUGINNAME]_ENABLED` environment variables in the `.env` file (e.g., `PLUGIN_MYPLUGIN_ENABLED=false`). See `03 PLUGINS.MD` and `06 CONFIG.MD`.

## 9. User Contextual Memory (UCM)
Wooster can learn user preferences and facts from conversations.
- **Enablement**: Controlled by `UCM_ENABLED` environment variable in `.env` (`true` or `false`).
- **Knowledge Extraction**: When enabled, `userKnowledgeExtractor` analyzes conversations. Facts are stored in `vector_data/user_context_store/`.
- **Custom Prompt**: The extractor prompt is set by `UCM_EXTRACTOR_LLM_PROMPT` in `.env`.
- **Recall**: The agent uses the `recall_user_context` tool, available if `UCM_ENABLED=true`.
- **Details**: See `02 UCM.MD` and `06 CONFIG.MD`.

## 10. Project Metadata & Notes
Wooster maintains a project-specific metadata file, `[projectName].md`, in `projects/[projectName]/`.

Wooster creates/appends to this file as events occur. See `01 PROJECTS.MD`.