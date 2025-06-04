# Wooster Scheduler System (V2)

## 1. Overview

The Wooster Scheduler System is responsible for managing and executing tasks at predefined times or intervals. It supports recurring tasks (via cron expressions), one-off future tasks, and different policies for handling missed executions. The system can trigger two main types of handlers: direct TypeScript functions within Wooster or prompts to be processed by the Wooster agent.

## 2. Core Components

*   **`SchedulerService` (`src/scheduler/schedulerService.ts`)**: The central orchestrator.
    *   Initializes and loads schedules from the database.
    *   Uses `node-schedule` to manage the timing of job executions.
    *   Uses `croner` to parse cron expressions and calculate next run times.
    *   Handles task execution, including catch-up logic for missed tasks based on their execution policy.
    *   Provides an API to create, cancel, and query schedules.
    *   Maintains a registry for `DIRECT_FUNCTION` handlers.
*   **`ReminderRepository` (`src/scheduler/reminderRepository.ts`)**: Manages data persistence.
    *   Interacts with an SQLite database (`database/scheduler.sqlite3`).
    *   Stores schedule definitions and execution logs.
*   **`scheduleAgentTaskTool` (`src/tools/scheduler.ts`)**: A tool available to the Wooster agent, allowing it to schedule new tasks (typically `AGENT_PROMPT` type) based on user requests.
*   **Direct Function Registration (in `src/index.ts`)**: System-level tasks (like the Daily Review email) are registered as direct functions with specific `task_key`s.
*   **Plugin-Provided Task Definitions**: Plugins can define tasks to be managed by the scheduler. They do this by implementing the `getScheduledTaskSetups()` method. For details on how plugins provide these definitions, see the [Plugin Development Guide](./plugin_development_guide.md).

## 3. Database Schema

The scheduler uses an SQLite database (`scheduler.sqlite3`) with two main tables:

### 3.1. `schedules` Table

Stores the definitions of all scheduled tasks.

| Column                | Type    | Description                                                                                                | Example                               |
| :-------------------- | :------ | :--------------------------------------------------------------------------------------------------------- | :------------------------------------ |
| `id`                  | TEXT    | Primary Key (UUID)                                                                                         | `uuidv4()`                            |
| `description`         | TEXT    | Human-readable description of the task.                                                                    | "Daily Review Email"                  |
| `schedule_expression` | TEXT    | Cron string for recurring tasks (e.g., "0 9 * * *") or an ISO 8601 datetime string for one-off tasks.       | "30 6 * * *" / "2024-12-31T23:59:00Z" |
| `payload`             | TEXT    | JSON string containing data for the task. For `AGENT_PROMPT`, this is the prompt. For `DIRECT_FUNCTION`, it\'s arguments for the function. | `"{}"` / `"{ \\"userId\\": 123 }"`    |
| `is_active`           | BOOLEAN | Whether the schedule is currently active. Defaults to `TRUE`.                                              | `TRUE`                                |
| `created_at`          | TEXT    | Timestamp of creation (ISO 8601).                                                                          | `strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')` |
| `updated_at`          | TEXT    | Timestamp of last update (ISO 8601).                                                                       | `strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')` |
| `next_run_time`       | TEXT    | Calculated next execution time (ISO 8601). Updated by `SchedulerService`.                                  | "2024-07-01T09:00:00Z"                |
| `last_invocation`     | TEXT    | Timestamp of the last time the task was invoked (ISO 8601).                                                | "2024-06-30T09:00:00Z"                |
| `task_key`            | TEXT    | A unique key identifying the task\'s nature or target function/prompt. `UNIQUE`.                            | "system.dailyReview.sendEmail"        |
| `task_handler_type`   | TEXT    | Type of handler: `AGENT_PROMPT` or `DIRECT_FUNCTION`.                                                      | "DIRECT_FUNCTION"                     |
| `execution_policy`    | TEXT    | How to handle missed schedules: `DEFAULT_SKIP_MISSED`, `RUN_ONCE_PER_PERIOD_CATCH_UP`, `RUN_IMMEDIATELY_IF_MISSED`. | "RUN_ONCE_PER_PERIOD_CATCH_UP"        |

### 3.2. `task_execution_log` Table

Records each execution attempt of a scheduled task.

| Column              | Type    | Description                                                                    | Example                          |
| :------------------ | :------ | :----------------------------------------------------------------------------- | :------------------------------- |
| `id`                | INTEGER | Primary Key (Auto-increment)                                                   | `1`                              |
| `schedule_id`       | TEXT    | Foreign Key referencing `schedules.id`. `ON DELETE CASCADE`.                   | `uuid_of_schedule_item`          |
| `period_identifier` | TEXT    | A string identifying the execution period (e.g., date for daily tasks).        | "2024-07-01" / "2024-07-01-09"   |
| `status`            | TEXT    | Execution status: `SUCCESS`, `FAILURE`, `SKIPPED_DUPLICATE`.                   | "SUCCESS"                        |
| `executed_at`       | TEXT    | Timestamp of execution attempt (ISO 8601).                                     | "2024-07-01T09:00:05Z"           |
| `notes`             | TEXT    | Optional notes about the execution (e.g., error messages, skipped reason).     | "Successfully sent daily review" |

## 4. Key Concepts

### 4.1. `ScheduleItem`
This is the TypeScript interface representing a record from the `schedules` table.

### 4.2. `task_key`
A crucial identifier string that links a `ScheduleItem` to its actual execution logic.
*   For `DIRECT_FUNCTION` handlers, this key is used to look up the registered TypeScript function in `SchedulerService`\'s `directFunctionRegistry`.
*   For `AGENT_PROMPT` handlers, this key can be used for categorization or logging, often generated dynamically (e.g., `agent.toolScheduled.<uuid>`).

### 4.3. `task_handler_type`
Defines how the schedule is processed:
*   **`DIRECT_FUNCTION`**: The `payload` (if any) is passed to a TypeScript function registered with `SchedulerService` via its `task_key`. This is used for system tasks like the Daily Review.
*   **`AGENT_PROMPT`**: The `payload` (which is a string prompt) is sent to the Wooster agent for processing via the `schedulerAgentCallback` function. This is typically used for tasks scheduled by the agent itself (e.g., "remind me to X").

### 4.4. `schedule_expression`
Determines when the task should run.
*   **Cron Expressions**: For recurring tasks (e.g., `"0 8 * * *"` for 8 AM daily). Parsed using `croner`.
*   **ISO 8601 Date Strings**: For one-off tasks (e.g., `"2025-01-01T10:00:00Z"`).

### 4.5. `execution_policy`
Defines behavior when Wooster starts up and finds tasks that should have run in the past:
*   **`DEFAULT_SKIP_MISSED`**: If a task\'s scheduled time is missed, it is skipped. The scheduler will only run it at its next scheduled future time.
*   **`RUN_IMMEDIATELY_IF_MISSED`**: If a task\'s `next_run_time` is in the past, it will be executed immediately during the catch-up process, provided it hasn\'t already run recently (based on `last_invocation`).
*   **`RUN_ONCE_PER_PERIOD_CATCH_UP`**: Designed for tasks that should run once per defined period (e.g., daily, hourly). If missed, the scheduler will attempt to run it once for the current period during catch-up, provided it hasn\'t already succeeded in that period (checked via `task_execution_log`). The `period_identifier` in the log helps track this.

## 5. `SchedulerService` Operations

### 5.1. Initialization (`initSchedulerService`)
*   Called at Wooster startup.
*   Clears any pre-existing `node-schedule` jobs from a previous run.
*   Loads all `is_active = TRUE` schedules from the database.
*   For each loaded item, it calls `scheduleJob` to:
    *   Calculate the next invocation time using `croner` (for cron) or by parsing the date string.
    *   Updates the item\'s `next_run_time` in the database.
    *   Schedules the actual job with `node-schedule`.
*   Sets up the `agentExecutionCallback` if provided.

### 5.2. Catch-up Processing (`processCatchUpTasks`)
*   Called at Wooster startup *after* `initSchedulerService` and after direct functions are registered.
*   Iterates through active schedule items.
*   For `RUN_ONCE_PER_PERIOD_CATCH_UP` tasks:
    *   Calculates the expected run time for the current period.
    *   Checks `task_execution_log` to see if it already ran successfully for this period.
    *   If not run and past its scheduled time for the current period, `executeScheduledItem` is called.
*   For `RUN_IMMEDIATELY_IF_MISSED` tasks:
    *   If `next_run_time` is in the past and `last_invocation` doesn\'t indicate a recent run, `executeScheduledItem` is called.

### 5.3. Task Execution (`executeScheduledItem`)
*   This is the core function called when a `node-schedule` job fires or during catch-up.
*   Determines the `currentPeriodId`.
*   For `RUN_ONCE_PER_PERIOD_CATCH_UP` tasks, it performs a final check against `task_execution_log` to prevent duplicate execution if a catch-up already ran it for the current period.
*   Based on `task_handler_type`:
    *   `DIRECT_FUNCTION`: Looks up the function in `directFunctionRegistry` by `task_key` and executes it with the parsed `payload`.
    *   `AGENT_PROMPT`: Calls `agentExecutionCallback` with the `payload`.
*   Logs the execution result (`SUCCESS` or `FAILURE`) to `task_execution_log`.
*   Updates `last_invocation` and `next_run_time` (if applicable, from `node-schedule`\'s next invocation) in the `schedules` table.
*   Handles deactivation of one-off tasks after they run.

### 5.4. Creating Schedules (`createSchedule`)
*   Used by `src/index.ts` (e.g., for seeding the Daily Review) and by `scheduleAgentTaskTool`.
*   Takes schedule details, generates a UUID for `id`.
*   Calculates the initial `next_run_time`.
*   Adds the new `ScheduleItem` to the database via `reminderRepository.addScheduleItem`.
*   Calls `scheduleJob` to activate it in `node-schedule`.

### 5.5. Registering Direct Functions (`registerDirectScheduledFunction`)
*   Called in `src/index.ts` to map a `task_key` (e.g., `"system.dailyReview.sendEmail"`) to a specific TypeScript function (e.g., `sendDailyReviewEmail` from `src/tools/dailyReview.ts`).

## 6. Example: Daily Review Seeding

In `src/index.ts`, the Daily Review task is set up as follows:

1.  **Registration**:
    `registerDirectScheduledFunction("system.dailyReview.sendEmail", sendDailyReviewEmail);`
2.  **Seeding (if not exists)**:
    \`\`\`typescript
    const dailyReviewJob = await getScheduleItemByKey("system.dailyReview.sendEmail");
    if (!dailyReviewJob) {
      await createSchedule({
        description: "Sends the Daily Review email each morning.",
        schedule_expression: "30 6 * * *", // 6:30 AM daily
        payload: JSON.stringify({}),
        task_key: "system.dailyReview.sendEmail",
        task_handler_type: "DIRECT_FUNCTION",
        execution_policy: "RUN_ONCE_PER_PERIOD_CATCH_UP",
      });
    }
    \`\`\`

## 7. Agent-Scheduled Tasks

The `scheduleAgentTaskTool` allows the LLM agent to create tasks:
*   Input to the tool is a JSON object: `{ taskPayload: string, timeExpression: string, humanReadableDescription: string }`.
*   The tool parses `timeExpression` into a future date.
*   Calls `createSchedule` with:
    *   `task_handler_type: \'AGENT_PROMPT\'`
    *   `payload`: the `taskPayload` string.
    *   `task_key`: dynamically generated like `agent.toolScheduled.<uuid>`.
    *   `execution_policy`: typically `DEFAULT_SKIP_MISSED`.
*   When the scheduled time arrives, `executeScheduledItem` invokes `agentExecutionCallback` (which is `schedulerAgentCallback` in `src/index.ts`), passing the `taskPayload`. The agent then processes this payload as a new prompt. 