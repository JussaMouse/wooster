# 04 Wooster Tools System

This document provides an overview of the tooling system used by Wooster's AI agent. Tools are specialized functions that the agent can use to interact with external services, access specific data stores, or perform actions beyond its immediate knowledge.

## 1. Tools and the AgentExecutor

Wooster's agent, built on LangChain's `AgentExecutor` (specifically an OpenAI Tools Agent), relies on a collection of tools to perform its tasks effectively. These tools are instances of LangChain's `DynamicTool` class, each encapsulating specific functionality.

Key aspects of how tools integrate with the agent:

- **DynamicTool Definition**: Each tool is defined in `src/agentExecutorService.ts` and has:
    - `name`: A unique string identifier (e.g., `web_search`, `sendEmail`).
    - `description`: **This is the most critical part for the agent.** The description tells the LLM what the tool does, when it should be used, and what kind of input it expects. The agent's ability to correctly choose and use tools depends heavily on the clarity and accuracy of these descriptions.
    - `func`: The actual TypeScript async function that gets executed when the agent decides to use the tool. It takes an input (often a string or a structured object) and returns a string result (the "observation") to the agent.

- **Agent Decision Making**: The `AgentExecutor` presents the names and descriptions of all available tools to the LLM. Based on the user's query and the conversation history, the LLM decides:
    1.  Whether a tool is needed to fulfill the request.
    2.  Which specific tool is most appropriate.
    3.  What input to provide to that tool.

- **Iterative Process**: After a tool is executed, its output (observation) is fed back to the LLM. The LLM can then decide to use another tool, or generate a final response to the user. This iterative process allows for complex, multi-step tasks.

## 2. The Importance of Tool Descriptions

It cannot be overstated: **the quality of tool descriptions directly impacts the agent's intelligence and reliability.**

- A good description is clear, concise, and action-oriented.
- It should explicitly state the tool's purpose and the kind of input it expects (e.g., "Input should be a search query string," or "Input must be an object with keys: 'to', 'subject', 'body'").
- It helps the LLM distinguish between tools with similar capabilities (e.g., when to use `queryKnowledgeBase` vs. `web_search`).

Refer to the individual tool documentation files for the exact descriptions provided to the agent.

## 3. Core Wooster Tools

The following core tools are available to the Wooster agent. Each tool has its own detailed documentation file in the `docs/tools/` directory, which includes its exact name, purpose, the description provided to the agent, input/output schemas, and any relevant configuration notes.

- **Web Search**
    - Documentation: `docs/tools/TOOL_WebSearch.MD`
    - Briefly: Performs real-time internet searches for up-to-date information.

- **User Context Recall**
    - Documentation: `docs/tools/TOOL_UserContextRecall.MD`
    - Briefly: Retrieves previously learned user-specific facts, preferences, or context.

- **Project Knowledge Base Query**
    - Documentation: `docs/tools/TOOL_KnowledgeBaseQuery.MD`
    - Briefly: Searches and answers questions based exclusively on documents within the currently active project.

- **Send Email**
    - Documentation: `docs/tools/TOOL_Email.MD`
    - Briefly: Composes and sends emails on behalf of the user.

- **Schedule Agent Task**
    - Documentation: `docs/tools/TOOL_TaskScheduler.MD`
    - Briefly: Schedules a task for the agent to perform at a specified future time.

*This list may expand as more capabilities are added to Wooster.*

## 4. Configuration

- General tool enablement and tool-specific API keys or settings are managed via environment variables in the `.env` file.
- See `06 CONFIG.MD` for a comprehensive list of these variables.
- Individual tool documentation files also highlight their specific configuration requirements.