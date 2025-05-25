# Wooster System Architecture & REPL Guide

Wooster is a modular, extensible CLI assistant. This document explains its boot sequence, REPL loop, environment config, project management, and other core systems.

## 1. Primary Configuration: `config.json`
- Wooster's core operational settings are managed in `config.json` located in the project root. This includes:
  - OpenAI API Key and Model Name (section `openai`)
  - Logging settings: console/file levels, log file path, agent LLM interaction logging (section `logging`)
  - Email tool settings: enablement, sender address, app password (section `email`)
  - User Contextual Memory (UCM) enablement and extractor prompt (section `ucm`)
  - Plugin activation (section `plugins`)
- If `config.json` is missing at startup, Wooster creates a default one. **The user MUST edit this file to provide at least the `openai.apiKey`.**
- See `06 CONFIG.MD` for full details on `config.json` structure and all options.
- `.gitignore` excludes `config.json` from version control as it contains user-specific settings and secrets.

## 2. Secondary Configuration: `.env` file (Optional)
- While core settings are in `config.json`, a `.env` file (loaded by `dotenv/config` at the very start of the application) can still be used for:
  - Environment variables required by specific plugins that are designed to read them.
  - Credentials for other third-party services that custom tools or plugins might interact with directly (not managed by Wooster's core config).
  - Bootstrap logging: The `LOG_LEVEL` env var can set the *initial* console log level before `config.json` is parsed.
- See `.env.example` for guidance on using the `.env` file.

## 3. Boot Sequence (from `src/index.ts` `main()`)
1.  Bootstrap Logger (`bootstrapLogger()` from `src/logger.ts`) - uses `LOG_LEVEL` from `.env` for initial console output.
2.  Load environment variables from `.env` (if present) using `dotenv/config`.
3.  Load `config.json` using `configLoader.ts`. If not present, a default is created (user must edit it for API key).
4.  Apply full logging configuration (`applyLoggerConfig()`) using settings from `config.json`.
5.  Validate `openai.apiKey` from `config.json`. Exit if missing or placeholder.
6.  Initialize LLM (`new ChatOpenAI(...)`) using `openai.apiKey` and `openai.modelName` from `config.json`.
7.  Pass the loaded `AppConfig` to the agent module (`setAgentConfig()`).
8.  Initialize User Knowledge Extractor (for UCM).
9.  Initialize Scheduler Database (`database/memory.db`).
10. Initialize Scheduler Service (`initSchedulerService(schedulerAgentCallback)`).
11. Initialize Heartbeat Service.
12. **Default Project Setup**:
    *   Ensure `projects/home/` directory exists; create it if not.
    *   Set `currentProjectName = 'home'`. 
    *   Initialize `vectorStore` for the "home" project using `createProjectStore('home')`.
13. Initialize User Context Memory (UCM) Vector Store if `config.ucm.enabled` is true.
14. Initialize RAG chain (`initializeRagChain()`).
15. Load plugins (`loadPlugins()`), respecting `config.plugins`.
16. Initialize enabled plugins (`initPlugins()`), passing `config.openai.apiKey` if needed.
17. Start interactive REPL (`startREPL()`).

## 4. REPL Loop & RAG Integration
- Prompts `> ` using Node's `readline`. Startup message lists available REPL commands.
- On each input line:
  1. User input is captured and added to `conversationHistory`.
  2. Built-in REPL commands are checked first (see section 5).
  3. If not a REPL command, the input is passed to `agentRespond(input, llm, ragCallback)` in `src/agent.ts`.
     - The `ragCallback` is a function that, when called by the agent (e.g. via the `queryKnowledgeBase` tool), invokes the current `ragChain` with the query and conversation history: `ragChain.invoke({ input: query, chat_history: conversationHistory })`.
     - The `agentRespond` function (using the loaded `AppConfig`) determines if a tool should be used or if a direct conversational response is needed.
  4. The RAG chain itself (`ragChain` in `src/index.ts`) consists of several steps:
     - **History-Aware Retriever:** Takes the latest user input and the `conversationHistory`. It uses an LLM to rephrase the input into an optimized search query, considering the conversational context.
     - **Retrieval:** The rephrased query is used to search the `vectorStore` of the **currently active project**.
     - **Document Combination:** The retrieved document chunks, conversation history, and original input are passed to another LLM to synthesize a final answer.
  5. The agent's final response is printed and added to `conversationHistory`.
  6. If `config.ucm.enabled` is true, `extractUserKnowledge` analyzes the turn.
- On `exit`, `quit`, or Ctrl+C, the application shuts down gracefully.

## 5. Built-in REPL Commands
(Wooster is primarily interacted with via natural language for most tasks like asking questions or invoking tools like email/scheduler. These commands are for direct system control.)

- `create project <name_or_path>`:
    - Creates a project directory. If only `<name>` is given, it creates `projects/<name>`.
    - If `<name_or_path>` is a full path, it creates that directory.
    - After creation, this new project becomes the **active project** (updates `currentProjectName`, re-initializes `vectorStore` and RAG chain).
- `load project <name>`:
    - Loads the specified project, making it the active one. This involves calling `createProjectStore(name)` which reads from `projects.json` or the `projects/<name>` directory to find files, then builds/rebuilds the vector store in memory for that project.
    - Re-initializes the RAG chain to use this new project-specific vector store.
- `quit project` (alias: `exit project`):
    - Switches the active project back to the default "home" project.
    - Loads the "home" project's vector store and re-initializes the RAG chain.
- `list projects`:
    - (Currently lists project names defined in `projects.json`. Does not yet dynamically scan `projects/` directory for this command - this is a potential enhancement.)
- `list files`:
    - Lists files found for the `currentProjectName`. It uses `projects.json` patterns if defined, otherwise scans the `projects/<currentProjectName>/` directory.
- `list plugins`:
    - Shows all currently loaded plugin modules (if any are enabled via `config.json`).
- `list tools`:
    - Shows available agent tools that the LLM can decide to use.
- `list reminders`:
    - Shows pending scheduled tasks from the scheduler.
- `cancel <id>`:
    - Cancels a scheduled task by its ID.
- `status`:
    - Shows the last heartbeat and details of next scheduled task runs.
- `exit` or `quit` (or Ctrl+C/Cmd+D):
    - Exits Wooster's REPL and quits the program.

## 6. Scheduler Subsystem
Wooster includes a Scheduler for deferring the execution of agent logic or specific tasks. When a user makes a request that should happen later (e.g., "email me the weather tomorrow at 8 am"), the agent can use the `scheduleAgentTask` tool. This tool takes the core task/query and a future time, and the Scheduler stores this.

At the scheduled time, the Scheduler triggers a re-invocation of the agent's core logic (`agentRespond`), providing it with the stored task. This ensures that data fetching (like weather) and decision-making occur with the most current information at the moment of execution.

The Scheduler uses `chrono-node` to parse natural language time expressions and `node-schedule` for managing the actual job execution. Scheduled tasks are persisted in an SQLite database (`database/memory.db`) to survive restarts.

## 7. Heartbeat Monitoring
To ensure Wooster is running and operational, it features a Heartbeat system. This system periodically writes a timestamp to a dedicated table in its SQLite database (`database/memory.db`). External monitoring tools can check this timestamp to verify Wooster's liveness.

## 8. Plugin Architecture
Plugins are designed to allow for user-driven extensions and side-effects that may not fit the "tool" paradigm used by the agent. Configuration of which plugins are active is done via `config.json`.
(Further details on the plugin interface, available hooks, and best practices are in `03 PLUGINS.MD`.)

## 9. User Contextual Memory (UCM)
Wooster has a capability to learn user preferences and facts from conversations, enhancing personalized interactions. This system is called User Contextual Memory (UCM).
- **Enablement**: UCM can be enabled or disabled via the `ucm.enabled` flag in `config.json`. (Note: Default is now `false`).
- **Knowledge Extraction**: When enabled, after each agent response, an LLM-based `userKnowledgeExtractor` analyzes the conversation to identify potential user facts. These facts are then stored in a dedicated UCM vector store (`vector_data/user_context_store/`).
- **Custom Prompt**: The prompt used by the `userKnowledgeExtractor` can be customized via `ucm.extractorLlmPrompt` in `config.json`.
- **Recall**: The agent can access learned user context via the `recall_user_context` tool.
- **Details**: See `07 UCM.MD` and `06 CONFIG.MD` for configuration options.