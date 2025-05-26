# Tool: Web Search (`web_search`)

This document details the `web_search` tool available to Wooster's agent.

## 1. Purpose

The `web_search` tool allows the agent to perform real-time searches on the internet. This is crucial for retrieving up-to-date information, facts that may have changed since the agent's training, or any topic requiring current knowledge.

## 2. Agent-Facing Description

When deciding to use this tool, the agent is provided with the following description:

```
Searches the web for current information, news, facts, or any topic that requires up-to-date knowledge beyond the AI's training data. Input should be a concise search query string.
```

## 3. Tool Name

`web_search`

## 4. Input Schema

- **Type**: `string`
- **Description**: A concise search query string, similar to what a human would type into a search engine.
- **Example**: `"current weather in London"`, `"latest advancements in AI"`, `"when is the next solar eclipse"`

## 5. Output Schema

- **Type**: `string`
- **Description**: A string containing the search results, typically a summary or snippets from relevant web pages. The format and length can vary based on the search service (Tavily).

## 6. Dependencies & Configuration

- **Underlying Service**: Tavily AI Search API (`@langchain/tavily`).
- **Environment Variables** (from `.env` - see `06 CONFIG.MD`):
    - `TAVILY_API_KEY`: **Required**. Your API key for the Tavily service.
    - `TOOLS_WEB_SEARCH_ENABLED`: Must be `true` (or not present, as it defaults to `true` if the API key is provided) for the tool to be available to the agent.
- **Function**: `performWebSearch(input: string)` (defined in `src/tools/webSearchTool.ts`, called by `agentExecutorService.ts`).

## 7. When to Use (Agent Guidance)

The agent should consider using this tool when:

- The user asks for current information (e.g., news, weather, stock prices).
- The user asks about specific dates for future public events.
- The query pertains to facts or information likely to have changed recently or is too specific to be in its static knowledge base.
- Information is needed that explicitly requires accessing the live internet.

## 8. When NOT to Use

- For information contained within the current project's documents (use `queryKnowledgeBase` instead).
- For recalling user-specific preferences or previously discussed personal information (use `recall_user_context` instead).
- If the query can be answered from general knowledge without needing real-time data. 