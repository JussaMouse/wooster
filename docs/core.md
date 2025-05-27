# Core Design


*   **AI Agent (Orchestrator)**: The intelligent core, built using Langchain.js. It is LLM-powered and designed to be model-agnostic (configurable via `.env`), responsible for interpreting user requests, managing conversations, and strategically utilizing available tools or its own knowledge base to formulate responses.
*   **Extensible Tooling & Plugin System**: Wooster's capabilities are expanded through a dynamic set of tools that the agent can use. A plugin architecture (`src/plugins/`) allows for easy addition of new functionalities and integrations with external services.
*   **Node.js & TypeScript Foundation**: The application is built on a modern Node.js runtime with TypeScript, ensuring a robust and maintainable codebase. 