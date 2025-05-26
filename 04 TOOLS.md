# Wooster Tools Guide

This document covers the **tool** layer—functions that Wooster's LLM agent can call at runtime to interact with the filesystem or external services, or to explicitly query its internal knowledge base.

## Core Tools

1. **`sendEmail({ to, subject, body }): Promise<string>`**
   - Located in `src/tools/email.ts`.  
   - Sends an email.
   - The agent uses this tool when the user asks Wooster to compose and send an email.
   - Agent tool name: `send_email`
   - Configuration: Requires `TOOLS_EMAIL_ENABLED=true` in `.env`, along with `EMAIL_SENDING_EMAIL_ADDRESS` and `EMAIL_EMAIL_APP_PASSWORD`. See `06 CONFIG.MD`.

2. **`scheduleAgentTask({ taskPayload: object, timeExpression: string, humanReadableDescription: string }) → string`**
   - Implemented via `src/tools/scheduler.ts` which interacts with `src/scheduler/schedulerService.ts`.
   - **`taskPayload`**: A JSON object (often just a string query) representing the core agent query or intent to be executed at the scheduled time.
   - **`timeExpression`**: A natural language string for when the task should run (e.g., "tomorrow at noon", "in 2 hours").
   - **`humanReadableDescription`**: A brief string describing the scheduled task.
   - Registers the task with the `SchedulerService`. Returns a confirmation message.
   - Agent tool name: `schedule_agent_task`

3. **`queryKnowledgeBase({ query: string }) → string`** 
   - Allows the agent to explicitly perform a RAG query against the active knowledge base.
   - **`query`**: The natural language query.
   - The function invokes the main RAG chain.
   - Returns the synthesized answer from the RAG chain.
   - Agent tool name: `query_knowledge_base`

4. **`recall_user_context({ query: string }) → string`** (User Contextual Memory - UCM)
   - This tool allows the agent to recall previously learned user-specific facts or preferences.
   - **`query`**: A phrase describing the specific user context needed.
   - Function: `recallUserContextFunc` (from `src/tools/userContextTool.ts`)
   - Purpose: To retrieve information from the User Context Memory (UCM).
   - How it works: Queries a dedicated vector store (`vector_data/user_context_store/`).
   - When to use: For questions about personal preferences, habits, or previously shared information.
   - Input (for agent tool): An object with a `query` key. Example: `{"query": "my preferred programming language"}`
   - Output: A string containing the retrieved fact(s) or a statement that no relevant information was found.
   - Agent tool name: `recall_user_context`
   - Configuration: Enabled by setting the `UCM_ENABLED=true` environment variable in `.env`. The UCM extractor prompt can be customized with `UCM_EXTRACTOR_LLM_PROMPT`. See `06 CONFIG.MD`.
   - See `02 UCM.MD` for more details on the UCM system.

5. **`web_search({ query: string }) → string`** (Web Search)
   - This tool allows the agent to perform a real-time web search.
   - Underlying Service: [Tavily AI](https://tavily.com/)
   - Function: `webSearchTool.invoke({ query: query })` (from `src/tools/webSearchTool.ts`)
   - Purpose: To fetch up-to-date information from the internet.
   - Agent tool name: `web_search`
   - How it works: Uses the Tavily Search API.
   - When to use: 
        *   For current information (e.g., "What's the weather like?").
        *   For specific dates of upcoming public events.
        *   For facts likely to have changed or too specific for static knowledge.
        *   Do NOT use for information in project documents (`query_knowledge_base`) or personal facts (`recall_user_context`).
   - Input (for agent tool): An object with a `query` key. Example: `{"query": "current news headlines"}`
   - Output: A string containing the search results.
   - Configuration: 
        *   Requires the `TAVILY_API_KEY` environment variable to be set in `.env`.
        *   The tool is enabled by setting `TOOLS_WEB_SEARCH_ENABLED=true` in `.env` (this is often the default if the API key is present).
        *   Depends on the `@langchain/tavily` package.
        *   See `06 CONFIG.MD` for details on these environment variables.

6. **`listFiles()` (Conceptual - if made an agent tool)**
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
5.  If the agent does not choose a specific tool, or after a tool interaction if a final answer is needed, it typically uses its RAG capabilities (e.g., via the `query_knowledge_base` tool or by invoking the `ragCallback` from `src/index.ts`) to generate a response.

Each tool in the `availableTools` array in `src/agent.ts` conforms to the `AgentTool` interface:

```typescript
// Defined in src/agent.ts
export interface AgentTool {
  name: string;                              
  description: string;                       
  parameters: {                              
    type: "object";
    properties: Record<string, { 
      type: string;                         
      description: string;                 
    }>;
    required?: string[];                     
  };
  execute: (args: any) => Promise<string>;  
}
```

This structure allows the agent framework to correctly inform the LLM about each tool's capabilities and argument requirements, and to dispatch calls to the appropriate `execute` function.