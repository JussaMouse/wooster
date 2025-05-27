# Wooster: Personal Digital Assistant

Wooster is an AI assistant designed to be extended and customized. It leverages large language models and a suite of tools to help with various tasks, from answering questions to managing your information and schedule.

⚠️ This software is experimental and has no guarantee of working or being maintained.

⚠️ This software will share data about you with whichever LLM you attach to it. Use a local LLM if you care about your privacy.


## Installation and Configuration

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/JussaMouse/wooster.git
    cd wooster
    ```

2.  **Install dependencies:**
    Wooster uses `pnpm` for package management.
    ```bash
    pnpm install
    ```

3.  **Set up environment variables:**
    Copy the example environment file and fill in the necessary values:
    ```bash
    cp .env.example .env
    ```
    Open `.env` and configure the **essential** variables. Refer to `.env.example` for a full list of configurable variables and their purposes, including API keys and tool settings.

4.  **Customize System Prompt (Optional):**
    *   The base system prompt is loaded from `prompts/base_system_prompt.txt`.
    *   To add custom instructions or tailor Wooster's persona, create additional `.txt` files in the `prompts/` directory (e.g., `prompts/my_custom_instructions.txt`).
    *   The content of these additional `.txt` files will be appended to the base prompt in alphabetical order by filename.

5.  **Run Wooster:**
    For general use, start Wooster in a quieter mode:
    ```bash
    pnpm start
    ```
    This will primarily show the LLM's responses. Interactions are logged to files as configured in `.env` (e.g., `logs/wooster_session.log`).

    For development or debugging with more verbose console output:
    ```bash
    pnpm dev
    ```

## System Design and Capabilities

Wooster is built with Node.js and TypeScript, utilizing the Langchain.js framework for its core AI agent logic.

**Core Components:**

*   **Agent**: An OpenAI Functions agent orchestrates tasks, decides when to use tools, and formulates responses. Its core behavior can be customized (see System Prompt customization in the Configuration section).
*   **LLM**: Powered by OpenAI models (configurable, e.g., GPT-4o, GPT-3.5-turbo).
*   **Chat History**: Maintains conversation context for more coherent interactions.

**Key Capabilities (Tools):**

Wooster comes with a set of built-in tools. Some may require specific environment variable settings (see `.env.example` for details on enabling/disabling and configuring tools).

*   **Web Search**: Utilizes Tavily Search API (`TAVILY_API_KEY` in `.env`) for up-to-date information from the internet.
*   **Task Scheduling**: Allows you to schedule tasks for Wooster to perform at a later time (e.g., "remind me tomorrow at 10 am to..."). Uses `node-schedule`.
*   **Email Sending**: Can send emails on your behalf via Gmail. Requires `GMAIL_SENDER_EMAIL_ADDRESS` and `GMAIL_APP_PASSWORD` in `.env`.
*   **Google Calendar Integration**: (If configured in `.env`)
    *   Can create and list calendar events.
    *   Requires Google Cloud credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in `.env`) and an OAuth2 token (`token.json` generated after initial authorization). The `GOOGLE_CALENDAR_CREDENTIALS_PATH` and `GOOGLE_CALENDAR_TOKEN_PATH` in `.env` point to these files.
*   **Project Knowledge Base**:
    *   Wooster can ingest documents from specific project directories defined in `projects.json` (located in the workspace root, e.g., `[{"name": "MyProject", "path": "./projects/my_project_docs"}]`).
    *   It creates a FAISS vector store for each project, allowing you to query information specific to that project's documents. Vector stores are saved in `vector_data/`.
*   **User Context Memory**:
    *   Remembers user-specific facts, preferences, and context across conversations.
    *   Stored in a FAISS vector store (`vector_data/user_context_store`).

**Plugin System:**

*   Wooster supports a plugin system allowing developers to easily add new tools and capabilities. Plugins are located in `src/plugins/`.

**Configuration:**

*   **Environment Variables (`.env`)**: For API keys, tool settings, logging, and other options.

**Logging:**

*   Set log level in `.env`
*   Available services:
    *   Console logging
    *   Log to `logs/wooster_session.log`
    *   Log to `chat.history` in any project folder
