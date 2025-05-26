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

### c. Tools
- The agent has access to a predefined set of tools (instances of LangChain `DynamicTool`). Each tool allows the agent to interact with external systems or perform specific actions.
- **Tool Definition**: Each tool is defined with:
    - `name`: A unique identifier for the tool.
    - `description`: **Crucially important text** that explains what the tool does, when to use it, and what its input should be. The LLM uses this description to decide if and how to use the tool.
    - `func`: The actual TypeScript function that gets executed when the tool is called.
- **Available Tools**: See `04 TOOLS.MD` for a conceptual overview of the tooling system and links to individual tool documentation files (e.g., `docs/tools/TOOL_WebSearch.MD`) for specifics on each tool.

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

## 4. Importance of Tool Descriptions

Clear, concise, and accurate tool descriptions are paramount for the agent's performance. The LLM relies heavily on these descriptions to:
- Understand what each tool is capable of.
- Determine when a particular tool is appropriate for the user's query.
- Formulate the correct input for the tool.

Poorly described tools can lead to the agent misusing them, not using them when it should, or providing incorrect inputs.

## 5. Configuration

- The agent's LLM model and temperature are configured via `OPENAI_MODEL_NAME` and `OPENAI_TEMPERATURE` in the `.env` file (see `06 CONFIG.MD`).
- Tool-specific configurations (e.g., API keys, enablement status) are also managed in `.env` and detailed in their respective tool documentation and `06 CONFIG.MD`. 