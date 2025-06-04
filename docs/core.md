# Core Design


*   **AI Agent**: The intelligent core, built using Langchain.js. The agent is LLM-powered and designed to be model-agnostic. It is responsible for interpreting user requests, executing tool calls, searching its memory, and formulating responses. The agent may chain tool calls together in order to complete a task.
*   **Separation of Activities**: Activity is organized into knowledge work environments called projects. Projects are zones for deep work where you can share files and collaborate on research with Wooster.
*   **Markdown-First Data**: Wooster prioritizes storing key personal data (notes, tasks, health logs) in human-readable Markdown files within your local workspace. This ensures data longevity, easy backups, and interoperability. This is the source of truth that Wooster needs to optimize his capacity for assistance.
*   **API-Driven Functionality**: Core features are exposed via a local API, enabling programmatic access and integration with external tools, scripts, and custom workflows (e.g., mobile shortcuts).
*   **Extensible Tooling & Plugin System**: Wooster's capabilities are expanded through a dynamic set of Tools and a [plugin architecture](./pluginManager.md) (`src/plugins/`). This allows for easy addition of new functionalities, including those that interact with local files and external services.