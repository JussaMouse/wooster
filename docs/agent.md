# 03 Agent Architecture

> Note: Wooster supports two agent modes: `classic_tools` (function-calling agent) and `code_agent` (model emits a single JS block executed in a sandbox). See `docs/agent-guide.md` for a practical guide and `README.md` for enabling/toggling modes.

This document describes Wooster's intelligent agent system, which orchestrates conversational AI, tool execution, and multi-model routing to provide a sophisticated productivity assistant.

## Dual-Mode Overview
- **Classic Tools**: LangChain OpenAI Tools Agent. Tool selection and iterative function-calling; ideal for cloud models.
- **Code-Agent**: Model writes one JS block; Wooster runs it in a sandbox with a minimal Tool API. Best for local, text-only models; strong for web+summarize, RAG+citation, scheduling, notes.

## 1. Overview: Multi-Model Agent System

Wooster employs a **multi-model agent architecture** that intelligently routes different tasks to optimal AI models based on performance requirements, cost considerations, and availability. The system is built on **LangChain's AgentExecutor framework** with a custom **ModelRouterService** that manages model selection and fallback strategies.

### Key Architectural Principles:
- **Task-Specific Routing**: Different AI models for different types of work (speed vs. quality vs. cost)
- **Local-First**: Prefer local models when available, fallback to cloud models as needed
- **Zero-Latency Design**: Routing adds minimal overhead to response times
- **Backward Compatibility**: Existing configurations work unchanged

## 2. Model Architecture

### 2.1. Current Model Distribution

Wooster uses **5 distinct AI models** for different purposes:

#### **Primary Conversational Agent**
```typescript
// Routed through ModelRouterService
agentLlm = ChatOpenAI → gpt-4o-mini (default)
```
- **Purpose**: Main conversation handling, tool execution decisions, complex reasoning
- **Routing**: Via `ModelRouterService` (Phase 1: passthrough, Phase 2+: intelligent selection)
- **Configuration**: `OPENAI_MODEL_NAME` in `.env`

#### **Project Knowledge Embeddings**
```typescript
OpenAIEmbeddings → text-embedding-3-small
```
- **Purpose**: Project document embeddings for RAG/knowledge base queries
- **Usage**: When user asks questions about project documents
- **Location**: Project vector stores (`projects/*/vectorStore/`)

#### **User Profile & Memory Embeddings**
```typescript
HuggingFaceTransformersEmbeddings → Xenova/all-MiniLM-L6-v2
```
- **Purpose**: User profile vector store, persistent memory operations
- **Usage**: Learning and recalling user preferences, context, facts
- **Location**: `./vector_data/user_profile_store`

#### **Legacy Project Ingestion**
```typescript
HuggingFaceTransformersEmbeddings → Xenova/all-MiniLM-L6-v2
```
- **Purpose**: Document processing during project creation/ingestion
- **Usage**: Converting project files into searchable embeddings

#### **Standalone RAG Operations**
```typescript
ChatOpenAI (separate instance)
```
- **Purpose**: Independent RAG chains when not using the main agent
- **Usage**: Direct document Q&A without full agent context

### 2.2. Model Routing System (Phase 1: Operational, Phase 2+: Planned)

The `ModelRouterService` provides intelligent model selection:

```typescript
// Current: Phase 1 (Zero-latency passthrough)
const router = initializeModelRouter(config);
const model = await router.selectModel({
  task: 'COMPLEX_REASONING',
  context: router.createContext('COMPLEX_REASONING')
});
```

#### **Task Types & Routing Profiles:**
- **`TOOL_EXECUTION`**: Fast responses for tool calls → `local-small`, `gpt-4o-mini`
- **`COMPLEX_REASONING`**: High-quality reasoning → `gpt-4o`, `claude-3.5-sonnet`, `local-large`
- **`CODE_ASSISTANCE`**: Code analysis/generation → `local-coder`, `gpt-4o`
- **`CREATIVE_WRITING`**: Content generation → `local-creative`, `gpt-4o`
- **`BACKGROUND_TASK`**: Scheduled operations → `local-small`, `gpt-4o-mini`
- **`RAG_PROCESSING`**: Document analysis → `local-medium`, `gpt-4o-mini`

#### **Local Model Support (Phase 2+):**
When enabled, Wooster can use local MLX models:
- **Speed Tier**: `Qwen2.5-3B` (~2GB RAM, ~50ms response)
- **Balanced Tier**: `Mistral-7B`, `Qwen2.5-7B` (~4GB RAM, ~120ms response)
- **Quality Tier**: `Qwen2.5-72B` (~40GB RAM, ~800ms response)
- **Specialized**: `Qwen2.5-Coder` for code tasks

## 3. Agent System Components

### 3.1. AgentExecutor Framework
Built on **LangChain's OpenAI Tools Agent**, optimized for function calling:

```typescript
const agent = await createOpenAIToolsAgent({
  llm: agentLlm,  // Routed through ModelRouterService
  tools,          // Dynamic tool discovery from core + plugins
  prompt,         // Context-aware prompt template
});
```

### 3.2. Prompt Architecture
The agent uses a sophisticated prompt template:

```typescript
const prompt = ChatPromptTemplate.fromMessages([
  ["system", finalSystemPrompt],           // Wooster's persona + instructions
  new MessagesPlaceholder("chat_history"), // Conversation context
  ["human", "{input}"],                    // Current user query
  new MessagesPlaceholder("agent_scratchpad"), // Tool execution trace
]);
```

#### **Dynamic System Prompt Components:**
- **Base Persona**: Loaded from `prompts/base_system_prompt.txt`
- **Additional Instructions**: All `.txt` files in `prompts/` directory
- **Active Project Context**: Current project name and file handling rules
- **Current DateTime**: Real-time context injection

### 3.3. Tool System Architecture

#### **Tool Discovery & Loading:**
```typescript
// Core tools (always available)
const coreTools = [queryKnowledgeBase, scheduleAgentTask, createFileTool, readFileTool];

// Plugin tools (dynamically loaded)
const pluginTools = getPluginAgentTools();

// Conflict resolution (core tools take precedence)
const allTools = mergeTool(coreTools, pluginTools);
```

#### **Knowledge Base Integration:**
The `queryKnowledgeBase` tool provides RAG capabilities:

```typescript
const retriever = projectVectorStoreInstance.asRetriever();
const ragChain = await createRetrievalChain({
  retriever: historyAwareRetrieverChain,
  combineDocsChain: documentChain,
});
```

## 4. Decision-Making Flow

### 4.1. Request Processing Pipeline
1. **Input Reception**: User query + conversation history
2. **Model Selection**: `ModelRouterService` selects optimal model for task
3. **Context Assembly**: System prompt + project context + chat history
4. **Agent Invocation**: LLM processes input with available tools
5. **Tool Execution**: Agent calls tools as needed (iterative)
6. **Response Generation**: Final answer synthesis
7. **Context Update**: Conversation history maintained

### 4.2. Tool Execution Loop
```
User Input → Agent LLM → Tool Selection → Tool Execution → Observation → 
    ↑                                                                    ↓
    ← Final Response ← Response Generation ← Continue? ←─────────────────┘
```

### 4.3. Multi-Step Reasoning
The agent can perform complex multi-step tasks:
- **Scratchpad Tracking**: All tool calls and results are logged
- **Iterative Refinement**: Agent can use tool results to inform next actions
- **Error Recovery**: Failed tool calls are analyzed and alternative approaches attempted

## 5. Configuration & Customization

### 5.1. Model Configuration
```bash
# Primary agent model
OPENAI_MODEL_NAME=gpt-4o-mini
OPENAI_TEMPERATURE=0.7

# Routing system (Phase 2+)
MODEL_ROUTING_ENABLED=true
MODEL_ROUTING_STRATEGY=speed
LOCAL_MODEL_ENABLED=true
LOCAL_MODEL_SERVER_URL=http://localhost:8000
```

### 5.2. Project-Specific Behavior
```typescript
// Active project context automatically injected
finalSystemPrompt += `
Your current active project is '${currentActiveProjectName}'. 
For tools requiring a project name, use this exact active project name by default.
Always append to the project's main journal file '${currentActiveProjectName}.md'.
`;
```

### 5.3. Tool Configuration
- **Core Tools**: Always enabled, defined in `src/agentExecutorService.ts`
- **Plugin Tools**: Configurable via individual plugin settings
- **Conflict Resolution**: Core tools take precedence over plugin tools with same names

## 6. Performance & Monitoring

### 6.1. Routing Metrics
```typescript
const stats = router.getRoutingStats();
// Returns: enabled status, decision count, recent decisions, model metrics
```

### 6.2. Debug Logging
- **Agent Interactions**: `logAgentLLMInteractions=true` in config
- **Routing Decisions**: Tracked when routing logging enabled
- **Tool Execution**: Detailed logging of all tool calls and results

### 6.3. Callback Handlers
```typescript
// Optional debug file logging
if (appConfig.logging.logAgentLLMInteractions) {
  agentExecutorOptions.callbacks = [new ChatDebugFileCallbackHandler()];
}
```

## 7. Integration Points

### 7.1. Plugin System
- **Tool Registration**: Plugins provide tools via `getAgentTools()` method
- **Model Requirements**: Plugins can specify preferred models for their operations
- **Configuration**: Plugin-specific model settings in config files

### 7.2. Project Management
- **Active Project Context**: Automatically injected into agent prompt
- **Knowledge Base**: Per-project vector stores for document Q&A
- **File Operations**: Project-scoped file creation and management

### 7.3. Scheduler Integration
- **Background Tasks**: Scheduled agent invocations for automated operations
- **Task Context**: Special handling for scheduled vs. interactive tasks
- **Error Recovery**: Automated retry logic for failed scheduled tasks

## 8. Future Enhancements

### 8.1. Phase 2: Local Model Integration
- **Health Monitoring**: Automatic local model availability checking
- **Fallback Logic**: Seamless cloud fallback when local models unavailable
- **Performance Optimization**: Model warming and caching strategies

### 8.2. Phase 3: Intelligent Routing
- **Usage Analytics**: Model performance tracking and optimization
- **Cost Management**: Automatic cost-based routing decisions
- **User Preferences**: Personalized routing based on user behavior patterns

### 8.3. Advanced Features
- **Multi-Modal Support**: Integration with vision and audio models
- **Specialized Agents**: Task-specific agent instances with optimized prompts
- **Collaborative Reasoning**: Multi-agent systems for complex problem solving

---

This agent architecture provides Wooster with sophisticated AI capabilities while maintaining flexibility, performance, and cost-effectiveness through intelligent model routing and comprehensive tool integration. 