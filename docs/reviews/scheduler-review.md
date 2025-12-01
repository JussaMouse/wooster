# Scheduler Implementation Review

## Overview
The Scheduler system in Wooster handles both recurring tasks (via Cron expressions) and one-off scheduled events (via natural language prompts from the agent). It persists tasks to a local SQLite database and uses the `croner` library for execution timing.

## Reliability & Durability

### Persistence (⚠️ Concern)
- **Current State:** The `SchedulerRepository` uses `sql.js` (SQLite in WASM/memory) and manually persists the entire database to disk (`fs.writeFileSync`) after every write.
- **Risk:** This is less robust than a native SQLite driver like `better-sqlite3`. If the application crashes or loses power immediately after a DB operation but before the file write completes, data could be corrupted or lost. It also loads the full DB into memory, which is fine for small schedules but less scalable.
- **Recommendation:** Migrate `SchedulerRepository` to use `better-sqlite3` (same as the Knowledge Base). This enables WAL mode, crash-safe writes, and better performance.

### Missed Jobs (⚠️ Concern)
- **Current State:** On startup, `SchedulerService.start()` loads all active items and instantiates `new Cron(item.schedule_expression)`.
- **Risk:** If the server is down when a one-off task (scheduled via specific ISO timestamp) was supposed to run, it is unclear if `croner` fires it immediately upon restart. Standard cron behavior usually skips missed windows.
- **Recommendation:** Implement a explicit "catch-up" logic on startup. Query for tasks with `next_run < now` (or similar metadata) and execute them or mark them as failed.

## Architecture & Modularity

### Components
- **`SchedulerService`:** The central manager. It is effectively a singleton (static methods) that manages `activeJobs` (in-memory Map).
- **`SchedulerRepository`:** Handles data access.
- **`ensureScheduleIsManaged`:** A reliable, idempotent helper for plugins to register their cron jobs (e.g., Daily Review). This is a **strong design pattern** that simplifies plugin development.

### Integration
- **Agent Integration:** The `scheduleAgentTask` tool cleanly parses natural language (e.g., "in 20 minutes") into a timestamp and schedules it.
- **Execution:** Supports `AGENT_PROMPT` (injects message back into the agent loop) and `DIRECT_FUNCTION` (executes code directly). This is flexible and covers both "remind me" and "maintenance task" use cases.

## Simplicity
- The code is relatively simple and easy to follow.
- **Complexity:** The split between `sql.js` here and `better-sqlite3` elsewhere adds unnecessary cognitive load and dependency bloat.

## Final Verdict
**Rating: 🟡 Functional but Fragile**

The scheduler works for basic needs but relies on a suboptimal persistence strategy (`sql.js`) and lacks robust handling for downtime/missed jobs. It is well-integrated with the agent and plugins but should be refactored to use `better-sqlite3` for production-grade reliability.

### Action Plan
1.  **Refactor DB:** Switch `SchedulerRepository` to `better-sqlite3`.
2.  **Unified DB Config:** Share database connection logic/config with KnowledgeBase if possible, or at least use the same library.
3.  **Missed Task Handling:** Add logic to check for and handle expired one-off tasks on startup.

