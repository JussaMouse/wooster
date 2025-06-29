# User Profile Plugin (userProfile)

**Version:** 1.0.5

## Overview

The User Profile plugin is a core component of Wooster, designed to give the agent a persistent, long-term memory about the user's preferences, facts, and specific instructions.

## How It Works

The plugin utilizes a dedicated `MemoryVectorStore` to save user-specific data, separate from project-specific knowledge. It provides tools for the agent to explicitly save new information to this profile or recall existing information based on conversational context.

### The Storage Mechanism: `user_profile_vector_store.json`

To ensure data is safe, simple to manage, and not dependent on complex compiled libraries, the User Profile is stored in a single JSON file.

- **Method:** User-specific facts and preferences are stored as text. On startup, this text is loaded and converted into vector embeddings using the configured model, then held in an in-memory `MemoryVectorStore` for fast searching.
- **Persistence:** When new facts are added, the entire profile is written back to disk to a file named `user_profile_vector_store.json`.
- **Location:** This file is located in the directory specified by the `userProfile.storePath` setting in your configuration (e.g., `.user_profile/`).

### Robust Backup System

To prevent data loss from application crashes or bugs, a multi-layered backup system is in place for the `user_profile_vector_store.json` file:

1.  **Sanity Check:** Before saving, the system checks if the new data to be saved is smaller than the existing file. If it is, the save is aborted to prevent accidental data erasure.
2.  **Atomic Writes:** A temporary file is used during the save process, ensuring that the main `.json` file is never corrupted if the application crashes mid-write. A `.bak` file of the last known-good version is always kept.
3.  **Dated Generational Backups:** The system automatically keeps up to 3 weekly backups (e.g., `user_profile_vector_store.2025-07-04.bak`). A new weekly backup is only created if the last one is more than 7 days old, protecting your long-term history.

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
    -   **Description:** Specifies the directory path where the vector database files for the user profile will be stored.
    -   **Default:** `./vector_data/user_profile_store`
    -   **Importance:** This path is critical for data persistence. Ensure the application has read/write permissions to this directory.
    -   **Environment Variable:** `USER_PROFILE_STORE_PATH` (e.g., `USER_PROFILE_STORE_PATH="./my_data/user_profile_db"`)

## Dependencies

-   Utilizes the core logging service provided by Wooster for internal logging.
-   The `UserProfileService` is registered with `CoreServices` during plugin initialization, making it potentially available for other plugins or advanced use cases (this is primarily an internal detail).

## Notes

-   The effectiveness of the `recall_user_profile` tool depends on how well the provided `topic` matches the stored facts.
-   While this plugin provides tools for explicit saving, the agent's intelligence determines when and how to use them to "learn" about the user.
-   Consider the privacy implications of the information being stored, especially if your Wooster instance interacts with cloud-based LLMs for its primary reasoning.
