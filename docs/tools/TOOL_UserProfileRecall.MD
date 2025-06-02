# Agent Tool: `recall_user_profile`

**Purpose:** This tool allows the Wooster agent to access and retrieve information from the User Profile system. The User Profile system stores learned facts, preferences, and other information specific to the user, gathered over time from conversations.

**Tool Name (for agent):** `recall_user_profile`

**Function in Code:** `recallUserProfileFunc` (located in `src/tools/userProfileTool.ts`)

**Vector Store Path:** `vector_data/user_profile_store/` (managed by `src/memoryVector.ts` via `initUserProfileStore`)

## Description (Provided to Agent):

"Recalls specific facts, preferences, or profile data about the current user to personalize responses or remember user-specific information. Input should be a question or topic to recall (e.g., 'my favorite color', 'what did I say about project X')."

## Input to Tool (from Agent):

*   **Type:** JSON object string
*   **Schema:**
    ```json
    {
      "type": "object",
      "properties": {
        "topic": {
          "type": "string",
          "description": "The topic, question, or specific piece of information to recall about the user. Be specific for better results."
        }
      },
      "required": ["topic"]
    }
    ```
*   **Example (stringified JSON input for the tool function via AgentExecutor):**
    `"{\"topic\": \"my preferences for project planning\"}"`

## Output from Tool (to Agent):

*   **Type:** String
*   **Content:**
    *   If relevant facts are found in the User Profile store, the tool returns a string containing these facts, often as a bulleted list or a concise summary.
    *   Example: "- User prefers visual aids for project planning.\n- User mentioned using mind maps for brainstorming."
    *   If no relevant information is found for the given topic, it returns a message like: "No specific information found in your profile regarding [topic]."
    *   If the User Profile system is disabled (via `USER_PROFILE_ENABLED=false` in `.env`), it should return a message indicating this, e.g., "User Profile system is currently disabled."

## How the Agent Uses This Tool:

The agent decides to use this tool when it believes that recalling specific information *about the user* (not about the project's content) would be beneficial for the current task. This could be to:
*   Personalize a response.
*   Remember a previously stated preference.
*   Avoid asking the user for information they might have already provided.
*   Tailor suggestions based on known user characteristics.

**Example Agent Thought Process (Conceptual):**

*User asks: "Can you help me draft an outline for my new novel?"*

*Agent thinks:* "The user is asking for help with a novel outline. I should check if I know anything about their writing preferences or past novel projects. I will use `recall_user_profile` with the topic 'novel writing preferences' or 'past novel projects' to see if there's relevant information in their User Profile."

*Agent calls `recall_user_profile` with `{"topic": "user's novel writing preferences"}`.*

## Configuration & Dependencies:

*   **User Profile System:** This tool relies entirely on the User Profile system being active and populated.
    *   Enabling/Disabling: Controlled by `USER_PROFILE_ENABLED` in the `.env` file.
    *   Vector Store: Populated by the `UserKnowledgeExtractor` (see `src/userKnowledgeExtractor.ts`) and stored at `vector_data/user_profile_store/`.
    *   Initialization: `initUserProfileStore` in `src/memoryVector.ts`.
*   **LLM for Extraction:** The User Profile is populated by an LLM. Its prompt can be configured via `USER_PROFILE_EXTRACTOR_LLM_PROMPT` in `.env`.

## Notes & Best Practices for the Agent:

*   **Specificity of Query:** The more specific the `topic` provided by the agent, the more relevant the results are likely to be. Broad queries like "user information" might be less helpful than "user's preferred communication style."
*   **Distinction from Project Knowledge:** The agent should understand that this tool is for *user-specific* information, distinct from the project-specific knowledge retrieved by tools like `queryKnowledgeBase`.
*   **Handling "No Information Found":** If the tool returns that no information was found, the agent should proceed gracefully, perhaps by asking the user the relevant question directly if appropriate.
*   **Respecting Privacy:** While the tool retrieves learned information, the agent should use this information thoughtfully and avoid making assumptions or over-personalizing in a way that feels intrusive. 