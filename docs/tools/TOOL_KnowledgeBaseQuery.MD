# Tool: Project Knowledge Base Query (`queryKnowledgeBase`)

This document details the `queryKnowledgeBase` tool available to Wooster's agent.

## 1. Purpose

The `queryKnowledgeBase` tool allows the agent to search for and retrieve information that is stored exclusively within the documents and data associated with the currently active Wooster project. It utilizes a Retrieval Augmented Generation (RAG) chain to provide answers based on this specific context.

## 2. Agent-Facing Description

When deciding to use this tool, the agent is provided with the following description:

```
Searches and answers questions based exclusively on the documents and knowledge within the currently active project. Use for information specific to this project's context. Input should be a concise query string detailing what information is sought.
```

## 3. Tool Name

`queryKnowledgeBase`

## 4. Input Schema

- **Type**: `string`
- **Description**: A concise natural language query string detailing the specific information sought from the project's documents.
- **Example**: `"summary of the project goals"`, `"what are the key findings in report_q3.pdf"`, `"contact details for the lead developer on module X"`

## 5. Output Schema

- **Type**: `string`
- **Description**: A string containing the answer synthesized by the RAG chain based on the retrieved documents from the project's vector store. If no relevant information is found, or if the necessary stores/LLM are unavailable, it will return an appropriate message.

## 6. Dependencies & Configuration

- **Underlying System**: Retrieval Augmented Generation (RAG) chain, History-Aware Retriever, StuffDocumentsChain.
- **Vector Store**: Project-specific MemoryVectorStore. The store is persisted to disk in a `vector_store.json` file for fast reloads and is managed by `src/projectIngestor.ts`.
- **Embeddings**: Uses the globally configured embeddings model (e.g., from OpenAI).
- **LLMs**: Uses `agentLlm` (defined in `agentExecutorService.ts`) for both rephrasing queries (history-aware retriever) and synthesizing answers (stuff documents chain).
- **Function**: Inline RAG logic within the `func` definition of the `queryKnowledgeBase` tool in `src/agentExecutorService.ts`.
- **Configuration** (from `.env` - see `06 CONFIG.MD`):
    - `OPENAI_API_KEY`, `OPENAI_MODEL_NAME`, `OPENAI_TEMPERATURE`: Used for the LLMs involved in the RAG process.
    - Project data must be ingested into the project's vector store for this tool to find relevant information.

## 7. When to Use (Agent Guidance)

The agent should **strongly prefer** this tool when:

- The user's query is about information that is likely contained **within the documents of the currently loaded project**.
- Questions relate to project-specific details, reports, meeting notes, code documentation, or any other data ingested into the project.
- The information sought is not general knowledge and is not about the user's personal context.

## 8. When NOT to Use

- For general knowledge or up-to-date information not specific to the project (use `web_search` instead).
- For recalling user-specific preferences or previously discussed personal information (use `recall_user_context` instead).
- If the query is very broad and not targeted at specific project content. 