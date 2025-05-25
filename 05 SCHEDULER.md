# Scheduler (Wooster's Clock)

## 1. Explanation
Wooster's **Scheduler** subsystem provides a human-friendly, durable scheduling engine. It allows the agent to defer the execution of its own reasoning processes or specific tasks. Instead of scheduling fully resolved actions, the Scheduler stores an "agent intent" or a "deferred query". At the scheduled time, this intent is passed back to the agent for fresh evaluation and execution. This ensures that any data fetching or decision-making happens with the most current information.

It uses `chrono-node` for natural-language parsing of time expressions and `node-schedule` for cron-style or date-based job execution. Scheduled tasks are persisted in an SQLite database (`database/memory.db`).

It allows Wooster to:

- **Parse** free-form date/time expressions ("tomorrow at noon," "every Monday at 9am," "in two hours").
- **Persist** every scheduled agent intent in SQLite so nothing is lost on crashes or restarts.
- **Schedule** one-off or recurring deferred tasks in-process and automatically rehydrate them at startup.
- **Trigger** a re-invocation of the agent's logic with the stored intent when jobs fire.
- **Monitor** its own liveness via a heartbeat table to power an external dead-man's switch.

## 2. Design

### 2.1 Architecture Overview

```text
┌────────────┐        ┌────────────────┐      ┌───────────────────┐
│ Agent Logic│◀──┐    │ ScheduleParser |      │ SchedulerService  │
└────────────┘    │    └────────────────┘      └───────────────────┘
        │         │           │                          │
        │         └───────────┼──────────────────────────┘
        │ (Formulates Intent) │ (Parses Time)            │ (Stores & Triggers Job)
        ▼                     │                          ▼
  ┌────────────┐              │                   ┌───────────────┐
  │ Repository │◀─────────────┴──────────────────▶│ node-schedule │
  └────────────┘ (SQLite: database/memory.db)    └───────────────┘
        ▲                                                 │
        │ (Heartbeat Updates)                             │ (Job Fires)
        │                                                 │
        │                               ┌──────────────┐  │
        └───────────────────────────────│HeartbeatService│  │
                                        └──────────────┘  │
                                                          │
                 (Re-invokes Agent Logic)                 │
                         └────────────────────────────────┘
``` 

### 2.2 Components

- **ScheduleParser**: Wraps `chrono.parseDate`/`chrono.parse` to turn arbitrary text into a `Date`. Used by the `scheduleAgentTask` tool.
- **ReminderRepository**: CRUD layer on SQLite (`database/memory.db`) for `reminders` and `heartbeats` tables.
- **SchedulerService**: 
    - Manages `node-schedule` jobs.
    - Stores agent intents received from the `scheduleAgentTask` tool (via Agent Logic) into the `ReminderRepository`.
    - On job fire, retrieves the stored agent intent and triggers a callback to re-invoke the main Agent logic with this intent.
- **HeartbeatService**: Writes a `last_heartbeat` timestamp to the DB every interval.
- **Startup Bootstrap**: On launch, reloads all pending scheduled intents and re-registers them with `node-schedule`; initializes heartbeat.
- **CLI Interface & Agent Interaction**: 
    - Users typically ask the agent to schedule tasks (e.g., "remind me to X"). The agent then uses the `scheduleAgentTask` tool.
    - Direct REPL commands (`list reminders`, `cancel <id>`, `status`) allow management of these scheduled tasks.

### 2.3 Data Model

```sql
-- Located in database/memory.db
-- Reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,              -- Human-readable description of the scheduled intent
  schedule_type TEXT NOT NULL CHECK(schedule_type IN ('one-off', 'cron')),
  when_date DATETIME,                 -- For one-off execution
  cron_spec TEXT,                     -- For recurring execution
  task_type TEXT NOT NULL DEFAULT 'executeAgentQuery', -- Type of task, e.g., 'executeAgentQuery'
  task_payload TEXT NOT NULL,         -- JSON string: agent query or intent to be re-evaluated
  is_active BOOLEAN DEFAULT TRUE,     -- To mark if the scheduled intent is still active
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  next_run_time DATETIME              -- Cache of the next calculated run time
);

-- Heartbeat table (single-row)
CREATE TABLE IF NOT EXISTS heartbeats (
  id             INTEGER PRIMARY KEY CHECK(id = 1),
  last_heartbeat DATETIME NOT NULL
);
``` 

## 3. Key Implementation Aspects & Workflow

This section details how the components interact to achieve the scheduling functionality.

1.  **Database Setup (`src/scheduler/reminderRepository.ts`):**
    *   The `reminders` and `heartbeats` tables are created in `database/memory.db` if they don't exist.
    *   The `ReminderRepository` provides methods for CRUD operations.

2.  **Agent Interaction with the Scheduler Tool:**
    *   When a user request implies deferred execution (e.g., "remind me to X in 1 hour"), the agent (in `src/agent.ts`) identifies this intent.
    *   It formulates a `taskPayload` (typically the core query string), a `humanReadableDescription`, and identifies the `timeExpression`. 
    *   The agent then decides to call the `scheduleAgentTask` tool, providing these parameters.

3.  **`scheduleAgentTask` Tool Execution (`src/tools/scheduler.ts`):**
    *   Receives `taskPayload`, `timeExpression`, and `humanReadableDescription` from the agent.
    *   Uses the `ScheduleParser` (wrapping `chrono-node`) to convert `timeExpression` into a specific date/time.
    *   Calls a method on the `SchedulerService` (e.g., `schedulerService.scheduleTask(...)`).

4.  **`SchedulerService` Core Logic (`src/scheduler/schedulerService.ts`):**
    *   Takes task details (payload, description, schedule).
    *   Persists this to the `reminders` table via `ReminderRepository`.
    *   Uses `node-schedule` to create a job.
    *   The job, when triggered, executes a callback provided during `initSchedulerService` at startup.

5.  **Job Execution and Agent Re-invocation:**
    *   When a `node-schedule` job fires:
        *   It executes the `agentExecutionCallback` (defined in `src/index.ts`).
        *   This callback retrieves the `task_payload` for the job and re-invokes main agent logic (`agentRespond`) with this `task_payload`. 

6.  **Startup Bootstrap (`src/index.ts` and `src/scheduler/schedulerService.ts`):**
    *   On Wooster's launch, `initSchedulerService` is called, passing the `agentExecutionCallback`.
    *   The service loads pending tasks from `ReminderRepository` and re-registers jobs with `node-schedule`.

7.  **`HeartbeatService` (`src/heartbeat.ts`):**
    *   Periodically updates `last_heartbeat` in `heartbeats` table via `ReminderRepository`.

8.  **REPL Commands (`src/index.ts`):**
    *   Users typically interact with scheduling via natural language, which the agent translates into calls to the `scheduleAgentTask` tool.
    *   Direct REPL commands `list reminders`, `cancel <id>`, and `status` interact with the `SchedulerService` and/or `ReminderRepository` for managing and viewing scheduled tasks.

This flow ensures that user requests for future actions are reliably stored, managed, and then re-processed by the agent with fresh context at the appropriate time.
