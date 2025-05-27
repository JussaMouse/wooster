# Core Design


*   **AI Agent**: The intelligent core, built using Langchain.js. The agent is LLM-powered and designed to be model-agnostic. It is responsible for interpreting user requests, executing functions via Tools, querying the Project Memory and User Profile, and formulating the response.
*   **Separation of Activities**: Activity is organized into knowledge work environments called Projects. Projects are zones for deep work. For general life assistance like managing your schedule, finances, meal prep, goals, contacts, etc., switch the active Project to Home.
*   **Extensible Tooling & Plugin System**: Wooster's capabilities are expanded through a dynamic set of Tools that the agent can use. A plugin architecture (`src/plugins/`) allows for easy addition of new functionalities and integrations with external services.
*   **Node.js & TypeScript Foundation**: The application is built on a modern Node.js runtime with TypeScript, ensuring a robust and maintainable codebase. 