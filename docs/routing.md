# 08 ROUTING.MD: Wooster Model Routing System

## Quick Summary

**What**: Intelligent model selection system that routes requests to optimal AI models based on task requirements.

**Why**: Transform Wooster from single-model (gpt-4o-mini) to multi-model system supporting local MLX models, cost optimization, and task-specific performance.

**Key Benefits**:
- **Faster responses**: Local models (50-200ms) vs API calls (200-800ms)
- **Cost savings**: Route simple tasks to cheaper models
- **Privacy**: Route sensitive data to local models only
- **Reliability**: Automatic fallback when models unavailable
- **Zero breaking changes**: Maintains current user experience

**Implementation Strategy**:
- **Phase 1**: Zero-latency refactor (router passthrough to existing models)
- **Phase 2**: Add local MLX models with automatic fallback
- **Phase 3**: Intelligent routing based on task profiles

**Task Profiles**:
- `TOOL_EXECUTION`: Fast local models for simple tool calls
- `COMPLEX_REASONING`: High-quality models (gpt-4o, claude) for hard problems
- `CODE_ASSISTANCE`: Specialized coding models
- `BACKGROUND_TASK`: Cost-optimized models for scheduled tasks
- `RAG_PROCESSING`: Accuracy-focused models for document queries

**Integration Points**:
- Extends `src/agentExecutorService.ts` with router-based model selection
- Adds routing config to `src/configLoader.ts`
- Project-specific model preferences in `projects/[name]/wooster.config.json`
- Enhanced logging for routing decisions and performance tracking
- New REPL commands: `list models`, `model stats`, `routing status`

**Migration**: Backward compatible - existing `.env` configs work unchanged, routing is opt-in via `MODEL_ROUTING_ENABLED=true`.

## User Configuration Examples

### Basic Setup (.env file)

```bash
# Enable routing system
MODEL_ROUTING_ENABLED=true
MODEL_ROUTING_STRATEGY=speed

# Existing OpenAI config (unchanged)
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL_NAME=gpt-4o-mini
OPENAI_TEMPERATURE=0.7

# Local MLX models
LOCAL_MODEL_ENABLED=true
LOCAL_MODEL_SERVER_URL=http://localhost:8000
LOCAL_MODEL_DEFAULT=mlx-community/Mistral-7B-Instruct-v0.3-4bit
LOCAL_MODEL_MODELS_DIR=/Users/yourname/.cache/mlx_models

# Fallback chain (comma-separated, priority order)
MODEL_ROUTING_FALLBACK_CHAIN=local-small,gpt-4o-mini,gpt-4o
```

### Advanced Configuration (config/default.json)

```json
{
  "routing": {
    "enabled": true,
    "strategy": "quality",
    "fallbackChain": ["local-coder", "gpt-4o", "gpt-4o-mini"],
    "providers": {
      "openai": {
        "models": {
          "fast": "gpt-4o-mini",
          "quality": "gpt-4o",
          "creative": "gpt-4o"
        },
        "rateLimiting": true,
        "costTracking": true
      },
      "local": {
        "enabled": true,
        "serverUrl": "http://localhost:8000",
        "autoStart": true,
        "models": {
          "small": "mlx-community/Qwen2.5-3B-Instruct-4bit",
          "medium": "mlx-community/Mistral-7B-Instruct-v0.3-4bit",
          "large": "mlx-community/Llama-3.1-8B-Instruct-4bit",
          "coder": "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit",
          "creative": "mlx-community/Mistral-7B-Instruct-v0.3-4bit"
        }
      }
    },
    "profiles": {
      "TOOL_EXECUTION": {
        "preferred": ["local-small", "gpt-4o-mini"],
        "temperature": 0.1,
        "maxTokens": 512
      },
      "CODE_ASSISTANCE": {
        "preferred": ["local-coder", "gpt-4o"],
        "temperature": 0.2,
        "maxTokens": 1024
      },
      "CREATIVE_WRITING": {
        "preferred": ["local-creative", "gpt-4o"],
        "temperature": 0.8,
        "maxTokens": 1024
      }
    }
  }
}
```

### Project-Specific Settings (projects/my-coding-project/wooster.config.json)

```json
{
  "modelPreferences": {
    "primaryModel": "local-coder",
    "fallback": ["gpt-4o", "gpt-4o-mini"],
    "profiles": {
      "CODE_ASSISTANCE": {
        "preferred": ["local-coder"],
        "temperature": 0.1
      },
      "TOOL_EXECUTION": {
        "preferred": ["local-small"]
      }
    },
    "privacy": {
      "requireLocal": true,
      "allowCloudFallback": false
    }
  }
}
```

### User Preference Examples

**Speed-Focused User:**
```bash
MODEL_ROUTING_STRATEGY=speed
MODEL_ROUTING_FALLBACK_CHAIN=local-small,local-medium,gpt-4o-mini
```

**Quality-Focused User:**
```bash
MODEL_ROUTING_STRATEGY=quality
MODEL_ROUTING_FALLBACK_CHAIN=gpt-4o,claude-3.5-sonnet,local-large
```

**Privacy-Focused User:**
```bash
MODEL_ROUTING_STRATEGY=privacy
MODEL_ROUTING_FALLBACK_CHAIN=local-small,local-medium,local-large
LOCAL_MODEL_ONLY=true
```

**Cost-Conscious User:**
```bash
MODEL_ROUTING_STRATEGY=cost
MODEL_ROUTING_FALLBACK_CHAIN=local-small,gpt-4o-mini,local-medium
OPENAI_COST_LIMIT_DAILY=5.00
```

### Runtime Model Selection (REPL Commands)

```bash
# Check current model status
> routing status
Current Strategy: speed
Active Models: local-small (healthy), gpt-4o-mini (healthy)
Fallback Chain: local-small → gpt-4o-mini → gpt-4o

# List available models
> list models
✅ local-small (mlx-community/Qwen2.5-3B-Instruct-4bit) - 45ms avg
✅ local-coder (mlx-community/Qwen2.5-Coder-7B-Instruct-4bit) - 120ms avg
✅ gpt-4o-mini (OpenAI) - 280ms avg
⚠️  gpt-4o (OpenAI) - Rate limited
❌ claude-3.5-sonnet - Not configured

# Temporarily override model for current session
> switch model local-coder
Switched to local-coder for current session

# Check model performance
> model stats
Tool Execution: local-small (89% usage, 45ms avg)
Code Assistance: local-coder (95% usage, 120ms avg)
Complex Reasoning: gpt-4o (78% usage, 450ms avg)
```

---

## 1. Overview

The Wooster Model Routing System is a core service that intelligently selects and manages different AI models for various tasks throughout the system. It extends Wooster's current single-model architecture into a sophisticated multi-model system capable of routing requests to optimal models based on task requirements, performance characteristics, and availability.

## 2. Current Architecture Context

### 2.1. Existing Model Usage (Pre-Routing)

Wooster currently uses a **centralized, single-model approach**:

```typescript
// Current: src/agentExecutorService.ts
agentLlm = new ChatOpenAI({
  modelName: appConfig.openai.modelName,    // gpt-4o-mini
  temperature: appConfig.openai.temperature, // 0.7
  openAIApiKey: appConfig.openai.apiKey,
});
```

**Current Model Distribution:**
- **Primary Agent Model**: Single `ChatOpenAI` instance (typically `gpt-4o-mini`)
- **Embeddings**: Dual approach:
  - `OpenAIEmbeddings` for project vector stores (`text-embedding-3-small`)
  - `HuggingFaceTransformersEmbeddings` for memory vector (`Xenova/all-MiniLM-L6-v2`)
- **RAG Operations**: Reuses the same `agentLlm` for query rephrasing and answer synthesis

### 2.2. Integration Points

The routing system integrates with existing Wooster components:

- **Agent System** (`docs/agent.md`): Routes model selection for tool execution and conversation handling
- **Project Management** (`docs/projects.md`): Project-specific model preferences and context-aware routing
- **Scheduler** (`docs/scheduler.md`): Background task model optimization
- **Logging** (`docs/logs.md`): Model performance tracking and routing decision logging
- **Plugin System** (`docs/plugins/systeminfo.md`): Plugin-specific model requirements

## 3. Routing Architecture

### 3.1. Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    ModelRouterService                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Model Selector  │  │ Health Monitor  │  │ Performance │ │
│  │                 │  │                 │  │ Tracker     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼──────┐    ┌────────▼────────┐    ┌──────▼──────┐
│ OpenAI       │    │ Local MLX       │    │ Anthropic   │
│ Provider     │    │ Provider        │    │ Provider    │
│              │    │                 │    │ (Future)    │
└──────────────┘    └─────────────────┘    └─────────────┘
```

### 3.2. Implementation Structure

```
src/
├── routing/
│   ├── ModelRouterService.ts      # Core routing logic
│   ├── providers/
│   │   ├── OpenAIProvider.ts      # OpenAI model management
│   │   ├── LocalMLXProvider.ts    # Local model management
│   │   └── BaseProvider.ts        # Provider interface
│   ├── ModelHealthService.ts      # Availability monitoring
│   ├── ModelPerformanceTracker.ts # Performance metrics
│   └── types.ts                   # Routing type definitions
```

## 4. Configuration Integration

### 4.1. Enhanced Configuration Schema

Extends existing `src/configLoader.ts`:

```typescript
export interface ModelRoutingConfig {
  enabled: boolean;
  strategy: 'cost' | 'speed' | 'quality' | 'availability';
  fallbackChain: string[];
  providers: {
    openai: OpenAIConfig;
    local: LocalMLXConfig;
    anthropic?: AnthropicConfig;
  };
  profiles: Record<string, ModelProfile>;
  healthCheck: {
    interval: number;
    timeout: number;
    retries: number;
  };
}

export interface AppConfig {
  // ... existing config ...
  routing: ModelRoutingConfig;
}
```

### 4.2. Environment Variables

Extends existing `config/custom-environment-variables.json`:

```json
{
  "routing": {
    "enabled": "MODEL_ROUTING_ENABLED",
    "strategy": "MODEL_ROUTING_STRATEGY",
    "fallbackChain": "MODEL_ROUTING_FALLBACK_CHAIN",
    "providers": {
      "local": {
        "enabled": "LOCAL_MODEL_ENABLED",
        "serverUrl": "LOCAL_MODEL_SERVER_URL",
        "defaultModel": "LOCAL_MODEL_DEFAULT",
        "modelsDir": "LOCAL_MODEL_MODELS_DIR"
      }
    }
  }
}
```

## 5. Task-Specific Model Profiles

### 5.1. Profile Definitions

Different model configurations optimized for specific use cases:

```typescript
// src/routing/profiles.ts
export const ModelProfiles = {
  // Fast responses for tool calls and simple queries
  TOOL_EXECUTION: {
    preferred: ['local-small', 'gpt-4o-mini'],
    temperature: 0.1,
    maxTokens: 512,
    criteria: 'speed',
    timeout: 5000
  },
  
  // High-quality reasoning for complex agent decisions
  COMPLEX_REASONING: {
    preferred: ['gpt-4o', 'claude-3.5-sonnet', 'local-large'],
    temperature: 0.3,
    maxTokens: 2048,
    criteria: 'quality',
    timeout: 30000
  },
  
  // Creative tasks and content generation
  CREATIVE_WRITING: {
    preferred: ['gpt-4o', 'local-creative'],
    temperature: 0.8,
    maxTokens: 1024,
    criteria: 'creativity',
    timeout: 15000
  },
  
  // Code analysis and generation
  CODE_ASSISTANCE: {
    preferred: ['local-coder', 'gpt-4o', 'claude-3.5-sonnet'],
    temperature: 0.2,
    maxTokens: 1024,
    criteria: 'accuracy',
    timeout: 20000
  },
  
  // Background tasks and scheduled operations
  BACKGROUND_TASK: {
    preferred: ['local-small', 'gpt-4o-mini'],
    temperature: 0.1,
    maxTokens: 256,
    criteria: 'cost',
    timeout: 10000
  },
  
  // RAG query processing and document analysis
  RAG_PROCESSING: {
    preferred: ['local-medium', 'gpt-4o-mini'],
    temperature: 0.2,
    maxTokens: 1024,
    criteria: 'accuracy',
    timeout: 15000
  }
};
```

### 5.2. Context-Aware Routing

The routing system considers multiple factors:

```typescript
interface RoutingContext {
  task: TaskType;
  project?: string;
  userPreferences?: UserModelPreferences;
  priority: 'fast' | 'quality' | 'cost';
  inputLength: number;
  expectedOutputLength: number;
  isScheduledTask: boolean;
  requiresPrivacy: boolean;
}
```

## 6. Integration with Existing Systems

### 6.1. Agent System Integration

Modifies `src/agentExecutorService.ts` to use routing:

```typescript
// Before: Direct model instantiation
// agentLlm = new ChatOpenAI({ ... });

// After: Router-based model selection
async function getModelForTask(context: RoutingContext): Promise<BaseLLM> {
  return await modelRouter.selectModel(context);
}

async function initializeTools() {
  // Dynamic model selection per tool execution
  const queryKnowledgeBase = new DynamicTool({
    name: "queryKnowledgeBase",
    func: async (input: string, runManager?: any) => {
      const model = await getModelForTask({
        task: 'RAG_PROCESSING',
        priority: 'accuracy',
        inputLength: input.length,
        project: currentActiveProjectName
      });
      // Use selected model for RAG operations
    }
  });
}
```

### 6.2. Project-Specific Routing

Integrates with project management system:

```typescript
// Project-specific model preferences in projects/[name]/wooster.config.json
{
  "modelPreferences": {
    "primaryModel": "local-coder",
    "fallback": ["gpt-4o", "gpt-4o-mini"],
    "profiles": {
      "CODE_ASSISTANCE": {
        "preferred": ["local-coder-specialized"]
      }
    }
  }
}
```

### 6.3. Scheduler Integration

Background tasks use cost-optimized routing:

```typescript
// src/scheduler/schedulerService.ts integration
async function executeScheduledItem(item: ScheduleItem) {
  const model = await modelRouter.selectModel({
    task: 'BACKGROUND_TASK',
    priority: 'cost',
    isScheduledTask: true
  });
  
  if (item.task_handler_type === 'AGENT_PROMPT') {
    // Use selected model for scheduled agent tasks
    await agentExecutionCallback(item.payload, { model });
  }
}
```

### 6.4. Logging Integration

Extends existing logging system with routing metrics:

```typescript
// Enhanced logging in src/logger.ts
export function logModelRouting(decision: RoutingDecision, performance: ModelMetrics) {
  if (appConfig.logging.logModelRouting) {
    log(LogLevel.DEBUG, `[MODEL_ROUTING] Selected ${decision.provider} for ${decision.task}`, {
      reasoning: decision.reasoning,
      latency: performance.latency,
      cost: performance.estimatedCost
    });
  }
}
```

## 7. Performance Monitoring

### 7.1. Health Monitoring

Continuous monitoring of model availability and performance:

```typescript
// src/routing/ModelHealthService.ts
class ModelHealthService {
  private healthCache = new Map<string, HealthStatus>();
  
  async checkProviderHealth(provider: string): Promise<HealthStatus> {
    // Ping models, check API limits, local model status
    // Cache results for fast routing decisions
  }
  
  startBackgroundMonitoring() {
    // Check health every 30 seconds
    setInterval(() => this.updateAllProviderHealth(), 30000);
  }
}
```

### 7.2. Performance Tracking

Tracks routing decisions and model performance:

```typescript
interface ModelMetrics {
  provider: string;
  model: string;
  task: string;
  latency: number;
  tokensPerSecond: number;
  errorRate: number;
  cost: number;
  userSatisfaction?: number;
}
```

### 7.3. Routing Decision Logging

All routing decisions are logged for analysis and optimization:

```typescript
interface RoutingDecision {
  timestamp: string;
  task: string;
  selectedProvider: string;
  selectedModel: string;
  reasoning: string;
  fallbacksConsidered: string[];
  context: RoutingContext;
  performance: ModelMetrics;
}
```

## 8. Fallback and Error Handling

### 8.1. Cascading Fallback System

```typescript
async executeWithFallback(request: ModelRequest, prompt: string): Promise<string> {
  const providers = await this.selectProviders(request);
  
  for (const provider of providers) {
    try {
      if (await this.healthService.isAvailable(provider.name)) {
        const result = await this.executeWithProvider(provider, prompt);
        this.performanceTracker.recordSuccess(provider, request);
        return result;
      }
    } catch (error) {
      this.logger.warn(`Provider ${provider.name} failed: ${error.message}`);
      this.performanceTracker.recordFailure(provider, request, error);
      continue;
    }
  }
  
  throw new Error('All model providers failed');
}
```

### 8.2. Graceful Degradation

When preferred models are unavailable:
- **Local models down**: Fallback to OpenAI API
- **OpenAI API issues**: Use cached responses or simplified local models
- **All models unavailable**: Provide informative error messages with retry suggestions

## 9. Local Model Integration

### 9.1. MLX Server Integration

Following the planned architecture from `docs/plugins/local-model.md`:

```typescript
// src/routing/providers/LocalMLXProvider.ts
class LocalMLXProvider extends BaseProvider {
  async initialize() {
    // Check if MLX server is running
    // Auto-start if configured
    // Load available models
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/v1/models`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### 9.2. Model Management

```typescript
interface LocalModelManager {
  listAvailableModels(): Promise<string[]>;
  downloadModel(modelName: string): Promise<void>;
  loadModel(modelName: string): Promise<void>;
  unloadModel(modelName: string): Promise<void>;
  getModelInfo(modelName: string): Promise<ModelInfo>;
}
```

## 10. Migration Strategy

### 10.1. Phase 1: Foundation (Zero-Latency Refactor)

Replace direct model instantiation with router passthrough:

```typescript
// src/routing/ModelRouterService.ts (Phase 1)
class ModelRouterService {
  private primaryModel: ChatOpenAI;
  
  constructor(config: AppConfig) {
    // Initialize exactly like current system
    this.primaryModel = new ChatOpenAI({
      modelName: config.openai.modelName,
      temperature: config.openai.temperature,
      openAIApiKey: config.openai.apiKey,
    });
  }
  
  // Phase 1: Direct passthrough (zero added latency)
  async selectModel(request: ModelRequest): Promise<BaseLLM> {
    return this.primaryModel;
  }
}
```

### 10.2. Phase 2: Local Model Integration

Add local models with automatic fallback:

```typescript
async selectModel(request: ModelRequest): Promise<BaseLLM> {
  // Local models are faster than API calls
  if (this.localProvider.isAvailable() && this.shouldUseLocal(request)) {
    return this.localProvider.getModel(request);
  }
  
  return this.primaryModel; // Existing behavior
}
```

### 10.3. Phase 3: Intelligent Routing

Full routing logic with performance optimization:

```typescript
async selectModel(request: ModelRequest): Promise<BaseLLM> {
  const profile = ModelProfiles[request.task] || ModelProfiles.TOOL_EXECUTION;
  const availableProviders = await this.getAvailableProviders();
  
  for (const preferredModel of profile.preferred) {
    if (availableProviders.includes(preferredModel)) {
      return this.getProviderModel(preferredModel, profile);
    }
  }
  
  // Fallback to primary model
  return this.primaryModel;
}
```

## 11. Configuration Examples

### 11.1. Development Configuration

```json
{
  "routing": {
    "enabled": true,
    "strategy": "speed",
    "fallbackChain": ["local-small", "gpt-4o-mini", "gpt-4o"],
    "providers": {
      "local": {
        "enabled": true,
        "serverUrl": "http://localhost:8000",
        "autoStart": true
      }
    }
  }
}
```

### 11.2. Production Configuration

```json
{
  "routing": {
    "enabled": true,
    "strategy": "cost",
    "fallbackChain": ["gpt-4o-mini", "gpt-4o", "local-fallback"],
    "providers": {
      "openai": {
        "rateLimiting": true,
        "costTracking": true
      }
    }
  }
}
```

## 12. Monitoring and Observability

### 12.1. Routing Dashboard

Future enhancement: Web-based dashboard showing:
- Model usage statistics
- Performance metrics
- Cost analysis
- Error rates
- Routing decision history

### 12.2. CLI Commands

New REPL commands for routing management:

```bash
> list models              # Show available models and status
> model stats              # Display performance statistics
> switch model <name>      # Temporarily override model selection
> routing status           # Show current routing configuration
> model health             # Check all provider health
```

## 13. Testing Strategy

### 13.1. Routing Logic Tests

```typescript
// tests/routing/ModelRouterService.test.ts
describe('ModelRouterService', () => {
  it('should select fastest model for tool execution', async () => {
    const request = { task: 'TOOL_EXECUTION', priority: 'fast' };
    const model = await router.selectModel(request);
    expect(model.provider).toBe('local-small');
  });
  
  it('should fallback when preferred model unavailable', async () => {
    mockProvider('local-small').setAvailable(false);
    const request = { task: 'TOOL_EXECUTION', priority: 'fast' };
    const model = await router.selectModel(request);
    expect(model.provider).toBe('gpt-4o-mini');
  });
});
```

### 13.2. Performance Regression Tests

Automated tests to ensure routing doesn't add significant latency:

```typescript
describe('Routing Performance', () => {
  it('should add less than 5ms overhead', async () => {
    const start = Date.now();
    await router.selectModel({ task: 'TOOL_EXECUTION' });
    const overhead = Date.now() - start;
    expect(overhead).toBeLessThan(5);
  });
});
```

## 14. Future Enhancements

### 14.1. Machine Learning Optimization

- **Usage Pattern Learning**: Automatically optimize routing based on user behavior
- **Performance Prediction**: Predict model performance for specific tasks
- **Cost Optimization**: Dynamic routing based on budget constraints

### 14.2. Advanced Features

- **Model Ensembling**: Combine outputs from multiple models
- **Streaming Optimization**: Route based on streaming capabilities
- **Context Caching**: Cache model contexts for faster subsequent requests
- **A/B Testing**: Compare model performance for continuous improvement

## 15. Security Considerations

### 15.1. Model Access Control

- API key management per provider
- Local model file permissions
- Network security for model servers

### 15.2. Data Privacy

- Route sensitive data to local models only
- Audit trail for data handling decisions
- Compliance with privacy regulations

This routing system transforms Wooster from a single-model assistant into an intelligent multi-model platform while maintaining backward compatibility and the familiar user experience. 