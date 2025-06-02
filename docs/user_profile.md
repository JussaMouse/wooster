# User Profile Design

This document outlines a conceptual approach for a "User Profile" system. It is designed to enable Wooster to learn about the user's preferences, facts, and context from conversations, while distinguishing this from project-specific knowledge.

## Core Idea: Dual Knowledge Systems with a User Knowledge Extractor

The system would feature two distinct knowledge components:

1.  **Project Knowledge (Existing ProjectRAG System):**
    *   Knowledge Base: Vector stores dedicated to each project.
    *   Purpose: To answer questions and provide information derived *from the content of the currently loaded project*.

2.  **User Profile (New System):**
    *   Knowledge Base: A separate, dedicated vector store (e.g., `vector_data/user_profile_store/`).
    *   Purpose: To store and retrieve facts, preferences, statements, and insights *about the user*.
    *   Content Examples: Embeddings of statements like "User likes Woody Allen films."

## Key Component: The "User Knowledge Extractor"

To populate User Profile accurately, a "User Knowledge Extractor" module is essential. This would likely be an LLM-powered component that processes each conversational turn.

**Workflow of the User Knowledge Extractor:**

1.  **Observation Phase:** After each user-assistant interaction, it analyzes user input, assistant response, and project context.
2.  **Extraction & Filtering Logic:** Guided by a sophisticated prompt to identify user-specific information and filter out project content.
3.  **Storing in User Profile:** Extracted knowledge is embedded and added to the `vector_data/user_profile_store/`.

## Utilizing Contextual User Knowledge from User Profile

When the assistant needs to access information *about the user*:
1.  It would query the User Profile system, primarily via the `recall_user_profile` agent tool.
2.  The query could be augmented with current project context.

## Challenges and Considerations:
*   Sophisticated Prompt Engineering
*   Managing Ambiguity
*   Performance Overhead
*   Evolution and Staleness of Preferences
*   Determining Granularity
*   Privacy and Control

## Privacy Considerations & Non-Local LLMs

**IMPORTANT: Data Privacy with Cloud-Based LLMs**
If the LLM for the User Knowledge Extractor is cloud-based, conversation snippets will be sent to a third-party provider. Review their data policies.

**Recommendation:** Provide clear notification or require user opt-in for User Profile learning with cloud-based LLMs.

## Current System State Relative to User Profile Implementation

Wooster's current architecture already possesses several foundational components:
*   **Vector Store Management (`src/memoryVector.ts`, `src/projectIngestor.ts`):**
    *   Experience with `FaissStore`.
    *   Use of `HuggingFaceTransformersEmbeddings` (`Xenova/all-MiniLM-L6-v2`).
    *   `USER_PROFILE_VECTOR_STORE_PATH` in `memoryVector.ts` points to `vector_data/user_profile_store/`.
    *   `initUserProfileStore` function in `memoryVector.ts`.
*   **LLM Integration (`src/index.ts`, `src/agent.ts`):**
    *   Use of `ChatOpenAI` for the "User Knowledge Extractor".
*   **Agent Tool: `recall_user_profile`:**
    *   The primary way the agent accesses User Profile, defined in `src/agentExecutorService.ts` and implemented in `src/tools/userProfileTool.ts` (formerly `userContextTool.ts`).

## Enabling/Disabling User Profile

Controlled via `USER_PROFILE_ENABLED` in `.env` file.
- If `false` or omitted, User Profile is disabled.
- The `recall_user_profile` tool should reflect this.

## Customizing the Extractor Prompt

Controlled via `USER_PROFILE_EXTRACTOR_LLM_PROMPT` in `.env` file.
- If not set, a default prompt from `src/userKnowledgeExtractor.ts` is used.
- Placeholders `{userInput}`, `{assistantResponse}`, `{currentProjectName}` are available.
