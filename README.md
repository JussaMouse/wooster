# Wooster: Personal Digital Assistant

Wooster is an AI assistant designed to be extended and customized. It leverages large language models and a suite of tools to help with various tasks, from answering questions to managing your information and schedule.

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
    Open `.env` and configure the following **essential** variables:
    *   `OPENAI_API_KEY`: Your OpenAI API key for accessing LLMs.
    *   `GMAIL_SENDER_EMAIL_ADDRESS` (for Email Tool): The Gmail address Wooster will send emails from.
    *   `GMAIL_APP_PASSWORD` (for Email Tool): An App Password for the Gmail account above. [How to generate App Passwords](https://support.google.com/accounts/answer/185833).

    Other services like Tavily for web search or Google Calendar might require additional API keys or configuration in `.env` if you enable their respective tools. Refer to `.env.example` for a full list of configurable variables.

4.  **Run Wooster:**
    ```bash
    pnpm dev
    ```
    This will start Wooster, and interactions will be logged to `wooster_session.log`.

## System Design and Capabilities

Wooster is built with Node.js and TypeScript, utilizing the Langchain.js framework for its core AI agent logic.

**Core Components:**

*   **Agent**: An OpenAI Functions agent orchestrates tasks, decides when to use tools, and formulates responses.
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
