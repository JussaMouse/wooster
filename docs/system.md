# Wooster System Architecture & REPL Guide

Wooster is a modular, extensible CLI assistant. This document explains its boot sequence, REPL loop, configuration via environment variables, project management, and other core systems.

## 1. Primary Configuration: `.env` File
- Wooster's entire configuration is managed through environment variables set in an `.env` file located in the project root. This file is loaded at the very start of the application by `src/configLoader.ts`.
- Key configurations include:
  - OpenAI API Key and Model Settings (e.g., `OPENAI_API_KEY`, `OPENAI_MODEL_NAME` for the agent and RAG).
  - Logging settings (e.g., `LOGGING_CONSOLE_LOG_LEVEL`, `LOGGING_LOG_FILE`)
  - Tool enablement and settings (e.g., `TOOLS_EMAIL_ENABLED`, `TOOLS_WEB_SEARCH_ENABLED`, `TAVILY_API_KEY`)
  - User Profile enablement and store path (e.g., `USER_PROFILE_ENABLED`, `USER_PROFILE_STORE_PATH`)
  - Plugin activation (e.g., `PLUGIN_MYPLUGIN_ENABLED=false`)
- You **must copy `.env.example` to `.env` and edit this file**, providing at least your `OPENAI_API_KEY` for Wooster to function.
- See `06 CONFIG.MD` for a comprehensive list of all environment variables, their purpose, and default values.
- The `.env` file should always be included in `.gitignore`.

## 2. Bootstrap Logging (Emergency Override via `LOG_LEVEL`)
- The `LOG_LEVEL` environment variable in `.env` can set an *initial* console log level for messages occurring *before* the full configuration (including more specific logging variables like `LOGGING_CONSOLE_LOG_LEVEL`) is parsed by `configLoader.ts`. This is a fallback for debugging very early startup issues.
- The primary log level control is through specific `LOGGING_*` variables detailed in `06 CONFIG.MD`.

## 3. Boot Sequence (from `src/index.ts` `main()`)
1.  Load all environment variables from `.env` using `dotenv/config`.
2.  Bootstrap Logger (`bootstrapLogger()` from `src/logger.ts`).
3.  Load and parse all configurations via `configLoader.ts`.
4.  Apply full logging configuration using settings from the loaded `AppConfig`.
5.  Validate `appConfig.openai.apiKey`. Exit if missing or placeholder.
6.  Initialize LLM for RAG (`llmForRag = new ChatOpenAI(...)`) if RAG is used independently. The primary agent LLM is managed by the `AgentExecutorService`.
7.  Pass the loaded `AppConfig` to the agent module (`setAgentConfig()` in `src/agent.ts`).
8.  Initialize Web Search Tool (`initializeWebSearchTool()`).
9.  Initialize Scheduler Database and Service (`initSchedulerService(schedulerAgentCallback)`).
10. Initialize Heartbeat Service.
11. **Default Project Setup** (create `projects/home/`, set as current, initialize its `vectorStore`).
12. Initialize User Profile Vector Store if enabled.
13. Initialize `AgentExecutorService` (`initializeAgentExecutorService()`), passing necessary stores (User Profile store, project vector store).
14. Initialize RAG chain (`initializeRagChain()`) for the current project (primarily for functionalities outside direct agent tool use, as the agent has its own `queryKnowledgeBase` tool).
15. Load and initialize plugins.
16. Initialize Project Metadata Service.
17. Start interactive REPL (`startREPL()`).

## 4. REPL Loop & Agent Interaction
- Prompts `> ` using Node's `readline`. Startup message lists available REPL commands.
- On each input line:
  1. User input is captured and added to `conversationHistory`.
  2. Built-in REPL commands are checked first (see section 5).
  3. If not a REPL command, the input and `conversationHistory` are routed by `src/agent.ts`:
     - If `chatMode === 'code_agent'`, the input is processed by the Code Agent executor which asks the model to emit one JS block then executes it in a sandbox with a minimal Tool API.
     - Otherwise, the classic Tools Agent (LangChain) runs and may invoke tools iteratively.
  4. Project-specific knowledge is accessed via `queryKnowledgeBase` (RAG) tool.
  5. The final response is printed and added to history.
  6. Significant interactions may be logged to `projects/[projectName]/[projectName].md`.
- On `exit`, `quit`, or Ctrl+C, the application shuts down gracefully.

## 5. Built-in REPL Commands
(These commands are for direct system control. Most interactions are via natural language.)

- `mode code` → Switch to Code Agent mode
- `mode tools` → Switch to Classic Tools mode
- `list models` / `routing status` (if routing logs enabled)
- `list plugins`
- `list tools`:
    - Lists tools configured for the `AgentExecutor`. See `04 TOOLS.MD` and individual tool documentation for details.
- `list reminders` / `cancel <id>` / `status`: Standard scheduler commands.
- `exit` or `quit`: Exits Wooster.

### Code-Agent Debugging
- Set `CODE_AGENT_DEBUG=1` to emit detailed logs:
  - Tool API keys/types, bootstrap shim snippet, emitted code prefix
  - In-sandbox probes and full error stacks

## 6. Scheduler Subsystem
(This section largely remains the same, but emphasizes that the `scheduleAgentTask` tool is now used by the `AgentExecutor`)
Wooster includes a Scheduler for deferring the execution of agent logic. When a user makes a request that should happen later (e.g., "email me the weather tomorrow at 8 am"), the agent, via `AgentExecutor`, can use the `scheduleAgentTask` tool. This tool takes the core task/query and a future time, and the Scheduler stores this.

At the scheduled time, the Scheduler triggers a re-invocation of the agent's core logic (`agentRespond`), providing it with the stored task. This ensures that data fetching and decision-making occur with the most current information at the moment of execution.

Scheduled tasks are persisted in an SQLite database.

## 7. Heartbeat Monitoring
(Remains the same)
To ensure Wooster is running and operational, it features a Heartbeat system. This system periodically writes a timestamp to a dedicated table in its SQLite database.

## 8. Plugin Architecture
(Remains the same)
Plugins are for user-driven extensions. Configuration is via `PLUGIN_[PLUGINNAME]_ENABLED` environment variables. See `03 PLUGINS.MD` and `06 CONFIG.MD`.

## 9. User Profile
(This section largely remains the same, but emphasizes that the `recall_user_profile` tool is now used by the `AgentExecutor`)
Wooster can learn user preferences and facts from conversations.
- **Enablement**: Controlled by `USER_PROFILE_ENABLED`.
- **Knowledge Storage**: User facts and preferences are saved when the agent uses the `save_user_profile` tool. Data is stored in the path configured by `USER_PROFILE_STORE_PATH` (default: `vector_data/user_profile_store/`).
- **Recall**: The agent, via `AgentExecutor`, uses the `recall_user_profile` tool.
- **Details**: See `02 USER_PROFILE.MD` and `06 CONFIG.MD`.

## 10. Project Metadata & Notes
(Remains the same)
Wooster maintains a project-specific metadata file, `[projectName].md`. See `01 PROJECTS.MD`.