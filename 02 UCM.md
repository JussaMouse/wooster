# User Contextual Memory (UCM) Design

This document outlines a conceptual approach for a "User Contextual Memory" (UCM) system, previously referred to as "UserRAG." It is designed to enable Wooster to learn about the user's preferences, facts, and context from conversations, while distinguishing this from project-specific knowledge handled by the existing ProjectRAG system.

## Core Idea: Dual Knowledge Systems with a User Knowledge Extractor

The system would feature two distinct knowledge components:

1.  **Project Knowledge (Existing ProjectRAG System):**
    *   **Knowledge Base:** Vector stores dedicated to each project (e.g., `vector_data/RomanticComedyScreenplay/`), containing embeddings of project files.
    *   **Purpose:** To answer questions and provide information derived *from the content of the currently loaded project*.
    *   This system operates as currently implemented, leveraging compartmentalized project vector stores.

2.  **User Contextual Memory (UCM - New System):**
    *   **Knowledge Base:** A separate, dedicated vector store (e.g., `vector_data/user_context_store/`).
    *   **Purpose:** To store and retrieve facts, preferences, statements, and insights *about the user*, learned over time through interactions.
    *   **Content Examples:** Embeddings of statements like "User likes Woody Allen films," "User prefers to be addressed formally," "User is working on a screenplay [context: project 'RomanticComedyScreenplay']", "User finds writing emotional scenes challenging [context: project 'RomanticComedyScreenplay']".

## Key Component: The "User Knowledge Extractor"

To populate UCM accurately and distinguish its content from ProjectRAG, a "User Knowledge Extractor" module is essential. This would likely be an LLM-powered component that processes each conversational turn.

**Workflow of the User Knowledge Extractor:**

1.  **Observation Phase:** After each user-assistant interaction cycle in the REPL, the User Knowledge Extractor analyzes:
    *   The user's most recent message.
    *   The assistant's (Wooster's) most recent response.
    *   **Crucial Metadata:**
        *   The name of the project currently loaded (if any, e.g., "RomanticComedyScreenplay").
        *   An indicator of how much the assistant's response relied on ProjectRAG (e.g., were document chunks retrieved and used from the active project's vector store?).

2.  **Extraction & Filtering Logic (Driven by Prompt Engineering):**
    The User Knowledge Extractor LLM would be guided by a sophisticated prompt. Example instructions for the LLM:
    *   "Based on the provided user statement and assistant response, identify any new information explicitly stated or strongly implied *by the user about themselves*. This includes preferences, opinions, facts about their life, skills, goals, or working styles."
    *   "**Crucially, filter out information that is primarily about the detailed content or subject matter of the currently loaded project (`<currentProjectName>`).** For instance, if the user is discussing specific plot points of their screenplay, those plot details themselves should not be saved as facts *about the user*. However, if the user expresses a feeling or a challenge related to working on that project (e.g., 'I find writing emotional scenes for this screenplay particularly challenging'), that *is* a relevant fact about the user in the context of that project."
    *   "If a user-stated fact, preference, or working style seems intrinsically tied to the current project context, explicitly capture that context (e.g., '[context: project <currentProjectName>]'). If the statement appears to be a general preference or fact about the user, mark it as '[context: general]'."
    *   "Output should be a structured list of new user facts, preferences, or insights, each with its associated context (general or project-specific)."

3.  **Storing in UCM:**
    *   The extracted and filtered user knowledge (e.g., "User has seen Annie Hall and liked it [context: general]", or "User states they do not ever want to use first-person narration [context: project 'RomanticComedyScreenplay']") is then embedded using the same embeddings model as other vector stores.
    *   These new embeddings are added to the dedicated UCM vector store (`vector_data/user_context_store/`).

## Addressing Specific Scenarios:

*   **Example 1: Discussing a Woody Allen film while the "Romantic Comedy Screenplay" project is open.**
    *   **User Interaction:** "I was thinking about the dialogue for this scene. Woody Allen's films, like Annie Hall which I loved, have such great witty banter."
    *   **Assistant Response (using ProjectRAG or general knowledge):** "Yes, Annie Hall is a classic example. Your screenplay's Scene 5 could benefit from similar rapid-fire dialogue, perhaps drawing inspiration from the café scene you've outlined."
    *   **User Knowledge Extractor's Analysis & Output for UCM:**
        *   **Stored:** "User has seen Annie Hall [context: general]", "User loved Annie Hall [context: general]".
        *   **Filtered Out/Ignored:** Specific details about Annie Hall's dialogue style (general film knowledge, not user-specific), Wooster's suggestion for Scene 5 (project-specific creative suggestion). The user's thought process ("thinking about dialogue for this scene") is generally conversational state, not necessarily a persistent fact about the user for UCM unless frequently repeated as a general interest.
    *   **Outcome:** UCM learns the user's film preference without being cluttered by the screenplay's content or general film analysis.

*   **Example 2: Stating a writing preference while the "Romantic Comedy Screenplay" project is open.**
    *   **User Interaction:** "For this romantic comedy, I don't ever want to use first-person narration."
    *   **User Knowledge Extractor's Analysis & Output for UCM:**
        *   **Stored:** "User preference: avoid first-person narration [context: project 'RomanticComedyScreenplay']".
        *   The extractor might also infer a weaker, general preference if the statement were less qualified, but the explicit link to the project is key for contextual accuracy.
    *   **Outcome:** UCM stores this preference and correctly attributes it to the specific context of writing a romantic comedy screenplay.

## Utilizing Contextual User Knowledge from UCM

When the assistant needs to access information *about the user* (e.g., to tailor a suggestion, recall a preference when a new task is initiated, or personalize responses):

1.  It would query the UCM system.
2.  The query to UCM could be augmented with the *current project context* (if a project is loaded). For instance: "What are the user's known writing style preferences relevant to the 'Romantic Comedy Screenplay' project, or any general writing preferences?"
3.  UCM would retrieve facts, prioritizing those that match the current project context. It would also provide general preferences if no project-specific ones are found, or if the query is broad and not tied to a specific project.

## Challenges and Considerations:

*   **Sophisticated Prompt Engineering:** The effectiveness of the User Knowledge Extractor hinges on carefully designed and robust prompts that can accurately guide the LLM in its extraction and filtering tasks.
*   **Managing Ambiguity:** LLMs can misinterpret nuances or context. The system might require mechanisms for the user to review, confirm, or correct what UCM has "learned" about them.
*   **Performance Overhead:** Introducing an additional LLM call for the User Knowledge Extractor after each conversational turn will add to processing latency and potentially API costs.
*   **Evolution and Staleness of Preferences:** User preferences and facts can change over time. UCM would need a strategy for updating, versioning, or allowing the decay of older, potentially outdated information.
*   **Determining Granularity:** Decisions would be needed on the appropriate level of detail for stored facts (e.g., "User likes movies" vs. "User likes Woody Allen's 1977 film, Annie Hall").
*   **Privacy and Control:** Users should have transparency and control over the information stored in their UCM profile.

This dual-RAG architecture, featuring a dedicated User Knowledge Extractor, offers a pathway to a more personalized and contextually aware assistant. While more complex to implement than a single RAG system, it provides a cleaner separation of concerns between project-specific knowledge and enduring user-specific knowledge.

## Privacy Considerations & Non-Local LLMs

**IMPORTANT: Data Privacy with Cloud-Based LLMs**

The User Knowledge Extractor, a core part of the UCM, analyzes conversation snippets (user input and Wooster's responses) to identify and learn facts about you.

*   **If the LLM used for this extraction process is a cloud-based service (e.g., OpenAI API, Anthropic API):** Be aware that these conversation snippets, which may contain personal and sensitive information, will be sent to and processed by that third-party LLM provider.
*   **Data Handling by Third Parties:** You should review the data usage and privacy policies of the specific LLM provider to understand how your data is handled, stored, and used by them.
*   **Consideration for Local LLMs:** If, in the future, a sufficiently capable and efficient local LLM is used for the User Knowledge Extractor component, the privacy risk associated with sending conversational data to a third party for this specific extraction step would be significantly mitigated, as the data would remain on your machine.

**Recommendation:**
*   Before enabling or widely using the UCM feature with a cloud-based LLM for extraction, ensure you understand these privacy implications.
*   Ideally, when implemented, Wooster should provide a clear, one-time notification or require explicit user opt-in before the UCM system begins learning and storing information when using a cloud-based extractor LLM.

## Current System State Relative to UCM Implementation

Wooster's current architecture already possesses several components that would be foundational or reusable for implementing a UCM system:

*   **Vector Store Management (`src/memoryVector.ts`, `src/projectIngestor.ts`):**
    *   Experience with `FaissStore` for creating, saving, and loading vector stores.
    *   Use of `HuggingFaceTransformersEmbeddings` (`Xenova/all-MiniLM-L6-v2`) for local text embedding. This same model can be used for consistency in the UCM.
    *   The concept of a `DEFAULT_VECTOR_STORE_PATH` in `memoryVector.ts` could be adapted or mirrored for a `USER_PROFILE_VECTOR_STORE_PATH`.
    *   The existing `initVectorStore` could serve as a template for an `initUserContextStore` function.
*   **LLM Integration (`src/index.ts`, `src/agent.ts`):**
    *   Established use of `ChatOpenAI` (LangChain's OpenAI wrapper). This LLM would be used for the "User Knowledge Extractor" component.
    *   The `agentRespond` function in `src/agent.ts` and the main REPL loop in `src/index.ts` provide points where the User Knowledge Extractor could be invoked after each conversational turn.
*   **Modular Structure:** The codebase is already organized into modules (e.g., for memory, agent logic, project ingestion), making it easier to introduce new modules for UCM and the User Knowledge Extractor.
*   **Configuration (`projects.json`, `.env`):** While not directly for user profiles, the system is accustomed to external configuration, which could be extended if UCM requires specific settings.

**What's Missing / Needs to be Built:**

*   **User Knowledge Extractor Module:** A new TypeScript module (e.g., `src/userKnowledgeExtractor.ts`) containing the LLM prompting logic to analyze conversations and extract user-specific facts with context. This module forms the heart of the UCM's learning capability.
*   **UCM Vector Store Initialization & Management:** Specific logic to create, load, and save the `user_context_store/` (likely in `src/memoryVector.ts` or a new dedicated file, e.g., `src/userContextMemory.ts`).
*   **Integration into REPL/Agent Flow (Learning Aspect):** Code in `src/index.ts` (REPL loop) to call the User Knowledge Extractor after each relevant conversational turn and add extracted information to the UCM store. This is a core system process.
*   **UCM Query Mechanism (Recall Aspect - via Agent Tool):**
    *   The primary way the agent will access UCM is through a dedicated **agent tool**. This allows the agent to make an intentional decision to query for user-specific information when it deems it relevant for personalizing its response or action.
    *   **Tool Name Example:** `recall_user_context`
    *   **Tool Description (critical for agent usage):** A detailed description guiding the agent on *when* and *why* to use the tool (e.g., "Use this tool to retrieve stored preferences, facts, or directives previously stated by the user that could be relevant for personalizing the current response or action. Consider using this BEFORE generating content, making a suggestion, or performing an action where knowing a specific user preference could lead to a more tailored outcome. Only query for information directly relevant to the task at hand.")
    *   **Tool Arguments:** Likely a single `topic: string` argument, described to guide the agent in formulating a concise query for the needed information (e.g., "email formality preferences", "preferred project update frequency").
    *   This tool would be added to `availableTools` in `src/agent.ts`. Its function would query the UCM vector store and return the retrieved facts.
    *   *(Passive context enhancement, e.g., via MultiRetriever in the main RAG, could be a secondary, more advanced option but the explicit tool is the primary design for active recall).*
*   **Metadata Handling:** A clear way to pass metadata (like `currentProjectName` and whether ProjectRAG was used) to the User Knowledge Extractor.
*   **(Optional) UCM Management Plugin:** A separate plugin could be developed to offer user-facing REPL commands for managing their UCM data (e.g., `list_my_learned_facts`, `forget_ucm_fact <id>`).

## Simplest Path to Initial UCM Setup (Proof of Concept for Learning & Tool-Based Recall)

To implement a basic version of UCM, focusing on the core learning loop and a conceptual agent tool for recall:

1.  **Create `userKnowledgeExtractor.ts`:**
    *   Define a function, e.g., `extractUserKnowledge(userInput: string, assistantResponse: string, currentProjectName: string | null): Promise<string | null>`.
    *   This function will use an LLM (e.g., `ChatOpenAI`).
    *   **Simple Prompt Strategy:** Start with a basic prompt for the LLM:
        ```
        Analyze the following conversation turn:
        User: "${userInput}"
        Assistant: "${assistantResponse}"
        Current Project Context: ${currentProjectName || 'None'}

        Based ONLY on the USER'S statement, identify one single, concise fact or preference explicitly stated by the user about themselves.
        If the fact seems tied to the Current Project Context, prefix it with "[Project: ${currentProjectName}] ".
        If no clear user-specific fact or preference is stated by the user, output "null".
        Examples:
        - "User likes coffee."
        - "[Project: Screenwriting] User prefers short scenes."
        Output only the fact string or "null".
        ```
    *   This initial prompt is very basic and will need refinement, but it's a starting point.

2.  **Modify `src/memoryVector.ts` (or create `src/userContextMemory.ts`):**
    *   Add a new function `initUserContextStore(): Promise<FaissStore>`, similar to `initVectorStore`, but using a different path (e.g., `vector_data/user_context_store/`).
    *   Add a function `addUserFactToContextStore(fact: string, store: FaissStore): Promise<void>`. This will embed the fact and add it to the UCM store. Re-use `HuggingFaceTransformersEmbeddings`.

3.  **Integrate into `src/index.ts` (Core Learning Process):**
    *   **Initialization:**
        *   Declare `let userContextStore: FaissStore;`
        *   In `main()`, call `userContextStore = await initUserContextStore();`
    *   **After each conversational turn (in the `rl.on('line', ...)` callback, after Wooster's response is generated and before the next prompt):**
        *   Call `const userFact = await extractUserKnowledge(input, response, currentProjectName);` (where `input` is user's line, `response` is Wooster's answer).
        *   If `userFact` is not null and not empty:
            *   `await addUserFactToContextStore(userFact, userContextStore);`
            *   `await userContextStore.save('path/to/user_context_store/');` (Save after each addition for simplicity in PoC).
            *   Optionally, log that a fact was learned: `console.log('[UCM Learned]:', userFact);`

4.  **Define the `recall_user_context` Agent Tool (Conceptual for PoC):**
    *   **Tool Definition (in `src/tools/userContextTool.ts` or similar):**
        ```typescript
        // import { FaissStore } from '@langchain/community/vectorstores/faiss';
        // import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers';
        // Assume userContextStore and embeddings are accessible here or passed in

        async function recallUserContextFunc(args: { topic: string }): Promise<string> {
          // const userContextStore = getUserContextStore(); // Placeholder for store access
          // const embeddings = getEmbeddingsModel(); // Placeholder for embeddings access
          if (!userContextStore || !embeddings) return "UCM store not available.";

          const { topic } = args;
          const results = await userContextStore.similaritySearch(topic, 2); // Retrieve top 2 relevant facts
          if (results.length === 0) {
            return "No specific preferences or context found for that topic.";
          }
          return results.map(doc => doc.pageContent).join('\n');
        }
        ```
    *   **Add to `availableTools` (in `src/agent.ts`):**
        ```typescript
        // import { DynamicTool } from "langchain/tools"; // Or your tool definition class
        // import { z } from "zod";

        // ... other tools ...
        new DynamicTool({
          name: "recall_user_context",
          description: "Use this tool to retrieve stored preferences, facts, or directives previously stated by the user that could be relevant for personalizing the current response or action. Query with a concise topic, e.g., 'email formality preferences'.",
          func: recallUserContextFunc, // The function defined above
          // schema: z.object({
          //   topic: z.string().describe("A concise phrase describing the specific user preference or context needed.")
          // })
        }),
        ```
    *   **Testing:** The agent should now theoretically be able to decide to use this tool. You'd prompt Wooster with tasks where recalling user preferences would be beneficial and observe if the agent attempts to use `recall_user_context`.

**This "simplest path" PoC focuses on:**

*   Setting up the UCM learning cycle.
*   Defining the agent tool for UCM recall so the agent *can* use it.
*   Actual effective use by the agent will heavily depend on the quality of the tool's description and potentially further agent prompt engineering.

It deliberately skips for the initial PoC:

*   Full integration of UCM context into the main RAG chain for passive awareness.
*   Highly sophisticated prompt engineering for the User Knowledge Extractor or the main agent to perfectly balance tool use.
*   A UI/Plugin for direct user management of UCM facts.
*   Strategies for updating/forgetting facts over time.

This approach allows for iterative development: first, get the learning and the tool mechanism in place, then refine the agent's usage of it.

## Enabling/Disabling UCM

UCM can be enabled or disabled globally via settings in your `.env` file, located in the project root. By default, UCM is **disabled** based on the `DEFAULT_CONFIG` in `src/configLoader.ts` if the specific environment variable is not set.

To control UCM, set the following environment variable in your `.env` file:

```env
# .env example for UCM
UCM_ENABLED=false # Set to true to enable UCM
```

If `UCM_ENABLED` is set to `false` (or if the variable is omitted and the default is `false`):
- No user knowledge will be extracted or saved by the UCM system.
- If the `recall_user_context` tool is invoked, it should ideally inform the agent that UCM is disabled or simply return no information.

## Customizing the Extractor Prompt

The prompt used by the `UserKnowledgeExtractor` to instruct the LLM on what kind of information to extract can be customized via an environment variable in your `.env` file.

Set the following variable:

```env
# .env example for custom UCM prompt
UCM_EXTRACTOR_LLM_PROMPT="From the user's last message ({userInput}) and my response ({assistantResponse}) in the context of project '{currentProjectName}', identify any explicit statements of preference or personal facts the user has shared. List them clearly."
```

- If `UCM_EXTRACTOR_LLM_PROMPT` is not set in your `.env` file, is an empty string, or is omitted, a system default prompt (defined within `src/userKnowledgeExtractor.ts`) will be used.
- If you provide a custom prompt string, it will be used instead. Ensure your custom prompt clearly instructs the LLM on its task. You can use placeholders like `{userInput}`, `{assistantResponse}`, and `{currentProjectName}` in your custom prompt string; these will be replaced with the actual values from the conversation by the `UserKnowledgeExtractor` module.
