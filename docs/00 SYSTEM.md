# Wooster System Architecture & REPL Guide

Wooster is a modular, extensible CLI assistant. This document explains its boot sequence, REPL loop, configuration via environment variables, project management, and other core systems.

## 1. Primary Configuration: `.env` File
- Wooster's entire configuration is managed through environment variables set in an `.env` file located in the project root. This file is loaded at the very start of the application by `src/configLoader.ts`.
- Key configurations include:
  - OpenAI API Key and Model Settings (e.g., `OPENAI_API_KEY`, `OPENAI_MODEL_NAME` for the agent and RAG).
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
2.  Bootstrap Logger (`bootstrapLogger()` from `src/logger.ts`).
3.  Load and parse all configurations via `configLoader.ts`.
4.  Apply full logging configuration using settings from the loaded `AppConfig`.
5.  Validate `appConfig.openai.apiKey`. Exit if missing or placeholder.
6.  Initialize LLM for RAG (`llmForRag = new ChatOpenAI(...)`) if RAG is used independently. The primary agent LLM is managed by the `AgentExecutorService`.
7.  Pass the loaded `AppConfig` to the agent module (`setAgentConfig()` in `src/agent.ts`).
8.  Initialize User Knowledge Extractor (for UCM).
9.  Initialize Web Search Tool (`initializeWebSearchTool()`).
10. Initialize Scheduler Database and Service (`initSchedulerService(schedulerAgentCallback)`).
11. Initialize Heartbeat Service.
12. **Default Project Setup** (create `projects/home/`, set as current, initialize its `vectorStore`).
13. Initialize User Context Memory (UCM) Vector Store if enabled.
14. Initialize `AgentExecutorService` (`initializeAgentExecutorService()`), passing necessary stores (UCM, project vector store).
15. Initialize RAG chain (`initializeRagChain()`) for the current project (primarily for functionalities outside direct agent tool use, as the agent has its own `queryKnowledgeBase` tool).
16. Load and initialize plugins.
17. Initialize Project Metadata Service.
18. Start interactive REPL (`startREPL()`).

## 4. REPL Loop & Agent Interaction
- Prompts `> ` using Node's `readline`. Startup message lists available REPL commands.
- On each input line:
  1. User input is captured and added to `conversationHistory`.
  2. Built-in REPL commands are checked first (see section 5).
  3. If not a REPL command, the input and `conversationHistory` are passed to `agentRespond(...)` in `src/agent.ts`.
     - `agentRespond` now acts as a wrapper, passing the input and history to `executeAgent` in `src/agentExecutorService.ts`.
     - This service uses LangChain's `AgentExecutor` with an OpenAI Tools Agent. The `AgentExecutor` manages a sophisticated interaction loop:
        - It uses a specific prompt template. The system message provides Wooster with its core instructions and persona. This prompt is constructed by first loading `prompts/base_system_prompt.txt`, then appending the content of any other `.txt` files found in the `prompts/` directory (in alphabetical order). See `06 CONFIG.MD` for details on this customization.
        - The LLM (within the agent) decides whether to use one of its configured tools or generate a direct answer.
        - If a tool is chosen, the agent prepares the input for that tool, invokes it, and receives the observation (tool's output).
        - This observation is added to the `agent_scratchpad`, and the loop continues until the LLM generates a final answer for the user.
        - Tool descriptions are critical for the agent's decision-making.
     - See `03 AGENT.MD` for more details on the agent's internal workings.
  4. Project-specific knowledge is primarily accessed by the agent via its `queryKnowledgeBase` tool, which internally uses a RAG chain. An independent `ragChain` might still exist in `src/index.ts` for other specific RAG functionalities not directly invoked by the agent.
  5. The agent's final response is printed and added to `conversationHistory`.
  6. If UCM is enabled, `extractUserKnowledge` analyzes the turn.
  7. Significant interactions may be logged to `projects/[projectName]/[projectName].md`.
- On `exit`, `quit`, or Ctrl+C, the application shuts down gracefully.

## 5. Built-in REPL Commands
(These commands are for direct system control. Most interactions are via natural language.)

- `create project <name_or_path>`
- `load project <name>`
- `quit project` (alias: `exit project`)
- `list projects` (Note: This command was not explicitly listed before but is a common expectation)
- `list files`
- `list plugins`
- `list tools`:
    - Lists tools configured for the `AgentExecutor`. See `04 TOOLS.MD` and individual tool documentation for details.
- `list reminders` / `cancel <id>` / `status`: Standard scheduler commands.
- `exit` or `quit`: Exits Wooster.

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

## 9. User Contextual Memory (UCM)
(This section largely remains the same, but emphasizes that the `recall_user_context` tool is now used by the `AgentExecutor`)
Wooster can learn user preferences and facts from conversations.
- **Enablement**: Controlled by `UCM_ENABLED`.
- **Knowledge Extraction**: `userKnowledgeExtractor` analyzes conversations. Facts are stored in `vector_data/user_context_store/`.
- **Custom Prompt**: `UCM_EXTRACTOR_LLM_PROMPT`.
- **Recall**: The agent, via `AgentExecutor`, uses the `recall_user_context` tool.
- **Details**: See `02 UCM.MD` and `06 CONFIG.MD`.

## 10. Project Metadata & Notes
(Remains the same)
Wooster maintains a project-specific metadata file, `[projectName].md`. See `01 PROJECTS.MD`.