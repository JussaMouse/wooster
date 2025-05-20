# Scheduler (Wooster's Clock)

## 1. Explanation
Wooster's **Scheduler** subsystem provides a human-friendly, durable scheduling engine. It allows the agent to defer the execution of its own reasoning processes or specific tasks. Instead of scheduling fully resolved actions, the Scheduler stores an "agent intent" or a "deferred query". At the scheduled time, this intent is passed back to the agent for fresh evaluation and execution. This ensures that any data fetching or decision-making happens with the most current information.

It uses `chrono-node` for natural-language parsing of time expressions and `node-schedule` for cron-style or date-based job execution. It allows Wooster to:

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
  └────────────┘ (SQLite: reminders, heartbeats)  └───────────────┘
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

- **ScheduleParser**: Wraps `chrono.parseDate`/`chrono.parse` to turn arbitrary text into a `Date` or cron spec. Used by the Agent when formulating a scheduled task.
- **ReminderRepository**: CRUD layer on SQLite for `reminders` (storing agent intents and schedule details) and `heartbeats` tables.
- **SchedulerService**: 
    - Manages `node-schedule` jobs.
    - Stores agent intents received from the Agent into the `ReminderRepository`.
    - On job fire, retrieves the stored agent intent and triggers a callback to re-invoke the main Agent logic with this intent.
- **HeartbeatService**: Writes a `last_heartbeat` timestamp to the DB every interval.
- **Startup Bootstrap**: On launch, reloads all pending scheduled intents and re-registers them with `node-schedule`; initializes heartbeat.
- **CLI Interface**: REPL commands (`schedule <text>`, `list reminders`, `cancel <id>`, `status`) to manage scheduled intents.

### 2.3 Data Model

```sql
-- Reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,              -- Human-readable description of the scheduled intent
  schedule_type TEXT NOT NULL CHECK(schedule_type IN ('one-off', 'cron')),
  when_date DATETIME,                 -- For one-off execution
  cron_spec TEXT,                     -- For recurring execution
  task_type TEXT NOT NULL DEFAULT 'executeAgentQuery', -- Type of task, e.g., 'executeAgentQuery', 'logMessage'
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

## 3. Implementation Plan

1. **Database Migrations**: Update `reminders` table for `task_type`, `task_payload`. Ensure `ReminderRepository` reflects this.
2. **Agent Logic Enhancement**: Agent needs to:
    - Identify when a user request implies deferred execution.
    - Formulate a `task_payload` (e.g., a JSON representation of the core query/intent, minus the scheduling instruction).
    - Call a `SchedulerService` function to schedule this intent.
3. **SchedulerService Enhancement**:
    - `scheduleAgentIntent(intentPayload, scheduleDetails)`: Persists to DB and calls `node-schedule`.
    - `initSchedulerService(agentExecutionCallback)`: Accepts a callback function during initialization.
    - On job fire: Retrieve `task_payload`, call `agentExecutionCallback(task_payload)`. The callback is responsible for re-running the agent logic with the payload.
4. **Bootstrap Logic**: `src/index.ts` to provide the `agentExecutionCallback` to `initSchedulerService`.
5. **ScheduleParser Module**: Remains largely the same, used by the agent.
6. **HeartbeatService**: Remains largely the same.
7. **REPL Commands**: Adapt `schedule` command to use the new agent logic for formulating and scheduling intents. `list`, `cancel`, `status` remain similar.
8. **Documentation**: Update `00 SYSTEM.md`, `04 TOOLS.md`, and `02 INTENTS.md`.
9. **Testing**: Critical to test the end-to-end flow of scheduling an intent and its correct execution later, including data freshness.
