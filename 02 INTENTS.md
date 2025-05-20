# Wooster Intents & Command Handling Guide

Wooster processes user input through a sequence involving REPL command parsing, agent-based tool usage (including scheduling deferred tasks), and finally RAG over loaded project documents if no specific tool or command is invoked.

## 1. Built-in REPL Commands
These are direct commands handled by `src/index.ts` for immediate actions:

- **`help`**: Displays a list of top-level commands.
- **`list capabilities`**: Shows Wooster's core features.
- **`list projects`**: Lists projects from `projects.json`.
- **`load project <name>`**: Loads a specified project into memory.
- **`unload project`**: Clears the current project context.
- **`list plugins`**: Shows loaded plugin modules (if any are still in use).
- **`list tools`**: Lists available agent tools from `src/tools`.
- **`list files`**: Lists files in the currently loaded project.
- **`list reminders`**: Shows pending scheduled agent intents.
- **`cancel <id>`**: Cancels a specific scheduled intent.
- **`status`**: Displays Scheduler status and the last heartbeat.

## 2. Agent-Driven Actions & Tools (`src/agent.ts`)
If input is not a built-in REPL command, it's passed to the agent (`agentRespond`). The agent determines the user's intent and may decide to:

  A. **Invoke a Tool Directly**: For immediate actions like:
    - **`sendEmail`**: If the user asks to send an email now.
    - **`listFiles`**: If the user asks to list files.
    - **`queryKnowledgeBase`**: If the agent needs to explicitly search its documents for specific information before proceeding with another action or formulating an answer (e.g., finding an address before emailing it). This tool directly uses the RAG chain.
    - *Other custom tools...*

  B. **Schedule a Deferred Task/Intent via `scheduleAgentTask` Tool**: If the user's request involves a future action (e.g., "email me the weather report tomorrow at 6 am", "remind me to call Sarah in 20 minutes").
    - The agent parses the core task and the time expression.
    - It formulates a `taskPayload` (a JSON representation of the core intent to be executed later, e.g., `{ "deferredQuery": "Fetch weather for London and email to user@example.com" }`).
    - It calls the `scheduleAgentTask` tool with this payload, the time expression, and a human-readable description.
    - The `SchedulerService` stores this intent. At the scheduled time, it re-invokes the agent logic with the stored `taskPayload` for fresh execution.

  C. **Fallback to RAG**: If no specific tool or scheduling is identified, the agent uses the RAG chain to answer based on loaded documents.

## 3. Example Flow: Scheduled Task
User: `"Schedule a reminder to check server status in 1 hour"`
1. REPL passes input to `agentRespond`.
2. Agent (LLM) identifies: 
    - Time: `"in 1 hour"`.
    - Core task: `"check server status"`. The agent might first use `queryKnowledgeBase({ queryString: "How do I check server status?" })` if it needs to learn the procedure before scheduling or if the procedure itself is what needs to be done at the scheduled time.
    - Human-readable description: `"Check server status"`.
3. Agent formulates `taskPayload`. If the task is just to re-query, it might be `{ "deferredQuery": "check server status" }`. If it involves specific steps learned via `queryKnowledgeBase`, those steps might be encoded.
4. Agent calls `scheduleAgentTask({ taskPayload, timeExpression: "in 1 hour", humanReadableDescription: "Check server status" })`.
5. `scheduleAgentTask` tool interacts with `SchedulerService` to store and schedule this.
6. Wooster confirms: `"Okay, I've scheduled 'Check server status' for [resolved time]."`
7. In 1 hour: `SchedulerService` job fires, retrieves the `taskPayload`, and calls the `agentExecutionCallback`.
8. The callback re-runs agent logic with the `taskPayload`. The agent now processes `"Check server status"` as an immediate task (e.g., calls a `checkServerStatus` tool or performs a RAG query).

## 4. Adding Custom REPL Commands
- Edit `src/index.ts` and insert conditional logic before the agent/RAG fallback.

## 5. Adding Agent Tools
- Create the tool file in `src/tools/`.
- Update the agent prompt in `src/agent.ts` to make the LLM aware of the new tool.
- Ensure `04 TOOLS.MD` is updated.

---
This approach allows Wooster to handle immediate commands, direct tool use, complex RAG queries, and sophisticated deferred execution of tasks with up-to-date context. 