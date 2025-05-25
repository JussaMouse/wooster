# Wooster Tools Guide

This document covers the **tool** layer—functions that Wooster's LLM agent can call at runtime to interact with the filesystem or external services, or to explicitly query its internal knowledge base.

## Core Tools

1. **`sendEmail({ to, subject, body }): Promise<string>`**
   - Located in `src/tools/email.ts`.  
   - Sends an email. (Details about SMTP/OAuth2 can be in the tool's own documentation or comments).
   - The agent uses this tool when the user asks Wooster to compose and send an email.

2. **`scheduleAgentTask({ taskPayload: object, timeExpression: string, humanReadableDescription: string }) → string`**
   - Implemented via `src/tools/scheduler.ts` which interacts with `src/scheduler/schedulerService.ts`.
   - **`taskPayload`**: A JSON object (often just a string query) representing the core agent query or intent to be executed at the scheduled time.
   - **`timeExpression`**: A natural language string for when the task should run (e.g., "tomorrow at noon", "in 2 hours").
   - **`humanReadableDescription`**: A brief string describing the scheduled task.
   - Registers the task with the `SchedulerService`. Returns a confirmation message.

3. **`queryKnowledgeBase({ query: string }) → string`** (Note: Name in `src/agent.ts` is `search_knowledge_base`)
   - Allows the agent to explicitly perform a RAG query against the active knowledge base.
   - **`query`**: The natural language query.
   - The function invokes the main RAG chain.
   - Returns the synthesized answer from the RAG chain.
   - Example: For "Find John's address and email it to Jane", the agent might first call `search_knowledge_base({ query: "What is John's address?" })`, then use the result in a call to `sendEmail`.

4. **`recall_user_context({ topic: string }) → string`** (User Contextual Memory - UCM)
   - Allows the agent to retrieve learned user preferences/facts from the UCM store.
   - **`topic`**: A phrase describing the specific user context needed.
   - Queries the UCM vector store (`vector_data/user_context_store/`).
   - Returns relevant user-specific information or a message if none is found.
   - See `07 UCM.MD` for more details on the UCM system.

5. **`listFiles()` (Conceptual - if made an agent tool)**
   - If direct file listing by the agent is desired (beyond the REPL command `list files`):
   - A wrapper tool could be created (e.g., in `src/tools/filesystem.ts`).
   - This tool would call `projectIngestor.listProjectFiles(currentProjectName)`.
   - Currently, `list files` is primarily a REPL command.

## Agent Integration (`src/agent.ts`)

Wooster routes user input not handled by REPL commands through an `agentRespond` function. This function orchestrates the agent's interaction with tools and the RAG system.

1.  The agent (LLM) is made aware of the available tools defined in the `availableTools` array in `src/agent.ts`. LangChain's `llm.bindTools(availableTools)` method (or similar mechanisms) formats the tool descriptions for the LLM prompt, enabling it to decide when to use them.
2.  The LLM processes the user's input and conversation history.
3.  It decides if a tool should be used or if it can respond directly. Its decision includes which tool to call and with what arguments, based on the tool's defined `name`, `description`, and `parameters`.
4.  If the agent decides to use a tool:
    *   The `agentRespond` function (or the LangChain agent executor framework) executes the chosen tool's `execute` method with the LLM-provided arguments.
    *   The output from the tool is returned to the agent, which then decides on the next step (another tool call, or generating a final response).
5.  If the agent does not choose a specific tool, or after a tool interaction if a final answer is needed, it typically uses its RAG capabilities (e.g., via the `queryKnowledgeBase` tool or by invoking the `ragCallback` from `src/index.ts`) to generate a response.

Each tool in the `availableTools` array in `src/agent.ts` conforms to the `AgentTool` interface:

```typescript
// Defined in src/agent.ts
export interface AgentTool {
  name: string;                               // Name of the tool, e.g., "sendEmail"
  description: string;                        // Description for the LLM to understand what the tool does
  parameters: {                               // JSON schema for the tool's arguments
    type: "object";
    properties: Record<string, { 
      type: string;                         // e.g., "string", "number", "boolean"
      description: string;                  // Description of the parameter for the LLM
    }>;
    required?: string[];                      // Array of required parameter names
  };
  execute: (args: any) => Promise<string>;   // The function to run when the tool is called
}

// Example entry in availableTools:
// const availableTools: AgentTool[] = [
//   {
//     name: "sendEmail",
//     description: "Sends an email to a specified recipient with a subject and body.",
//     parameters: {
//       type: "object",
//       properties: {
//         to: { type: "string", description: "The email address of the recipient." },
//         subject: { type: "string", description: "The subject of the email." },
//         body: { type: "string", description: "The body content of the email." }
//       },
//       required: ["to", "subject", "body"]
//     },
//     execute: async (args) => { 
//       // Actual call to email sending logic from src/tools/email.ts
//       // return sendEmailToolFunction(args.to, args.subject, args.body); 
//       return "Email would be sent here."; // Placeholder
//     }
//   },
//   // ... other tools ...
// ];
```

This structure allows the agent framework to correctly inform the LLM about each tool's capabilities and argument requirements, and to dispatch calls to the appropriate `execute` function.