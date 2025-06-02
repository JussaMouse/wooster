# 03 Agent Architecture

This document describes the internal architecture of Wooster's conversational agent, which is responsible for understanding user input, deciding on actions, and generating responses.

## 1. Core Framework: LangChain AgentExecutor

Wooster employs a sophisticated agent model built using **LangChain's `AgentExecutor` framework**. This framework orchestrates the interaction between a Large Language Model (LLM), a set of available tools, and the user's input to drive intelligent behavior.

The agent is specifically an **OpenAI Tools Agent**, designed to leverage the function/tool-calling capabilities of OpenAI's chat models (e.g., `gpt-4o-mini`).

## 2. Key Components

The agent system, managed by `src/agentExecutorService.ts`, comprises several key components:

### a. Large Language Model (LLM)
- **Model**: `ChatOpenAI` (from `@langchain/openai`), typically configured to use a model like `gpt-4o-mini` (or as specified by `OPENAI_MODEL_NAME` in `.env`).
- **Role**: The LLM is the "brain" of the agent. It processes the input, chat history, and tool descriptions to decide the next step.

### b. Prompt Template
- The agent uses a structured `ChatPromptTemplate` to format the input for the LLM. This template is crucial for guiding the LLM's reasoning and tool usage. It typically includes:
    - **System Message**: A directive that defines Wooster's persona, overall goal, general instructions on tool usage, and the current date/time.
    - **`MessagesPlaceholder("chat_history")`**: For incorporating previous turns of the conversation.
    - **`MessagesPlaceholder("input")`**: For the current user query.
    - **`MessagesPlaceholder("agent_scratchpad")`**: A special placeholder where the agent records its internal thought process, tool calls, and tool observations. This allows the agent to perform multi-step reasoning.

### c. Tools: Extending Agent Capabilities
Tools are specialized functions that the agent can use to interact with external services, access specific data stores, or perform actions beyond its immediate knowledge. They are fundamental to Wooster's ability to perform a wide range of tasks.

- **Tool Definition**: Each tool is an instance of LangChain's `DynamicTool` (or a similar compatible class) and is defined with:
    - `name`: A unique string identifier (e.g., `web_search`, `send_email`). This is how the agent refers to the tool.
    - `description`: **This is the most critical part for the agent.** The description tells the LLM what the tool does, when it should be used, the expected input format, and what kind of output to expect. The agent's ability to correctly choose and use tools depends heavily on the clarity and accuracy of these descriptions.
    - `func`: The actual TypeScript `async` function that gets executed when the agent decides to use the tool. It takes an input (often a string or a structured object parsed from a string) and returns a string result (the "observation") to the agent.
- **Source of Tools**: Tools are provided to the agent from two main sources:
    - **Core Tools**: Defined directly within `src/agentExecutorService.ts` or closely related core files (e.g., `src/fileSystemTool.ts`, `src/schedulerTool.ts`).
    - **Plugin-Provided Tools**: Discovered and loaded from enabled plugins via the `pluginManager.ts`. See `docs/plugins.md` for how plugins provide tools.
- **Agent Decision Making**: The `AgentExecutor` presents the names and descriptions of all available tools to the LLM. Based on the user's query and the conversation history, the LLM decides:
    1.  Whether a tool is needed to fulfill the request.
    2.  Which specific tool is most appropriate.
    3.  What input to provide to that tool.
- **Iterative Process**: After a tool is executed, its output (observation) is fed back to the LLM. The LLM can then decide to use another tool, or generate a final response to the user. This iterative process allows for complex, multi-step tasks.

### d. The Importance of Tool Descriptions (Reiteration)
It cannot be overstated: **the quality of tool descriptions directly impacts the agent's intelligence and reliability.**
- A good description is clear, concise, and action-oriented.
- It should explicitly state the tool's purpose and the kind of input it expects (e.g., "Input should be a search query string," or "Input must be a JSON object with keys: 'to', 'subject', 'body'").
- It helps the LLM distinguish between tools with similar capabilities (e.g., when to use `queryKnowledgeBase` vs. `web_search`).
- Refer to individual tool documentation files (in `docs/tools/`) for the exact descriptions provided to the agent for specific tools.

### e. Example Core & Plugin-Provided Tools
The following are examples of tools available to the Wooster agent. This list is not exhaustive and expands as more capabilities and plugins are added. Each often has detailed documentation in `docs/tools/TOOL_*.MD`.

- **`web_search`** (from WebSearch Plugin)
    - Documentation: `docs/tools/TOOL_WebSearch.MD`
    - Briefly: Performs real-time internet searches for up-to-date information.
- **`recall_user_profile`** (from UserProfile Plugin)
    - Documentation: `docs/tools/TOOL_UserProfileRecall.MD` (or similar, path may vary based on plugin docs)
    - Briefly: Retrieves previously learned user-specific facts, preferences, or context.
- **`save_user_profile`** (from UserProfile Plugin)
    - Documentation: (see UserProfile plugin docs)
    - Briefly: Saves new facts or preferences about the user.
- **`queryKnowledgeBase`** (Core Tool)
    - Documentation: `docs/tools/TOOL_KnowledgeBaseQuery.MD`
    - Briefly: Searches and answers questions based exclusively on documents within the currently active project.
- **`send_email`** (from Gmail Plugin)
    - Documentation: `docs/tools/TOOL_Email.MD` (or similar, path may vary based on plugin docs)
    - Briefly: Composes and sends emails on behalf of the user.
- **Google Calendar Tools** (from GCal Plugin)
    - Example Tools: `get_calendar_events`, `create_calendar_event`
    - Documentation: `docs/tools/TOOL_GoogleCalendar.MD` (or similar, path may vary based on plugin docs)
    - Briefly: Lists events, creates new events in Google Calendar.
- **`scheduleAgentTask`** (Core Tool, from `src/schedulerTool.ts`)
    - Documentation: `docs/tools/TOOL_TaskScheduler.MD`
    - Briefly: Schedules a task for the agent to perform at a specified future time.
- **`get_weather_forecast`** (from Weather Plugin)
    - Documentation: `docs/tools/TOOL_Weather.MD` (or similar, path may vary based on plugin docs)
    - Briefly: Fetches the current weather forecast.
- **`create_file`** (Core Tool, from `src/fileSystemTool.ts`)
    - Documentation: (See comments in `src/fileSystemTool.ts` or a dedicated doc if created)
    - Briefly: Creates a new file with specified content within a project.

## 3. Agent's Decision-Making Loop (Simplified)

The `AgentExecutor` manages the following cycle:

1.  **Input Processing**: The user's input and chat history are formatted using the agent's prompt template.
2.  **LLM Invocation**: The formatted prompt (including available tool descriptions) is sent to the LLM.
3.  **Decision**: The LLM responds in one of two ways:
    *   **Tool Call**: If the LLM decides a tool is needed, it outputs a structured request specifying the tool's name and the input for that tool.
    *   **Direct Answer**: If the LLM believes it can answer directly without a tool, it generates a final response for the user.
4.  **Tool Execution (if applicable)**:
    *   If a tool call was requested, the `AgentExecutor` invokes the specified tool with the provided input.
    *   The tool executes its function and returns an "observation" (the result or output of the tool).
5.  **Scratchpad Update**: The tool call request and the resulting observation are added to the `agent_scratchpad` part of the prompt.
6.  **Re-evaluate**: The process loops back to step 2. The LLM now has the additional context from the tool interaction in its scratchpad and can decide on the next action (another tool call or a final answer).
7.  **Final Response**: Once the LLM generates a direct answer, the `AgentExecutor` returns this as the agent's final output to the user.

## 4. Configuration

- The agent's LLM model (`OPENAI_MODEL_NAME`) and temperature (`OPENAI_TEMPERATURE`) are configured via the `.env` file.
- Tool-specific configurations (e.g., API keys, enablement status for plugin-provided tools) are also managed in `.env`.
- See `06 CONFIG.MD` for a comprehensive list of relevant environment variables.
- Individual tool documentation files (`docs/tools/TOOL_*.MD`) and plugin documentation (`docs/plugins/PLUGIN_*.MD`) also highlight their specific configuration requirements. 