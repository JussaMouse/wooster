# Wooster: Personal Digital Assistant

Wooster is an AI assistant designed to be extended and customized. He uses LLMs and a suite of tools to help with various tasks, from answering questions to managing your information and schedule.

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
    This will primarily show the LLM's responses and Tool calls. See [Logging](#logging) for more.


## Core Design

*   **AI Agent**: The intelligent core, built using Langchain.js. The agent is LLM-powered and designed to be model-agnostic. It is responsible for interpreting user requests, executing functions via Tools, querying the Project Memory and User Profile, and formulating the response.
*   **Separation of Activities**: Activity is organized into knowledge work environments called Projects. Projects are zones for deep work. For general life assistance like managing your schedule, finances, meal prep, goals, contacts, etc., switch the active Project to Home.
*   **Extensible Tooling & Plugin System**: Wooster's capabilities are expanded through a dynamic set of Tools that the agent can use. A plugin architecture (`src/plugins/`) allows for easy addition of new functionalities and integrations with external services.
*   **Node.js & TypeScript Foundation**: The application is built on a modern Node.js runtime with TypeScript, ensuring a robust and maintainable codebase. 


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

### Tools:
Tools are functions for Wooster to use himself.
- Wooster is designed to call on any active Tools at will.
- He is designed to follow multi-step chains tool use in pursuit of a goal.
- Tools are grouped into Plugins.
- Community-made Tools are encouraged; Wooster is meant to be extensible.

### Adding new Tools
- To add your own Tool to Wooster, put the function in a `myTool.ts` file and add it to `tools/`.
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
    *   Log conversation to `chat.history` in the active Project Directory.
