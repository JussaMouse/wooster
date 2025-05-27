# Tool: User Profile Recall (`recall_user_profile`)

This document details the `recall_user_profile` tool available to Wooster's agent, part of the User Profile system.

## 1. Purpose

The `recall_user_profile` tool enables the agent to access and retrieve previously learned information specific to the current user. This allows Wooster to personalize responses, remember preferences, and maintain conversational context over time.

## 2. Agent-Facing Description

When deciding to use this tool, the agent is provided with the following description:

```
Recalls specific facts, preferences, or context about the current user to personalize responses or remember user-specific information. Input should be a question or topic to recall (e.g., 'my favorite color', 'what did I say about project X', 'my writing style preferences').
```

## 3. Tool Name

`recall_user_profile`

## 4. Input Schema

- **Type**: `string`
- **Description**: A question or topic phrase describing the specific user context the agent needs to recall.
- **Example**: `"my preferred programming language"`, `"what are my project deadlines"`, `"notes on the last meeting about Project Phoenix"`

## 5. Output Schema

- **Type**: `string`
- **Description**: A string containing the retrieved fact(s) or a statement that no relevant information was found in the User Profile. If the User Profile store is not initialized (e.g., disabled), it will return a message indicating unavailability.

## 6. Dependencies & Configuration

- **Underlying System**: User Profile.
- **Vector Store**: FaissStore, typically located at `vector_data/user_profile_store/`.
- **Function**: `recallUserProfileFunc({ topic: input })` (defined in `src/tools/userProfileTool.ts`, called by `agentExecutorService.ts`).
- **Environment Variables** (from `.env` - see `06 CONFIG.MD` and `02 USER_PROFILE.MD`):
    - `USER_PROFILE_ENABLED`: Must be `true` for this tool to be functional (and for the User Profile system to learn). If `false`, the tool will indicate that the User Profile store is unavailable.
    - `USER_PROFILE_EXTRACTOR_LLM_PROMPT`: (Indirectly related) Governs how facts are learned by the User Profile system.

## 7. When to Use (Agent Guidance)

The agent should consider using this tool when:

- The user's query explicitly or implicitly refers to their personal preferences, habits, or previously stated information.
- Personalization of the response would be beneficial.
- Continuity from previous interactions regarding user-specific details is required.
- The user asks "What do you know about me regarding X?" or similar.

## 8. When NOT to Use

- For general knowledge or facts not specific to the user (use `web_search` or direct answer).
- For information contained within the current project's documents (use `queryKnowledgeBase` instead).
- If the User Profile system is known to be disabled (though the tool will handle this gracefully by returning an appropriate message). 