# Tool: User Context Recall (`recall_user_context`)

This document details the `recall_user_context` tool available to Wooster's agent, part of the User Contextual Memory (UCM) system.

## 1. Purpose

The `recall_user_context` tool enables the agent to access and retrieve previously learned information specific to the current user. This allows Wooster to personalize responses, remember preferences, and maintain conversational context over time.

## 2. Agent-Facing Description

When deciding to use this tool, the agent is provided with the following description:

```
Recalls specific facts, preferences, or context about the current user to personalize responses or remember user-specific information. Input should be a question or topic to recall (e.g., 'my favorite color', 'what did I say about project X').
```

## 3. Tool Name

`recall_user_context`

## 4. Input Schema

- **Type**: `string`
- **Description**: A question or topic phrase describing the specific user context the agent needs to recall.
- **Example**: `"my preferred programming language"`, `"what are my project deadlines"`, `"notes on the last meeting about Project Phoenix"`

## 5. Output Schema

- **Type**: `string`
- **Description**: A string containing the retrieved fact(s) or a statement that no relevant information was found in the User Context Memory. If the UCM store is not initialized (e.g., disabled), it will return a message indicating unavailability.

## 6. Dependencies & Configuration

- **Underlying System**: User Contextual Memory (UCM).
- **Vector Store**: FaissStore, typically located at `vector_data/user_context_store/`.
- **Function**: `recallUserContextFunc({ topic: input })` (defined in `src/tools/userContextTool.ts`, called by `agentExecutorService.ts`).
- **Environment Variables** (from `.env` - see `06 CONFIG.MD` and `02 UCM.MD`):
    - `UCM_ENABLED`: Must be `true` for this tool to be functional (and for the UCM system to learn). If `false`, the tool will indicate that the UCM store is unavailable.
    - `UCM_EXTRACTOR_LLM_PROMPT`: (Indirectly related) Governs how facts are learned by the UCM system.

## 7. When to Use (Agent Guidance)

The agent should consider using this tool when:

- The user's query explicitly or implicitly refers to their personal preferences, habits, or previously stated information.
- Personalization of the response would be beneficial.
- Continuity from previous interactions regarding user-specific details is required.
- The user asks "What do you know about me regarding X?" or similar.

## 8. When NOT to Use

- For general knowledge or facts not specific to the user (use `web_search` or direct answer).
- For information contained within the current project's documents (use `queryKnowledgeBase` instead).
- If the UCM system is known to be disabled (though the tool will handle this gracefully by returning an appropriate message). 