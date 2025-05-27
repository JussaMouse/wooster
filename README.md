# Wooster: Personal Digital Assistant

Wooster is an AI assistant designed to be extended and customized. He leverages large language models and a suite of tools to help with various tasks, from answering questions to managing your information and schedule.

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
    This will primarily show the LLM's responses. Interactions are logged to files as configured in `.env` (e.g., `logs/wooster_session.log`).


## Core Design

*   **AI Agent**: The intelligent core, built using Langchain.js. He is LLM-powered and designed to be model-agnostic (configurable via `.env`), responsible for interpreting user requests, managing conversations, and strategically utilizing available tools or its own knowledge base to formulate responses.
*   **Extensible Tooling & Plugin System**: Wooster's capabilities are expanded through a dynamic set of tools that the agent can use. A plugin architecture (`src/plugins/`) allows for easy addition of new functionalities and integrations with external services.
*   **Node.js & TypeScript Foundation**: The application is built on a modern Node.js runtime with TypeScript, ensuring a robust and maintainable codebase. 


## System Design and Capabilities

### Interface:
Wooster is meant to be interacted with in the terminal.

### Projects:
In Wooster you manage Projects, which are knowledge work environments with their own reference materials, notes, and histories.

- There is always exactly one Project open in Wooster. 
- The default Project is called Home 
    - Like any project you create with Wooster, it lives in a directory called `projects`. 
- The project directory (`projects/my_project/`) is where you can add PDFs and other documents to feed to wooster. 
- Wooster automatically creates `projects/my_project/my_project.md` which is meant to be periodically updated as a sort of long term record of your project.
- Wooster's "memory" (RAG) is specific to the current Project. 

### User Profile:
Besides the Project RAG, Wooster has a separate "memory" (RAG) trained on user behavior.
- User Profile defaults to Off. (Don't turn it on with an openai model unless you want to share personal data with it!)
- Wooster attempts to use the User Profile to learn about you so as to be more helpful. When set to On, it is active in all interactions.

### Tools:
Tools are functions for Wooster to use himself.
- Wooster is designed to call on any currently enabled Tools at will.
- He is designed to follow multi-step chains tool use in pursuit of a goal.
- Tools are grouped into Plugins.
- Community-made Tools are encouraged; Wooster is meant to be extensible.

### Adding new Tools
- To add your own Tool to Wooster, put the function in a `myTool.ts` file and add it to `tools`.
- Write a `plugins/myPlugin.ts` to control myTool and any other associated tools.
- example: 
```
docs/plugins/myEmail.md
docs/tools/mySendEmail.md
docs/tools/mySaveDraft.md
docs/tools/mySendAttachment.md
plugins/myEmail.ts
tools/mySendEmail.ts
tools/mySaveDraft.ts
tools/mySendAttachment.ts
```
- Always use `.env` for any settings for your Plugin or Tools


### Built-in Tools:
*note: Tool settings and on/off are located in `.env`*
*   **Web Search**: Utilizes Tavily Search API for up-to-date information from the internet.
*   **Task Scheduling**: Schedule tasks for Wooster to perform at a later time (e.g., "remind me tomorrow at 10 am to...").
*   **Email Sending**: Send emails on your behalf via Gmail.
*   **Google Calendar Integration**: Create, list, and organize calendar events.

### Config:

*   **Use `.env`**: API keys, Tool settings, logging, and other options all live in `.env`. 

*⚠️ Make sure `.env` is in your `.gitignore` so that you don't accidentally share this sensitive data!*

### Logging:

*   Set log level in `.env`
*   Available services:
    *   Console logging.
    *   Log to `logs/wooster_session.log`.
    *   Log conversation to `chat.history` in the current project folder.
