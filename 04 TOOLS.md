# Wooster Tools Guide

This document covers the **tool** layer—functions that Wooster's LLM agent can call at runtime to interact with the filesystem or external services, or to explicitly query its internal knowledge base.

## Core Tools

1. **listFiles(projectName: string) → string[]**
   - Located in `src/tools/filesystem.ts` (or projectIngestor).  
   - Recursively lists all file paths in the given project folder or glob.  
2. **sendEmail({ to, subject, body }): Promise<string>**
   - Located in `src/tools/email.ts`.  
   - Sends an email via Gmail SMTP with OAuth2 or app passwords.  
   - Agent uses this tool when you ask Wooster to email content.
3. **scheduleAgentTask({ taskPayload: object, timeExpression: string, humanReadableDescription: string }) → string**
   - Located in `src/tools/scheduler.ts` (to be created/adapted).
   - **taskPayload**: A JSON object representing the core agent query or intent to be executed at the scheduled time. The agent formulates this based on the user's request, stripping away the scheduling part (e.g., for "email me X in 5 mins", the payload would concern "email me X").
   - **timeExpression**: A natural language string for when the task should run (e.g., "tomorrow at noon", "in 2 hours", "every Friday at 9am"). This is parsed by `chrono-node` via the `ScheduleParser`.
   - **humanReadableDescription**: A brief string describing the scheduled task for listing purposes (e.g., "Email favorite color to user").
   - This tool tells the `SchedulerService` to store the `taskPayload` and `humanReadableDescription`, and schedule it according to `timeExpression`.
   - At the scheduled time, the `SchedulerService` will trigger a re-invocation of agent logic, providing it with the stored `taskPayload` for fresh execution.
   - Returns a confirmation message, e.g., "Okay, I've scheduled '[humanReadableDescription]' for [resolved date/time]."
   - Agent uses this tool when a user's request involves deferred execution of an action or query.
4. **queryKnowledgeBase(queryString: string) → string**
   - **Not a file in `src/tools/`. This is a special "shortcut" tool handled directly by `src/agent.ts`.**
   - Allows the agent to explicitly perform a RAG (Retrieval Augmented Generation) query against its current knowledge base (vector store and loaded documents).
   - **queryString**: The natural language query to search the knowledge base with.
   - The agent uses this when it needs to find specific information from documents before deciding on another action or formulating a complete answer.
   - Returns the synthesized answer from the RAG chain based on the `queryString`.
   - Example: For a user request "Find John's address and email it to Jane", the agent might first call `queryKnowledgeBase({ queryString: "What is John's address?" })`, then use the result to call `sendEmail`.

## Agent Integration (`src/agent.ts`)

Wooster routes user input through an **agentRespond** function that:
1. Prompts the LLM with a description of your available tools (including `queryKnowledgeBase`) and their argument shapes. It needs to understand when a request requires scheduling versus immediate action.
2. If scheduling is needed, the agent first resolves the core task into a `taskPayload` (what to do later) and determines the `timeExpression`.
3. It then calls the `scheduleAgentTask` tool with this payload and time.
4. For immediate actions, it parses the LLM's JSON decision for direct tool invocation: `{"tool":"<name>","args":{...}}`.  
5. Invokes the chosen tool with those args.  
6. If the tool is `none` (and not a scheduled task), falls back to RAG: `ragChain.invoke({ input })`.  
7. When `queryKnowledgeBase` is chosen:
    - `agentRespond` directly invokes the main `ragChain` with the provided `queryString`.
    - The result is returned to the LLM as the tool's output for further reasoning.

Example scaffold for agent formulating a scheduled task:
```ts
// User input: "Email me my favorite color in 10 minutes"
// Agent determines:
const taskPayload = { 
  deferredQuery: "What is Wooster's favorite color? Email it to user@example.com",
  // Or more structured:
  // resolveAndAct: { 
  //   resolveQuery: "What is Wooster's favorite color?", 
  //   actionTool: "sendEmail", 
  //   actionArgsTemplate: { "to": "user@example.com", "subject": "My Favorite Color", "body": "{{resolvedQueryOutput}}" } 
  // }
};
const timeExpression = "in 10 minutes";
const humanReadableDescription = "Email favorite color to user";

// Agent decides to call scheduleAgentTask tool
const toolToCall = "scheduleAgentTask";
const toolArgs = { taskPayload, timeExpression, humanReadableDescription };
// ... then proceeds to invoke this tool.
```

Example scaffold for direct tool call (existing):
```ts
// src/agent.ts
const toolPrompt = `You have these tools:
1. listFiles(projectName)
2. sendEmail({to,subject,body})
3. scheduleAgentTask({taskPayload, timeExpression, humanReadableDescription})
4. queryKnowledgeBase(queryString)
...`
const res = await llm.call({ prompt: toolPrompt + input })
const { tool, args } = JSON.parse(res.text)
if (tool === 'listFiles') return await listFiles(args.projectName)
if (tool === 'sendEmail') return await sendEmail(args)
if (tool === 'scheduleAgentTask') return await scheduleAgentTask(args) // Assuming scheduleAgentTask is an agent callable tool
if (tool === 'queryKnowledgeBase') return await queryKnowledgeBase(args.queryString)
return (await ragChain.invoke({ input })).answer
```

## Listing Tools in REPL
- Use the REPL command `list tools` to print the base names of all modules in `src/tools/`.

## Adding New Tools
1. Create a file in `src/tools/`, for example `myTool.ts`.  
2. Export your function.  
3. Update the agent prompt in `src/agent.ts` to include your tool name and signature.  
4. Restart Wooster.  

---
With this toolkit, Wooster can dynamically choose the right low-level operation—filesystem lookup, file reading, emailing—before falling back to RAG, keeping the system both powerful and lightweight.
