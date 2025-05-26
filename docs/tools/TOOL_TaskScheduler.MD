# Tool: Schedule Agent Task (`scheduleAgentTask`)

This document details the `scheduleAgentTask` tool available to Wooster's agent.

## 1. Purpose

The `scheduleAgentTask` tool allows the agent to schedule a task or query to be executed by itself at a specified future time. This is useful for reminders, deferring actions until a more appropriate time (e.g., checking for information that will be available later), or setting up recurring tasks (though complex recurrence is not the primary design focus of this specific tool implementation).

## 2. Agent-Facing Description

When deciding to use this tool, the agent is provided with the following description:

```
Schedules a task for the agent to perform at a specified future time. Input MUST be an object with three keys: 'taskPayload' (string: the core task for the agent to execute later, e.g., 'What is the weather in London?'), 'timeExpression' (string: a natural language expression for when the task should run, e.g., 'tomorrow at 10am', 'in 2 hours'), and 'humanReadableDescription' (string: a brief description of the task, e.g., 'Check London weather').
```

## 3. Tool Name

`scheduleAgentTask`

## 4. Input Schema

- **Type**: `object` (or a JSON string that parses to this object)
- **Properties**:
    - `taskPayload`:
        - Type: `string`
        - Description: The core task, query, or instruction that Wooster should execute at the scheduled time. This should be phrased as if the user is giving the instruction directly to Wooster at that future moment (e.g., "Tell me the weather in New York", "Send an email to John about the project update").
    - `timeExpression`:
        - Type: `string`
        - Description: A natural language expression indicating when the task should run (e.g., "tomorrow at 10am", "in 30 minutes", "next Friday at noon", "August 15th at 3 PM").
    - `humanReadableDescription`:
        - Type: `string`
        - Description: A brief, human-friendly description of what is being scheduled. This is used for confirmation messages and for listing scheduled tasks.
- **Required**: `taskPayload`, `timeExpression`, `humanReadableDescription`
- **Example Agent Input** (as an object):
  ```json
  {
    "taskPayload": "Check the latest news headlines and summarize them for me.",
    "timeExpression": "tomorrow morning at 9am",
    "humanReadableDescription": "Summarize news headlines"
  }
  ```
- **Example Agent Input** (as a JSON string):
  `"{\"taskPayload\":\"Remind me to call Sarah\",\"timeExpression\":\"in 1 hour\",\"humanReadableDescription\":\"Call Sarah reminder\"}"`

## 5. Output Schema

- **Type**: `string`
- **Description**: A confirmation message indicating success (e.g., `"Okay, I've scheduled \"Summarize news headlines\" for Tue Jul 23 2024 09:00:00 GMT-0700 (Pacific Daylight Time). (ID: 12345)"`) or an error message if scheduling failed (e.g., `"Could not understand the time expression: ..."`, `"The specified time ... is in the past..."`).

## 6. Dependencies & Configuration

- **Underlying System**: Wooster's Scheduler Service (`src/scheduler/schedulerService.ts`) which uses `node-schedule` and an SQLite database (`database/memory.db`) for persistence.
- **Date Parsing**: `parseDateString` (from `src/scheduler/scheduleParser.ts`) which uses `chrono-node`.
- **Function**: The `func` within `agentExecutorService.ts` calls `createAgentTaskSchedule`.
- **Configuration** (from `.env` - see `06 CONFIG.MD`):
    - No specific environment variables are *required* to enable/disable this tool itself, as it's a core capability. Its functionality relies on the scheduler system being operational.

## 7. When to Use (Agent Guidance)

The agent should consider using this tool when:

- The user explicitly asks to be reminded of something or to perform an action at a later time/date.
- The user requests information that is only available or relevant at a future point.
- A task involves multiple steps, and one step needs to be deferred.

## 8. When NOT to Use

- For tasks that need to be done immediately.
- If the time expression is vague and cannot be parsed into a specific future date/time (the tool will return an error).
- For extremely complex recurring schedules that go beyond simple future one-time execution (the underlying `node-schedule` supports cron, but this tool's `timeExpression` primarily targets natural language for single events). 