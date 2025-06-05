# User Profile Plugin (userProfile)

**Version:** 1.0.5

## Overview

The User Profile plugin enables Wooster to store and recall specific facts, preferences, and pieces of information about the user. This allows for a more personalized and context-aware interaction over time.

The plugin utilizes a dedicated vector store (FaissStore) to save user-specific data, separate from project-specific knowledge. It provides tools for the agent to explicitly save new information to this profile or recall existing information based on a topic.

Internally, a `UserProfileService` manages all interactions with the vector store, ensuring that data is handled consistently.

## Core Functionality

### Data Storage

-   **Method:** User-specific facts and preferences are converted into text embeddings and stored in a [FaissStore](https://github.com/facebookresearch/faiss) vector database.
-   **Location:** The directory for this vector store is configurable (see [Configuration](#configuration) below).
    -   Default Path: `<workspace_root>/vector_data/user_profile_store/`
-   **Files:** Within the configured `storePath`, the plugin creates and manages files such as `faiss.index` (the vector index) and `docstore.json` (the raw text of stored facts).
-   **Format:** When information is saved (e.g., using the `save_user_profile` tool), it's typically stored as a combined string, like "Category: Value" (e.g., "email address: user@example.com").

### Service Layer

-   All operations related to the user profile vector store (initialization, adding facts, retrieving context) are managed by the `UserProfileService`. This service is used internally by the plugin's tools.

## Provided Agent Tools

The User Profile plugin provides the following `StructuredTool`(s) to the agent:

### 1. `save_user_profile`

-   **Type:** `StructuredTool`
-   **Description:** Saves or updates a new piece of information, preference, or fact about the user to their profile. The agent should provide a category for the fact and the fact's value.
-   **Schema/Arguments:**
    -   `fact_category: string`: The category or type of the fact being saved (e.g., "email address", "preferred city", "favorite programming language").
    -   `fact_value: string`: The actual piece of information or preference to save (e.g., "lonhig@gmail.com", "New York", "TypeScript").
-   **How it works:** The tool combines the `fact_category` and `fact_value` into a single string (e.g., "email address: lonhig@gmail.com"). This string is then embedded and stored in the user profile vector store. If a similar fact already exists, this may effectively update it due to how vector similarity works, though it's primarily an "add" operation.
-   **Example Agent Usage (Conceptual):**
    *User: "Please remember my favorite color is blue."*
    *Agent might call `save_user_profile` with:*
    `{ "fact_category": "favorite color", "fact_value": "blue" }`

### 2. `recall_user_profile`

-   **Type:** `StructuredTool`
-   **Description:** Recalls stored user profile information, preferences, or facts based on a specific topic.
-   **Schema/Arguments:**
    -   `topic: string`: The topic or subject to recall information about from the user profile (e.g., "email address", "user's coffee preference", "contact details").
-   **How it works:** The tool takes the `topic`, embeds it, and performs a similarity search against the facts stored in the user profile vector store. It returns the most relevant stored facts.
-   **Example Agent Usage (Conceptual):**
    *User: "What's my email address you have on file?"*
    *Agent might call `recall_user_profile` with:*
    `{ "topic": "email address" }`
    *The tool would then return relevant stored information like "email address: lonhig@gmail.com".*

## Configuration

To use the User Profile plugin, it needs to be enabled in your application configuration (`config.json` or equivalent, managed by `configLoader.ts`).

1.  **Enable the Plugin Globally:**
    Ensure the plugin is listed and set to `true` in the main `plugins` section of your `AppConfig`:
    ```json
    {
      "plugins": {
        "userProfile": true,
        // ... other plugins
      }
    }
    ```

2.  **Enable the User Profile Feature:**
    The `userProfile` configuration block must also have `enabled` set to `true`:
    ```json
    {
      "userProfile": {
        "enabled": true,
        "storePath": "/custom/path/to/user_profile_data/" // Optional
      }
      // ... other configurations
    }
    ```

### Configuration Options for `userProfile`

The following options are available within the `userProfile` block of your `AppConfig`:

-   `enabled: boolean`
    -   **Description:** Master toggle for all User Profile plugin functionalities. If `false`, the plugin will not initialize its store or provide tools to the agent.
    -   **Default:** `false` (as per `DEFAULT_CONFIG` in `configLoader.ts`)
    -   **Environment Variable:** `USER_PROFILE_ENABLED` (e.g., `USER_PROFILE_ENABLED=true`)

-   `storePath?: string` (Optional)
    -   **Description:** Specifies the directory path where the FaissStore vector database files (e.g., `faiss.index`, `docstore.json`) for the user profile will be stored.
    -   **Default:** If not specified, defaults to `<workspace_root>/vector_data/user_profile_store/`.
    -   **Environment Variable:** `USER_PROFILE_STORE_PATH` (e.g., `USER_PROFILE_STORE_PATH="./my_data/user_profile_db"`)

## Dependencies

-   Utilizes the core logging service provided by Wooster for internal logging.
-   The `UserProfileService` is registered with `CoreServices` during plugin initialization, making it potentially available for other plugins or advanced use cases (this is primarily an internal detail).

## Notes

-   The effectiveness of the `recall_user_profile` tool depends on how well the provided `topic` matches the stored facts.
-   While this plugin provides tools for explicit saving, the agent's intelligence determines when and how to use them to "learn" about the user.
-   Consider the privacy implications of the information being stored, especially if your Wooster instance interacts with cloud-based LLMs for its primary reasoning.
