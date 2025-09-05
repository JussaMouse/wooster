# Wooster: Personal Digital Assistant

Wooster is an AI assistant designed to be extended and customized. He uses LLMs and a suite of tools to help with various tasks, from answering questions to managing your information and schedule. Wooster now emphasizes a **local-first, Markdown-driven philosophy** for core productivity tasks, allowing you to own and easily manage your data. For a detailed guide on these productivity systems, please see [Wooster for Personal Productivity: A Markdown-Driven Approach](docs/productivity_guide.md).

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
    Open `.env` and configure the variables. While `OPENAI_API_KEY` is essential for core LLM functionality, for a full-featured experience (including email and web search capabilities), ensure the following are also set:
    *   `OPENAI_API_KEY`: Your OpenAI API key.
    *   `TOOLS_EMAIL_SENDER_EMAIL_ADDRESS`: The Gmail address Wooster will send emails from.
    *   `GMAIL_APP_PASSWORD`: An App Password for the Gmail account specified in `TOOLS_EMAIL_SENDER_EMAIL_ADDRESS`. [How to generate App Passwords](https://support.google.com/accounts/answer/185833).
    *   `TOOLS_EMAIL_USER_PERSONAL_EMAIL_ADDRESS`: (Optional, but recommended for email features) Your personal email address, used if you ask Wooster to email "yourself".
    *   `TAVILY_API_KEY`: Your API key for Tavily AI to enable web search.
    Refer to `.env.example` for a comprehensive list of all configurable variables and their purposes.

4.  **Run Wooster:**
    ```bash
    pnpm start
    ```
    This will open the REPL (`>` prompt).

### Modes: Classic Tools vs Code-Agent

Wooster now supports two agent execution modes:
- `classic_tools` (default): LangChain Tools Agent with function-calling.
- `code_agent`: The model emits a single JavaScript code block which runs in a secure sandbox with a minimal Tool API.

Configure the default in `config/default.json` or via environment:
```bash
CHAT_MODE=code_agent # or classic_tools
CODE_AGENT_MAX_ATTEMPTS=2
CODE_AGENT_STEP_TIMEOUT_MS=20000
CODE_AGENT_TOTAL_TIMEOUT_MS=60000
CODE_AGENT_MEMORY_LIMIT_MB=128
CODE_AGENT_MAX_OUTPUT_LENGTH=10000
```

You can also toggle at runtime in the REPL:
```text
> mode code   # switch to code-agent
> mode tools  # switch back to classic tools
```

For debugging code-agent runs:
```bash
CODE_AGENT_DEBUG=1 pnpm start
```

See the new [Agent Guide](docs/agent-guide.md) for a practical, end-to-end walkthrough.


## Core Design

*   **AI Agent**: The intelligent core, built using Langchain.js. The agent is LLM-powered and designed to be model-agnostic. It is responsible for interpreting user requests, executing tool calls, searching its memory, and formulating responses. The agent may chain tool calls together in order to complete a task.
*   **Separation of Activities**: Activity is organized into knowledge work environments called projects. Projects are zones for deep work where you can share files and collaborate on research with Wooster.
*   **Markdown-First Data**: Wooster prioritizes storing key personal data (notes, tasks, health logs) in human-readable Markdown files within your local workspace. This ensures data longevity, easy backups, and interoperability. This is the source of truth that Wooster needs to optimize his capacity for assistance.
*   **API-Driven Functionality**: Core features are exposed via a local API, enabling programmatic access and integration with external tools, scripts, and custom workflows (e.g., mobile shortcuts).
*   **Extensible Tooling & Plugin System**: Wooster's capabilities are expanded through a dynamic set of Tools and a [plugin architecture](./docs/pluginManager.md) (`src/plugins/`). This allows for easy addition of new functionalities, including those that interact with local files and external services.


## System Design and Capabilities

### Interface:
Wooster is meant to be interacted with in the terminal.

### Projects:
In Wooster you manage Projects, which are knowledge work environments with their own reference materials, notes, and histories.

- There is always exactly one Project active in Wooster.
- The default Project is called Home.
    - Like any project you create with Wooster, it lives in a directory called `projects`.
- The Project Directory (`projects/my_project/`) is where you can add PDFs and other documents to feed to wooster.
- Wooster automatically creates `projects/my_project/my_project.md` which is meant to be an ongoing Project Journal.
- Wooster automatically loads the file `projects/my_project/prompt.txt` if it exists. This text will be appended to the system prompt when the Project is active.
- Wooster has Project Memory (RAG) specific to the active Project.
- Wooster has filesystem read/write capabilities. So you can, for example, save your notes to a markdown file in the Project Directory.


### User Profile:
Besides the Project RAG, Wooster has a separate "memory" (RAG) trained on user behavior.
- User Profile defaults to Off. (Don't turn it on with an openai model unless you want to share personal data with it!)
- Wooster attempts to use the User Profile to learn about you so as to be more helpful. When set to On, it is active in all interactions.

### Key Plugins & Capabilities:
Wooster offers a range of functionalities through its plugin system:

*   **Universal Capture (`capture` plugin)**: Quickly capture notes, tasks, and ideas into a central `inbox.md` file in your workspace root.
    *   Accessible via direct interaction or the `POST /api/v1/capture` API endpoint (expects `{"text": "..."}`).
*   **Inbox Processing (`sortInbox` plugin)**: Systematically review and process items from your `inbox.md`.
*   **Personal Health Logging (`personalHealth` plugin)**:
    *   Log health-related events to `health_events.log.md`.
    *   Accessible via direct interaction or the `POST /api/v1/health/events` API endpoint (expects `{"text": "..."}`).
    *   Automatically generates a daily `health.md` summary report (configurable).
*   **Daily Review (`dailyReview` plugin)**: Get a customizable daily briefing, which can include calendar events, project tasks, weather, and your previous day's health log summary.
*   **API Access (`api` plugin)**: Provides a unified API for key operations, secured by API key and/or IP whitelist.
*   **Web Search**: Utilizes Tavily Search API for up-to-date information from the internet.
*   **Email Sending**: Send emails on your behalf via Gmail (requires configuration).
*   **Google Calendar Integration (`gcal` plugin)**: Create, list, and manage calendar events (requires configuration).
*   **Extensibility**: Add new tools and plugins to `src/plugins/` to expand Wooster's capabilities.

### Adding new Tools/Plugins
- To add your own functionality, create a new plugin within the `src/plugins/` directory.
- A plugin typically consists of an `index.ts` file (defining the plugin's services and agent tools) and a `types.ts` file (for service interfaces and data structures).
- Refer to existing plugins in `src/plugins/` for examples.
- Always use `.env` for any sensitive settings or API keys for your Plugin or Tools.


### Built-in Tools:
*   **Web Search**: Utilizes Tavily Search API for up-to-date information from the internet.
*   **Task Scheduling**: Schedule tasks for Wooster to perform at a later time (e.g., "remind me tomorrow at 10 am to...").
*   **Email Sending**: Send emails on your behalf via Gmail.
*   **Google Calendar Integration**: Create, list, and organize calendar events.

Note: In `code_agent` mode, the Tool API is exposed to the sandbox. Current surface:
- `webSearch(query) -> { results: [{ title, url, snippet }] }`
- `fetchText(url) -> string`
- `queryRAG(query) -> string`
- `writeNote(text)`
- `schedule(isoTime, text)`
- `discordNotify(msg)` / `signalNotify(msg)`
- `finalAnswer(text)` (must be called once by the emitted code)

### Config:

*   **Use `.env`**: API keys, Tool settings, logging, and other options all live in `.env`. 

*⚠️ Make sure `.env` is in your `.gitignore` so that you don't accidentally share this sensitive data!*

### Logging:

*   Set log level in `.env`
*   Available services:
    *   Console logging.
    *   Log to `logs/wooster_session.log`.
    *   Log conversation to `chat.history` in the active Project Directory.
- Console and file logging under `logs/wooster_session.log`.
- Enable detailed LLM traces with `LOGGING_LOG_AGENT_LLM_INTERACTIONS=true`.
- For code-agent traces, start with `CODE_AGENT_DEBUG=1`.
