# Wooster Scheduler System (V3 - Simplified)

## 1. Overview

The Wooster Scheduler System is responsible for managing and executing tasks at predefined times or intervals. It has been redesigned with simplicity, reliability, and maintainability as core principles. It supports recurring tasks (via cron expressions) and one-off future tasks using `croner` and `better-sqlite3`.

## 2. Core Components

*   **`SchedulerService` (`src/scheduler/schedulerService.ts`)**: The central static class for all scheduling operations.
    *   Uses **`croner`** for all scheduling logic.
    *   Provides a simple, `async` API: `start()`, `create()`, `delete()`, `getByKey()`, `getAllScheduledTasks()`.
    *   **Missed Job Handling**: On startup, it checks for one-off tasks scheduled in the past and executes them immediately ("Catch Up"), then removes them.
*   **`SchedulerRepository` (`src/scheduler/schedulerRepository.ts`)**: Manages data persistence using **`better-sqlite3`**.
    *   Interacts with a simplified SQLite database (`database/scheduler.sqlite3`) in WAL mode for crash safety.
*   **`scheduleAgentTaskTool` (`src/schedulerTool.ts`)**: A tool available to the Wooster agent, allowing it to schedule new tasks.
*   **Direct Function Registration**: System-level tasks (like a Daily Review) are registered as direct functions with specific `task_key`s.

## 3. Simplified Database Schema

The scheduler uses a single, lean `schedules` table.

| Column | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | Primary Key (UUID) | `uuidv4()` |
| `description` | TEXT | Human-readable description of the task. | "Daily Review Email" |
| `schedule_expression` | TEXT | Cron string or an ISO 8601 datetime string. | `"0 7 * * *"` / `"2024-12-31T23:59:00Z"` |
| `task_key` | TEXT | A unique key identifying the target function. `UNIQUE`. | `"system.dailyReview.sendEmail"` |
| `task_handler_type` | TEXT | `AGENT_PROMPT` or `DIRECT_FUNCTION`. | `"DIRECT_FUNCTION"` |
| `payload` | TEXT | JSON string with data for the task. | `"{}"` / `"A prompt for the agent"` |
| `is_active` | BOOLEAN | Whether the schedule is currently active. | `TRUE` |
| `created_at` | TEXT | Timestamp of creation (ISO 8601). | `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` |

**Removed Columns:** `updated_at`, `next_run_time`, `last_invocation`, `execution_policy`.

## 4. Key Concepts

### 4.1. Simplicity as a Feature
The new design intentionally omits complex "catch-up" logic.
*   A task runs at its scheduled time.
*   If Wooster is offline during a scheduled time, the task does **not** run. It will simply run at its *next* scheduled time.
*   This makes the system's behavior highly predictable and eliminates a major source of bugs and complexity.

### 4.2. `task_handler_type`
*   **`DIRECT_FUNCTION`**: The `payload` is passed to a TypeScript function registered with the `SchedulerService`. Used for reliable system tasks.
*   **`AGENT_PROMPT`**: The `payload` (which is just a string) is sent to the Wooster agent for processing.

## 5. `SchedulerService` Operations

The `SchedulerService` is now a static class, so you don't need to instantiate it.

### 5.1. `SchedulerService.start()`
*   Called once at Wooster startup.
*   Loads all active schedules from the database.
*   Creates a `croner` job for each one.

### 5.2. `SchedulerService.create(item)`
*   Adds a new `ScheduleItem` to the database.
*   Immediately creates and starts a `croner` job for it.

### 5.3. `SchedulerService.delete(id)`
*   Stops the running `croner` job.
*   Deletes the `ScheduleItem` from the database.

### 5.4. `registerDirectScheduledFunction(taskKey, function)`
*   Called at startup to map a `task_key` string to a TypeScript function.

## 6. Example: Daily Review Seeding

In `src/index.ts`, setting up the Daily Review is now much cleaner:

```typescript
// 1. Register the function
registerDirectScheduledFunction(
  "system.dailyReview.sendEmail", 
  sendDailyReview // The actual function
);

// 2. Check if the schedule exists, and create it if not.
const dailyReviewJob = await SchedulerService.getByKey("system.dailyReview.sendEmail");
if (!dailyReviewJob) {
  await SchedulerService.create({
    description: "Sends the Daily Review email each morning.",
    schedule_expression: "0 7 * * *", // 7:00 AM daily
    task_key: "system.dailyReview.sendEmail",
    task_handler_type: "DIRECT_FUNCTION",
    payload: JSON.stringify({}),
  });
}

// 3. Start the entire service
await SchedulerService.start();
```

This approach is declarative, clean, and ensures the scheduler state is correctly managed on startup. 