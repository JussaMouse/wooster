# Wooster System Architecture & REPL Guide

Wooster is a modular, extensible CLI assistant. This document explains its boot sequence, REPL loop, environment config, plugin and memory design.

## 1. Environment & Configuration
- Load `.env` via `dotenv/config`. Supported vars:
  - `OPENAI_API_KEY` (required)
  - `EMAIL_ADDRESS`, `EMAIL_TO`, `EMAIL_APP_PASSWORD` or Gmail OAuth2 vars (for email plugin)
- See `.env.example` for full list.
- `.gitignore` excludes `.env`, `memory.db`, `vector_data/`.

## 2. Boot Sequence
1. Load environment variables.
2. Validate `OPENAI_API_KEY` and exit if missing.
3. Initialize vector memory: `initVectorStore()` → returns empty FAISS store.
4. Initialize RAG chain: `buildRagChain(apiKey, vectorStore)`.
5. Initialize Database: `initDatabase()` (for Scheduler & Heartbeat).
6. Initialize Scheduler: `initSchedulerService(agentExecutionCallback)` (loads pending intents, re-schedules them, requires a callback to agent logic for deferred execution).
7. Initialize Heartbeat: `initHeartbeatService()` (starts periodic heartbeat updates to DB).
8. Load plugins: `loadPlugins()` scans `src/plugins/` and imports defaults.
9. Init plugins: `initPlugins({ apiKey, vectorStore, ragChain })`.
10. Start interactive REPL: `startREPL()`.

## 3. REPL Loop
- Prompts `> ` using Node's `readline`.
- On each input line:
  1. Trim; ignore blank.
  2. Intercept built-in REPL commands (see below).
  3. If not a REPL command, pass to `agentRespond(input, vectorStore, ragChain)` in `src/agent.ts`.
     - The agent (LLM) decides on an action:
       - Call a specific tool (e.g., `sendEmail`, `scheduleAgentTask`).
       - Explicitly query its knowledge base using the `queryKnowledgeBase` tool (which invokes the RAG chain).
       - Respond conversationally without a tool.
     - If no specific tool is chosen or a conversational response is not definitive, a final RAG call on the input can serve as a fallback.
  4. The agent's response (or tool output message) is printed.
- On `close` event or Ctrl+C, print "Goodbye!" and exit.

## 4. Built-in Help & Commands
- `help`: Show this list of top-level commands and their usage.
- `list capabilities`: Display Wooster's core features and active plugins.
- `list projects`: Show all project names defined in `projects.json`.
- `list plugins`: Show all currently loaded plugin modules.
- `list tools`: Show available agent tools in `src/tools`.
- `load project <name>`: Load the specified project's files into Wooster's memory (rebuilds RAG chain accordingly).
- `unload project`: Clear the currently loaded project context, resetting to no-project state.
- `list files`: List all files in the current project context.
- `please send me an email containing <message>`: Agent-driven email via the `sendEmail` tool.
- `schedule <natural language query>`: Asks the agent to parse the query, formulate a deferred task/intent, and schedule it for later execution. Example: `schedule email me the news in 1 hour`.
- `list reminders`: Shows all pending scheduled tasks/intents and their human-readable descriptions.
- `cancel <id>`: Cancels a scheduled task/intent with the given ID.
- `status`: Shows the last heartbeat and details of next scheduled task runs.
- Ctrl+C or Cmd+D: Exit Wooster's REPL and quit the program.

## 5. Scheduler Subsystem
Wooster includes a Scheduler for deferring the execution of agent logic or specific tasks. When a user makes a request that should happen later (e.g., "email me the weather tomorrow at 8 am"), the agent formulates this as an "agent intent" or "deferred query." This intent (including the core task, like fetching weather and emailing) is stored by the Scheduler.

At the scheduled time, the Scheduler triggers a re-invocation of the agent's core logic, providing it with the stored intent. This ensures that data fetching (like weather) and decision-making occur with the most current information at the moment of execution.

The Scheduler uses `chrono-node` to parse natural language time expressions and `node-schedule` for managing the actual job execution. Scheduled intents are persisted in an SQLite database to survive restarts.

Associated REPL commands:
- `schedule <natural language query>`: Instructs the agent to parse the query and schedule the underlying task/intent.
- `list reminders`: Shows pending scheduled intents.
- `cancel <id>`: Cancels a scheduled intent.
- `status`: Shows Scheduler status including next runs and heartbeat.

## 6. Heartbeat Monitoring
To ensure Wooster is running and operational, it features a Heartbeat system. This system periodically writes a timestamp to a dedicated table in its SQLite database. External monitoring tools can check this timestamp to verify Wooster's liveness, implementing a "dead man's switch."

## 7. Plugin Architecture
Plugins implement: