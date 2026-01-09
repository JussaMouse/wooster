# Wooster Performance Upgrade Guide

## System Profile
- **Hardware**: Mac Studio M4 Max (16-core: 12P+4E), 128GB Unified Memory
- **Current Stack**: mlx-box (MLX-based local inference) + Wooster (TypeScript/LangChain agent)

## mlx-box Service Ports (Quick Reference)

| Service | Port | Model | Purpose |
|---------|------|-------|---------|
| **Router** | 8080 | Qwen3-0.6B-4bit | Request classification, trivial queries |
| **Fast** | 8081 | Qwen3-30B-A3B-4bit | Simple queries, single tool calls |
| **Thinking** | 8083 | Qwen3-30B-A3B-Thinking-2507-4bit | Complex reasoning, code, planning |
| **Embedding** | 8084 | Qwen3-Embedding-8B | Vector embeddings for RAG/memory |

---

## Part 1: Performance Bottleneck Analysis

### 🔴 Critical Bottlenecks (Highest Impact)

#### 1. Embedding Re-computation on Every Load
**Location**: `src/projectIngestor.ts:103-110`, `src/plugins/userProfile/userProfileVectorStore.ts:71-77`

**Problem**: When loading from JSON, `MemoryVectorStore.fromDocuments()` re-embeds every document:

```typescript
// This triggers N embedding API calls every time Wooster starts
return MemoryVectorStore.fromDocuments(revivedDocs, embeddings)
```

**Impact**: ~2-10 seconds startup delay per project + high API costs if using OpenAI
**Fix Priority**: 🔥 CRITICAL

#### 2. Brute-Force Vector Search (O(n) Complexity)
**Location**: `src/services/knowledgeBase/VectorStore.ts:70-79`

**Problem**: `SimpleFileVectorStore.query()` iterates through every vector:

```typescript
const results = Object.entries(this.data).map(([id, record]) => {
  const score = this.cosineSimilarity(queryVector, record.vector);
  return { id, score };
});
```

**Impact**: Linear scaling - 10,000 vectors = 10,000 similarity calculations per query
**Fix Priority**: 🔥 CRITICAL

#### 3. Synchronous JSON Vector Storage
**Location**: `src/services/knowledgeBase/VectorStore.ts:32-53`

**Problem**: File I/O blocks the event loop, periodic saves every 5 seconds regardless of changes
**Impact**: UI jank, delayed responses during saves
**Fix Priority**: ⚠️ HIGH

### 🟡 Medium Bottlenecks

#### 4. No Embedding Batching
**Location**: Throughout `projectIngestor.ts` and `userProfileVectorStore.ts`

**Problem**: Documents are embedded one-by-one instead of batched
**Impact**: 100 documents = 100 HTTP roundtrips instead of 1-5
**Fix Priority**: ⚠️ HIGH

#### 5. Hardcoded OpenAI Embeddings
**Location**: `src/projectIngestor.ts:8`, `src/projectStoreManager.ts:2`

```typescript
import { OpenAIEmbeddings } from "@langchain/openai";
```

**Problem**: Local embedding server isn't used even when available
**Impact**: Unnecessary API costs, network latency, privacy leak
**Fix Priority**: ⚠️ HIGH

#### 6. Default 10-second Health Check Timeout
**Location**: `src/routing/LocalModelClient.ts:17`

```typescript
this.timeout = options.timeout || 10000;
```

**Problem**: Too slow for real-time responsiveness
**Impact**: 10 seconds wasted if local server is down before fallback
**Fix Priority**: 🟡 MEDIUM

### 🟢 Minor Bottlenecks

#### 7. No Response Streaming
**Location**: `src/routing/LocalModelClient.ts:36-48`

**Problem**: Full response must complete before user sees output
**Impact**: Poor perceived performance for long generations
**Fix Priority**: 🟡 MEDIUM

#### 8. Excessive Logging in Hot Paths
**Problem**: Debug logging in vector search and embedding calls
**Impact**: ~5-10% overhead in I/O-bound operations
**Fix Priority**: 🟢 LOW

---

## Part 2: Model Recommendations for M4 Max 128GB

### Your Hardware Advantage

| Resource | Available | Typical Usage |
|----------|-----------|---------------|
| Unified Memory | 128 GB | Can run 70B+ models easily |
| Memory Bandwidth | 546 GB/s | Fastest consumer Apple Silicon |
| GPU Cores | 40-core | Excellent for MLX inference |
| ANE | 16-core | Embeddings, lightweight models |

### Recommended Models (January 2026)

#### Primary Recommendation: Qwen3-30B-A3B (MoE Architecture)

The **Qwen3-30B-A3B** family uses Mixture-of-Experts (MoE) architecture - a game-changer for Wooster:

| Spec | Value | Why It Matters |
|------|-------|----------------|
| **Total params** | 30.5B | Large knowledge base |
| **Activated params** | **3.3B** | ⚡ Fast like a 3B model! |
| **Experts** | 128 (8 active) | Specialization per task |
| **Context** | 256K native | Excellent for memory/RAG |
| **RAM Usage** | ~18-20 GB | Room for multiple models |

#### Model Variants

| Model | Released | Best For | Speed | RAM |
|-------|----------|----------|-------|-----|
| **Qwen3-30B-A3B-Thinking-2507** | July 2025 | Complex reasoning, code, planning | ~50-80 tok/s | ~20 GB |
| **Qwen3-30B-A3B** | April 2025 | Quick responses, simple tasks | ~100-150 tok/s | ~18 GB |
| **Qwen3-0.6B** | April 2025 | Routing/classification only | ~300+ tok/s | ~1 GB |

#### Why Thinking-2507 for Wooster's Agent Tasks

From [Qwen3-30B-A3B-Thinking-2507 benchmarks](https://huggingface.co/Qwen/Qwen3-30B-A3B-Thinking-2507):

| Capability | Base A3B | Thinking-2507 | Relevance to Wooster |
|------------|----------|---------------|---------------------|
| **Agent/Tool Use** (BFCL-v3) | 69.1 | **72.4** | ✅ Tool calling |
| **Coding** (LiveCodeBench) | 57.4 | **66.0** | ✅ Code agent mode |
| **Reasoning** (AIME25) | 70.9 | **85.0** | ✅ Planning tasks |
| **Instruction Following** | 86.5 | **88.9** | ✅ Command parsing |

#### Embedding Model

| Model | Dims | Quality | Speed |
|-------|------|---------|-------|
| **Qwen3-Embedding-8B** | 4096 | ⭐⭐⭐⭐⭐ | ~500 emb/s |
| Qwen3-Embedding-4B | 2560 | ⭐⭐⭐⭐ | ~1000 emb/s |

**Recommendation**: **Qwen3-Embedding-8B** - your RAM supports it easily.

### Should You Use exo?

**Yes, but strategically.**

#### When to Use exo

✅ Running models larger than 128GB (DeepSeek-V3 671B, Llama-3.1-405B)
✅ Distributed inference across multiple Macs
✅ Tensor parallelism for 1.8-3.2x speedup on multi-device
✅ Future-proofing for even larger models

#### When NOT to Use exo

❌ Single-machine inference (mlx-lm is simpler and equally fast)
❌ Models under 100GB (no benefit from distribution)
❌ Latency-critical applications (network overhead)

#### exo Setup for Your Mac Studio

If you have or plan to get additional Macs:

```bash
# On each machine
git clone https://github.com/exo-explore/exo
cd exo/dashboard && npm install && npm run build && cd ..
uv run exo

# Devices auto-discover via mDNS
# Access dashboard at http://localhost:52415
```

For **single Mac Studio**, stick with **mlx-lm** via mlx-box.

---

## Part 2.5: Intelligent Routing Architecture

### The Problem with Current Routing

Wooster's current routing is binary (local vs cloud) with no task-aware model selection. This wastes resources:
- Simple "what time is it?" uses the same model as complex planning
- No fast-path for trivial queries
- Thinking model overhead for non-reasoning tasks

### 3-Tier Routing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Input                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TIER 0: Router Model                           │
│              Qwen3-0.6B-4bit (~300+ tok/s)                       │
│                                                                  │
│  Classifies into: TRIVIAL | SIMPLE | COMPLEX | REASONING         │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
           ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   TIER 1: Fast  │ │  TIER 2: Smart  │ │ TIER 3: Thinking│
│                 │ │                 │ │                 │
│ Qwen3-30B-A3B   │ │ Qwen3-30B-A3B   │ │ Qwen3-30B-A3B   │
│    (base)       │ │    (base)       │ │  Thinking-2507  │
│                 │ │                 │ │                 │
│ • Weather       │ │ • Single tool   │ │ • Multi-tool    │
│ • Time          │ │ • Simple RAG    │ │ • Code agent    │
│ • Greetings     │ │ • Add to list   │ │ • Planning      │
│ • Yes/No        │ │ • Quick lookup  │ │ • Reasoning     │
│                 │ │ • Summarize     │ │ • Creative      │
│  ~100+ tok/s    │ │  ~100+ tok/s    │ │  ~50-80 tok/s   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Task Classification Matrix

| Category | Examples | Complexity | Model Tier |
|----------|----------|------------|------------|
| **Routing/Classification** | "Is this calendar or GTD?" | Trivial | Router (0.6B) |
| **Quick Info** | "What's the weather?", "What time?" | Low | Fast (A3B base) |
| **RAG Retrieval** | "What did I say about X?" | Low | Fast + Embeddings |
| **Simple Tool Calls** | "Add milk to shopping list" | Medium | Fast (A3B base) |
| **Multi-Tool Orchestration** | "Schedule meeting and email attendees" | High | Thinking |
| **Code Agent** | Generate JS for sandbox execution | High | Thinking |
| **Reasoning/Planning** | "Help me plan my week" | High | Thinking |
| **Fact Extraction** | Extract user preferences | Medium | Fast |
| **Summarization** | Daily review, conversation summary | Medium | Fast |
| **Creative/Writing** | Draft emails, documents | Medium-High | Thinking |

### Implementation Steps

#### Step 1: Create Task Complexity Enum

File: `src/routing/TaskComplexity.ts`

```typescript
export enum TaskComplexity {
  TRIVIAL = 'trivial',    // Router can answer directly
  SIMPLE = 'simple',      // Fast model, no reasoning needed
  COMPLEX = 'complex',    // Fast model with tools
  REASONING = 'reasoning' // Thinking model required
}

export interface RoutingDecision {
  complexity: TaskComplexity;
  model: string;
  tier: 'router' | 'fast' | 'thinking';
  reasoning: string;
  confidence: number;
}
```

#### Step 2: Create Intelligent Router Service

File: `src/routing/IntelligentRouter.ts`

```typescript
import { TaskComplexity, RoutingDecision } from './TaskComplexity';

const ROUTING_PROMPT = `Classify this user request into one category:

TRIVIAL: Greetings, time, simple facts you know
SIMPLE: Weather, quick lookups, yes/no questions, single-step tasks
COMPLEX: Multi-step tasks, tool orchestration, summarization
REASONING: Planning, code generation, analysis, creative writing, debugging

User request: {input}

Respond with JSON: {"category": "...", "confidence": 0.0-1.0, "reason": "..."}`;

export class IntelligentRouter {
  private config = {
    router: {
      model: 'mlx-community/Qwen3-0.6B-4bit',
      maxTokens: 100
    },
    fast: {
      model: 'mlx-community/Qwen3-30B-A3B-4bit',
      maxTokens: 2048
    },
    thinking: {
      model: 'mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit',
      maxTokens: 8192,
      thinkingBudget: 4096
    }
  };
  
  async route(input: string): Promise<RoutingDecision> {
    // Quick pattern matching for obvious cases (no LLM call)
    const quickMatch = this.quickClassify(input);
    if (quickMatch) return quickMatch;
    
    // Use router model for ambiguous cases
    return await this.classifyWithLLM(input);
  }
  
  private quickClassify(input: string): RoutingDecision | null {
    const lower = input.toLowerCase().trim();
    
    // TRIVIAL patterns - router answers directly
    const trivialPatterns = [
      /^(hi|hello|hey|good morning|good evening|thanks|thank you)/,
      /^(what time|what's the time|current time)/,
      /^(what day|what's the date|today's date)/
    ];
    if (trivialPatterns.some(p => p.test(lower))) {
      return {
        complexity: TaskComplexity.TRIVIAL,
        model: this.config.router.model,
        tier: 'router',
        reasoning: 'Trivial query - router can handle',
        confidence: 0.95
      };
    }
    
    // SIMPLE patterns - fast model
    const simplePatterns = [
      /^(what's the weather|weather in|forecast)/,
      /^(add|remove|delete) .+ (to|from) (list|inbox|shopping)/,
      /^(show|list|get) (my )?(tasks|events|calendar|inbox)/
    ];
    if (simplePatterns.some(p => p.test(lower))) {
      return {
        complexity: TaskComplexity.SIMPLE,
        model: this.config.fast.model,
        tier: 'fast',
        reasoning: 'Simple query - single tool or lookup',
        confidence: 0.9
      };
    }
    
    // REASONING triggers - thinking model
    const reasoningTriggers = [
      /help me (plan|think|decide|figure out|organize)/,
      /write (a |an |some )?(code|script|function|program)/,
      /create a (plan|schedule|strategy|outline)/,
      /analyze|compare|evaluate|debug|review/,
      /step by step|walk me through/,
      /why (did|does|is|are|should|would)/,
      /how (can|do|should|would) (i|we)/,
      /(schedule|book|arrange).+(and|then|also)/  // Multi-step
    ];
    if (reasoningTriggers.some(r => r.test(lower))) {
      return {
        complexity: TaskComplexity.REASONING,
        model: this.config.thinking.model,
        tier: 'thinking',
        reasoning: 'Complex query requiring reasoning',
        confidence: 0.85
      };
    }
    
    return null; // Needs LLM classification
  }
  
  private async classifyWithLLM(input: string): Promise<RoutingDecision> {
    // Call router model for classification
    const prompt = ROUTING_PROMPT.replace('{input}', input);
    const response = await this.callRouterModel(prompt);
    
    const parsed = JSON.parse(response);
    const complexity = this.mapCategory(parsed.category);
    
    return {
      complexity,
      model: this.selectModel(complexity),
      tier: this.selectTier(complexity),
      reasoning: parsed.reason,
      confidence: parsed.confidence
    };
  }
  
  private selectModel(complexity: TaskComplexity): string {
    switch (complexity) {
      case TaskComplexity.TRIVIAL:
        return this.config.router.model;
      case TaskComplexity.SIMPLE:
      case TaskComplexity.COMPLEX:
        return this.config.fast.model;
      case TaskComplexity.REASONING:
        return this.config.thinking.model;
    }
  }
  
  private selectTier(complexity: TaskComplexity): 'router' | 'fast' | 'thinking' {
    switch (complexity) {
      case TaskComplexity.TRIVIAL:
        return 'router';
      case TaskComplexity.SIMPLE:
      case TaskComplexity.COMPLEX:
        return 'fast';
      case TaskComplexity.REASONING:
        return 'thinking';
    }
  }
}
```

#### Step 3: Update Configuration Schema

File: `src/configLoader.ts` - Add to `ModelRoutingConfig`:

```typescript
export interface ModelRoutingConfig {
  enabled: boolean;
  strategy: 'cost' | 'speed' | 'quality' | 'availability' | 'privacy' | 'intelligent';
  tiers: {
    router: {
      model: string;
      serverUrl: string;
      maxTokens: number;
    };
    fast: {
      model: string;
      serverUrl: string;
      maxTokens: number;
    };
    thinking: {
      model: string;
      serverUrl: string;
      maxTokens: number;
      thinkingBudget: number;
    };
  };
  rules: {
    codeAgent: 'fast' | 'thinking';
    multiToolCall: 'fast' | 'thinking';
    singleToolCall: 'fast' | 'thinking';
    ragQuery: 'fast' | 'thinking';
    planning: 'fast' | 'thinking';
    creative: 'fast' | 'thinking';
    default: 'fast' | 'thinking';
  };
  // ... existing fields
}
```

#### Step 4: Update Environment Variables

Add to `.env`:

```bash
# Intelligent Routing
ROUTING_STRATEGY=intelligent

# Tier 0: Router (classification only)
ROUTING_ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit
ROUTING_ROUTER_MAX_TOKENS=100

# Tier 1-2: Fast (simple + complex tasks)
ROUTING_FAST_MODEL=mlx-community/Qwen3-30B-A3B-4bit
ROUTING_FAST_MAX_TOKENS=2048

# Tier 3: Thinking (reasoning tasks)
ROUTING_THINKING_MODEL=mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit
ROUTING_THINKING_MAX_TOKENS=8192
ROUTING_THINKING_BUDGET=4096

# Task-specific overrides
ROUTING_RULE_CODE_AGENT=thinking
ROUTING_RULE_MULTI_TOOL=thinking
ROUTING_RULE_SINGLE_TOOL=fast
ROUTING_RULE_PLANNING=thinking
```

#### Step 5: Integrate with Agent Executor

File: `src/agentExecutorService.ts` - Modify to use router:

```typescript
import { IntelligentRouter } from './routing/IntelligentRouter';

export class AgentExecutorService {
  private router: IntelligentRouter;
  
  constructor() {
    this.router = new IntelligentRouter();
  }
  
  async execute(input: string): Promise<string> {
    // Route to appropriate model
    const decision = await this.router.route(input);
    
    log(LogLevel.DEBUG, `Routing decision: ${decision.tier} (${decision.reasoning})`);
    
    // Select model client based on tier
    const model = this.getModelForTier(decision.tier);
    
    // Execute with selected model
    return await this.runWithModel(model, input, decision);
  }
}
```

### Expected Performance by Tier

| Tier | Model | Latency | Tokens/sec | Use Case |
|------|-------|---------|------------|----------|
| Router | Qwen3-0.6B | <100ms | 300+ | Classification |
| Fast | Qwen3-30B-A3B | 200-500ms | 100-150 | Most queries |
| Thinking | Qwen3-30B-A3B-Thinking | 1-5s | 50-80 | Complex tasks |

### RAM Usage (All Models Loaded)

| Component | RAM | Notes |
|-----------|-----|-------|
| Router (0.6B) | ~1 GB | Always loaded |
| Fast (30B-A3B) | ~18 GB | Same weights as Thinking |
| Thinking (30B-A3B) | ~0 GB* | *Shares weights with Fast |
| Embeddings (8B) | ~16 GB | Separate model |
| Wooster + Node | ~1 GB | Application overhead |
| **Total** | **~36 GB** | **92 GB headroom!** |

*Note: A3B base and Thinking-2507 share the same MoE architecture - you may be able to hot-swap modes rather than loading two separate models.

---

## Part 3: Optimizing mlx-box

### Current mlx-box Assessment

Your mlx-box setup is solid but can be optimized for the new routing architecture:

| Component | Current | Recommended |
|-----------|---------|-------------|
| Chat Model | Likely small | Qwen3-30B-A3B + Thinking-2507 |
| Router Model | None | Qwen3-0.6B |
| Embed Model | Qwen3-4B | Qwen3-Embedding-8B |
| Quantization | 4-bit | 4-bit (optimal for speed/quality) |
| Context Length | Default | 256K (native for Qwen3-A3B) |

### mlx-box Optimizations

#### 1. Update Model Configuration

Edit `config/settings.toml` (aligned with your mlx-box configuration):

```toml
# --- 3-Tier Intelligent Routing Configuration ---

# Tier 0: Router Service
# Lightweight model for request classification and trivial queries
[services.router]
port = 8080
model = "mlx-community/Qwen3-0.6B-4bit"
max_tokens = 100

# Tier 1 & 2: Fast Service
# General purpose, low-latency model for most queries and simple tools
[services.fast]
port = 8081
model = "mlx-community/Qwen3-30B-A3B-4bit"
max_tokens = 4096

# Tier 3: Thinking Service
# High-reasoning model for complex tasks, coding, and planning
[services.thinking]
port = 8083
model = "mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit"
max_tokens = 8192
thinking_budget = 4096

# --- Embedding Service ---
[services.embedding]
port = 8084
model = "Qwen/Qwen3-Embedding-8B"
batch_size = 64
```

#### 2. Multi-Model Server Setup

Option A: **Separate servers per model** (simplest)

```bash
# Terminal 1: Router (port 8080)
mlx_lm.server --model mlx-community/Qwen3-0.6B-4bit --port 8080

# Terminal 2: Fast (port 8081)
mlx_lm.server --model mlx-community/Qwen3-30B-A3B-4bit --port 8081

# Terminal 3: Thinking (port 8083)
mlx_lm.server --model mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit --port 8083

# Terminal 4: Embeddings (port 8084)
python embed-server.py --port 8084
```

Option B: **Single server with model switching** (advanced)

```python
# In chat-server.py - support model parameter in requests
MODELS = {
    'router': 'mlx-community/Qwen3-0.6B-4bit',
    'fast': 'mlx-community/Qwen3-30B-A3B-4bit',
    'thinking': 'mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit'
}

# Load all models at startup (MoE models share weights)
loaded_models = {name: load(path) for name, path in MODELS.items()}
```

#### 3. Enable KV-Cache Quantization (Memory Savings)

In `models/chat-server.py`, add:

```python
from mlx_lm import load, generate

model, tokenizer = load(
    "mlx-community/Qwen3-30B-A3B-4bit",
    kv_cache_quant="8bit"  # Reduces context memory by 50%
)
```

#### 4. Pre-warm Models

Add to LaunchDaemon to keep models hot:

```python
# In chat-server.py startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-generate a token to load model into memory
    for name, (model, tokenizer) in loaded_models.items():
        _ = generate(model, tokenizer, prompt="Hello", max_tokens=1)
        logger.info(f"Model {name} pre-warmed")
    yield
```

#### 5. Increase Embedding Batch Size

In `models/embed-server.py`:

```python
# Process multiple texts at once
embeddings = model.encode(texts, batch_size=64, show_progress_bar=False)
```

---

## Part 4: Wooster-Specific Optimizations

### Immediate Fixes (No Architecture Changes)

#### 1. Store Pre-computed Embeddings

Create `src/services/knowledgeBase/CachedVectorStore.ts`:

```typescript
interface CachedVectorData {
  id: string;
  vector: number[];
  content: string;
  metadata: any;
}

export class CachedVectorStore {
  private data: Map<string, CachedVectorData> = new Map();
  
  async load(filePath: string): Promise<void> {
    // Load pre-computed vectors, skip re-embedding
    const raw = await fs.readFile(filePath, 'utf-8');
    const records: CachedVectorData[] = JSON.parse(raw);
    for (const record of records) {
      this.data.set(record.id, record);
    }
  }
  
  async save(filePath: string): Promise<void> {
    const records = Array.from(this.data.values());
    await fs.writeFile(filePath, JSON.stringify(records));
  }
}
```

#### 2. Add HNSW Index for Fast Search

Install `hnswlib-node`:

```bash
pnpm add hnswlib-node
```

Replace brute-force search:

```typescript
import { HierarchicalNSW } from 'hnswlib-node';

export class HNSWVectorStore implements VectorStore {
  private index: HierarchicalNSW;
  
  constructor(dimensions: number, maxElements: number = 100000) {
    this.index = new HierarchicalNSW('cosine', dimensions);
    this.index.initIndex(maxElements, 16, 200, 100);
  }
  
  async query(vector: number[], topK: number): Promise<{ id: string; score: number }[]> {
    const result = this.index.searchKnn(vector, topK);
    // O(log n) instead of O(n)
    return result.neighbors.map((idx, i) => ({
      id: this.idMap.get(idx)!,
      score: 1 - result.distances[i]
    }));
  }
}
```

#### 3. Use Local Embeddings via HTTP

Update `src/embeddings/EmbeddingService.ts`:

```typescript
import axios from 'axios';

export class HttpEmbeddings {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://127.0.0.1:8084') {
    this.baseUrl = baseUrl;
  }
  
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const response = await axios.post(`${this.baseUrl}/v1/embeddings`, {
      input: texts,
      model: 'Qwen/Qwen3-Embedding-8B'
    });
    return response.data.data.map((d: any) => d.embedding);
  }
  
  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embedDocuments([text]);
    return embedding;
  }
}
```

#### 4. Reduce Health Check Timeout

In `config/local-model.json`:

```json
{
  "routing": {
    "healthCheck": {
      "timeout": 2000,  // 2 seconds instead of 10
      "retries": 1      // Fail fast
    }
  }
}
```

---

## Part 5: Memory System Upgrades

### Current State

Wooster has basic memory via:
- User Profile Vector Store (embeddings of facts about you)
- Knowledge Base (project documents)
- GTD files (markdown-based task management)

### Enhanced Memory Architecture

#### 1. Episodic Memory (Conversation History)

Create `src/services/memory/EpisodicMemory.ts`:

```typescript
interface Episode {
  id: string;
  timestamp: Date;
  summary: string;
  embedding: number[];
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  actionsTaken: string[];
  pendingFollowups: string[];
}

export class EpisodicMemory {
  private episodes: Episode[] = [];
  private vectorStore: HNSWVectorStore;
  
  async addConversation(messages: Message[]): Promise<void> {
    const summary = await this.summarize(messages);
    const embedding = await this.embed(summary);
    
    this.episodes.push({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      summary,
      embedding,
      topics: await this.extractTopics(messages),
      sentiment: await this.analyzeSentiment(messages),
      actionsTaken: this.extractActions(messages),
      pendingFollowups: this.extractFollowups(messages)
    });
  }
  
  async recallRelevant(query: string, k: number = 5): Promise<Episode[]> {
    const queryEmbedding = await this.embed(query);
    const results = await this.vectorStore.query(queryEmbedding, k);
    return results.map(r => this.episodes.find(e => e.id === r.id)!);
  }
}
```

#### 2. Semantic Profile (Structured Facts About You)

```typescript
interface UserFact {
  category: 'preference' | 'habit' | 'goal' | 'relationship' | 'schedule';
  key: string;
  value: any;
  confidence: number;
  lastUpdated: Date;
  source: 'explicit' | 'inferred';
}

export class SemanticProfile {
  private facts: Map<string, UserFact> = new Map();
  
  async updateFromConversation(messages: Message[]): Promise<void> {
    const extracted = await this.extractFacts(messages);
    for (const fact of extracted) {
      const existing = this.facts.get(fact.key);
      if (!existing || fact.confidence > existing.confidence) {
        this.facts.set(fact.key, fact);
      }
    }
  }
  
  getRelevantFacts(context: string): UserFact[] {
    // Return facts relevant to current context
  }
}
```

#### 3. Habit & Goal Tracking

```typescript
interface Habit {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  targetDays: number[];
  streak: number;
  completions: Date[];
  reminders: boolean;
}

interface Goal {
  id: string;
  title: string;
  category: 'health' | 'finance' | 'career' | 'personal';
  milestones: Milestone[];
  deadline?: Date;
  progress: number;
}

export class HabitGoalService {
  async checkIn(habitId: string): Promise<void>;
  async updateGoalProgress(goalId: string, progress: number): Promise<void>;
  async getDailyPrompt(): Promise<string>;
  async getWeeklyReview(): Promise<string>;
}
```

---

## Part 6: Step-by-Step Implementation Plan

### Phase 1: Performance Foundation (Week 1)

#### Day 1-2: Vector Store Optimization

1. **Install HNSW library**:
```bash
cd /Users/lon/projects/wooster
pnpm add hnswlib-node
```

2. **Create cached vector store** that persists embeddings:
   - File: `src/services/knowledgeBase/CachedVectorStore.ts`
   - Store vectors alongside content in JSON
   - Skip re-embedding on load

3. **Replace brute-force search** with HNSW:
   - File: `src/services/knowledgeBase/HNSWVectorStore.ts`
   - O(log n) queries instead of O(n)

#### Day 3-4: Local Embedding Integration

1. **Create HTTP embeddings client**:
   - File: `src/embeddings/HttpEmbeddings.ts`
   - Connect to mlx-box embed server at `http://127.0.0.1:8084`

2. **Update EmbeddingService** to prefer local:
```typescript
// src/embeddings/EmbeddingService.ts
static getEmbeddings(config: AppConfig): Embeddings {
  if (config.routing?.providers?.local?.embeddings?.enabled) {
    return new HttpEmbeddings(config.routing.providers.local.embeddings.serverUrl);
  }
  return new OpenAIEmbeddings({ ... });
}
```

3. **Migrate existing vector stores** to new dimensions (4096 for Qwen3-8B)

#### Day 5: Model Upgrade

1. **Download Qwen3 models for mlx-box**:
```bash
cd /Users/lon/projects/mlx-box

# Router model (tiny, fast classification)
./update-model.sh mlx-community/Qwen3-0.6B-4bit

# Fast model (MoE - only 3.3B activated)
./update-model.sh mlx-community/Qwen3-30B-A3B-4bit

# Thinking model (for complex reasoning)
./update-model.sh mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit
```

2. **Update embedding model to Qwen3-8B**:
```bash
# In mlx-box config/settings.toml
[embed]
model = "Qwen/Qwen3-Embedding-8B"
```

3. **Rebuild all vector stores** with new embeddings:
```bash
# In Wooster REPL
> rebuild embeddings
```

#### Day 6-7: Implement Intelligent Routing

1. **Create routing files**:
```bash
cd /Users/lon/projects/wooster
touch src/routing/TaskComplexity.ts
touch src/routing/IntelligentRouter.ts
```

2. **Implement TaskComplexity enum** (see Part 2.5 above)

3. **Implement IntelligentRouter** with:
   - Quick pattern matching (no LLM call for obvious cases)
   - LLM-based classification for ambiguous inputs
   - Model selection based on task tier

4. **Update AgentExecutorService** to use router:
   - Call `router.route(input)` before processing
   - Select appropriate model based on `RoutingDecision`
   - Log routing decisions for debugging

5. **Test routing decisions**:
```bash
# Add test cases
pnpm test src/routing/__tests__/IntelligentRouter.test.ts
```

### Phase 2: Memory System (Week 2)

#### Day 1-2: Episodic Memory

1. **Create conversation summarizer**:
   - File: `src/services/memory/ConversationSummarizer.ts`
   - Use local LLM to summarize each session

2. **Create episodic memory store**:
   - File: `src/services/memory/EpisodicMemory.ts`
   - SQLite table for episodes with FTS5 search
   - Vector embeddings for semantic search

3. **Add session persistence**:
   - Auto-save conversation on exit
   - Load relevant history on start

#### Day 3-4: Enhanced User Profile

1. **Create semantic profile service**:
   - File: `src/services/memory/SemanticProfile.ts`
   - Extract facts from conversations
   - Track preferences, habits, relationships

2. **Add fact extraction prompts**:
   - File: `prompts/fact_extraction.txt`
   - Structured output for reliable parsing

3. **Integrate with agent context**:
   - Inject relevant facts into system prompt
   - Update facts after each conversation

#### Day 5: Session Continuity

1. **Create session state manager**:
   - File: `src/services/SessionState.ts`
   - Track pending actions, context, mood

2. **Add "where we left off" prompt**:
```typescript
async function getSessionContext(): Promise<string> {
  const lastSession = await episodicMemory.getLastSession();
  const pendingActions = await gtd.getPendingActions();
  const todayEvents = await calendar.getTodayEvents();
  
  return `
Last session (${formatRelativeTime(lastSession.timestamp)}):
${lastSession.summary}

Pending follow-ups:
${pendingActions.map(a => `- ${a}`).join('\n')}

Today's schedule:
${todayEvents.map(e => `- ${e.time}: ${e.title}`).join('\n')}
  `;
}
```

### Phase 3: Integrated Services (Week 3)

#### Day 1-2: Habit Tracking

1. **Create habits database**:
   - File: `database/habits.sqlite3`
   - Tables: habits, completions, streaks

2. **Create habit service**:
   - File: `src/plugins/habits/HabitService.ts`
   - CRUD operations, streak tracking, reminders

3. **Add habit plugin**:
   - File: `src/plugins/habits/index.ts`
   - Commands: `add habit`, `check in`, `habit stats`

#### Day 3-4: Goal Tracking

1. **Create goals database**:
   - Tables: goals, milestones, progress_entries

2. **Create goal service**:
   - File: `src/plugins/goals/GoalService.ts`
   - Progress tracking, milestone management

3. **Add goal plugin**:
   - Commands: `set goal`, `update progress`, `goal review`

#### Day 5: Daily/Weekly Reviews

1. **Enhanced daily review**:
```typescript
async function generateDailyReview(): Promise<string> {
  const habits = await habitService.getTodayStatus();
  const goals = await goalService.getActiveGoals();
  const tasks = await gtd.getCompletedToday();
  const calendar = await gcal.getTomorrowEvents();
  
  return await llm.generate(`
Generate a personalized daily review for the user:

Habits today: ${JSON.stringify(habits)}
Goal progress: ${JSON.stringify(goals)}
Tasks completed: ${tasks.length}
Tomorrow's events: ${calendar.length}

Include:
1. Celebration of wins
2. Gentle accountability for misses
3. Suggestions for tomorrow
4. One insight or pattern you notice
  `);
}
```

### Phase 4: Proactive Suggestions (Week 4)

#### Day 1-2: Pattern Recognition

1. **Create analytics service**:
   - File: `src/services/analytics/PatternService.ts`
   - Detect habits, preferences, routines

2. **Add weekly insights**:
```typescript
async function generateWeeklyInsights(): Promise<string[]> {
  const patterns = await patternService.getWeeklyPatterns();
  const suggestions = [];
  
  // Habit formation opportunities
  if (patterns.consistentMorningTasks) {
    suggestions.push("You consistently do X in the morning. Consider making it an official habit.");
  }
  
  // Organization suggestions
  if (patterns.frequentTopics.length > 0) {
    suggestions.push(`You've been talking about ${patterns.frequentTopics[0]} a lot. Should we create a dedicated project for this?`);
  }
  
  return suggestions;
}
```

#### Day 3-4: Smart Notifications

1. **Create notification scheduler**:
   - File: `src/scheduler/SmartNotifications.ts`
   - Time-aware reminders
   - Context-aware suggestions

2. **Add Signal/notification integration**:
   - Morning briefing
   - Habit reminders
   - Goal check-ins

#### Day 5: Life Area Coverage

1. **Create life areas framework**:
```typescript
interface LifeArea {
  id: string;
  name: string;
  coverage: 'none' | 'basic' | 'tracked' | 'automated';
  suggestedIntegrations: string[];
}

const LIFE_AREAS: LifeArea[] = [
  { id: 'health', name: 'Health & Fitness', ... },
  { id: 'finance', name: 'Financial', ... },
  { id: 'career', name: 'Career & Work', ... },
  { id: 'relationships', name: 'Relationships', ... },
  { id: 'learning', name: 'Learning & Growth', ... },
  { id: 'home', name: 'Home & Environment', ... },
];
```

2. **Add onboarding for new areas**:
   - Suggest tracking options
   - Offer automation ideas
   - Gradual expansion prompts

---

## Part 7: Configuration Changes

### Updated `config/local-model.json`

```json
{
  "routing": {
    "enabled": true,
    "strategy": "intelligent",
    "fallbackChain": ["local", "openai"],
    "tiers": {
      "router": {
        "model": "mlx-community/Qwen3-0.6B-4bit",
        "serverUrl": "http://127.0.0.1:8080",
        "maxTokens": 100,
        "purpose": "Fast classification and trivial responses"
      },
      "fast": {
        "model": "mlx-community/Qwen3-30B-A3B-4bit",
        "serverUrl": "http://127.0.0.1:8081",
        "maxTokens": 4096,
        "purpose": "Simple queries and single tool calls"
      },
      "thinking": {
        "model": "mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit",
        "serverUrl": "http://127.0.0.1:8083",
        "maxTokens": 8192,
        "thinkingBudget": 4096,
        "purpose": "Complex reasoning, code, multi-step planning"
      }
    },
    "rules": {
      "codeAgent": "thinking",
      "multiToolCall": "thinking",
      "singleToolCall": "fast",
      "ragQuery": "fast",
      "factExtraction": "fast",
      "planning": "thinking",
      "creative": "thinking",
      "default": "fast"
    },
    "providers": {
      "local": {
        "enabled": true,
        "embeddings": {
          "enabled": true,
          "serverUrl": "http://127.0.0.1:8084",
          "model": "Qwen/Qwen3-Embedding-8B",
          "dimensions": 4096,
          "batchSize": 64
        }
      },
      "openai": {
        "enabled": false,
        "models": {
          "fast": "gpt-4o-mini",
          "quality": "gpt-4o"
        }
      }
    },
    "healthCheck": {
      "interval": 30000,
      "timeout": 2000,
      "retries": 1
    }
  },
  "memory": {
    "episodic": {
      "enabled": true,
      "maxEpisodes": 10000,
      "summarizeAfter": 10
    },
    "semantic": {
      "enabled": true,
      "factCategories": ["preference", "habit", "goal", "relationship", "schedule"]
    }
  },
  "services": {
    "habits": { "enabled": true },
    "goals": { "enabled": true },
    "mealPlanning": { "enabled": false },
    "scheduling": { "enabled": true }
  }
}
```

### Updated `.env` for Intelligent Routing

```bash
# Disable OpenAI (fully local)
OPENAI_ENABLED=false

# Enable intelligent routing
ROUTING_ENABLED=true
ROUTING_STRATEGY=intelligent

# Tier 0: Router (classification only) - mlx-box port 8080
ROUTING_ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit
ROUTING_ROUTER_URL=http://127.0.0.1:8080
ROUTING_ROUTER_MAX_TOKENS=100

# Tier 1-2: Fast (simple + complex tasks) - mlx-box port 8081
ROUTING_FAST_MODEL=mlx-community/Qwen3-30B-A3B-4bit
ROUTING_FAST_URL=http://127.0.0.1:8081
ROUTING_FAST_MAX_TOKENS=4096

# Tier 3: Thinking (reasoning tasks) - mlx-box port 8083
ROUTING_THINKING_MODEL=mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit
ROUTING_THINKING_URL=http://127.0.0.1:8083
ROUTING_THINKING_MAX_TOKENS=8192
ROUTING_THINKING_BUDGET=4096

# Task-specific routing rules
ROUTING_RULE_CODE_AGENT=thinking
ROUTING_RULE_MULTI_TOOL=thinking
ROUTING_RULE_SINGLE_TOOL=fast
ROUTING_RULE_RAG_QUERY=fast
ROUTING_RULE_PLANNING=thinking
ROUTING_RULE_CREATIVE=thinking
ROUTING_RULE_DEFAULT=fast

# Local embeddings - mlx-box port 8084
MLX_EMBEDDINGS_ENABLED=true
MLX_EMBEDDINGS_URL=http://127.0.0.1:8084/v1
MLX_EMBEDDINGS_MODEL=Qwen/Qwen3-Embedding-8B
MLX_EMBEDDINGS_DIMENSIONS=4096
```

---

## Part 8: Expected Performance Improvements

### Before vs After

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Startup time | 5-15s | <1s | 10-15x |
| Simple query latency | 500-2000ms | <100ms | 10-20x |
| Complex query latency | 2-5s | 1-3s | 2x + better quality |
| Embedding cost | $0.02/1K tokens | $0 (local) | ∞ |
| Memory recall | None | Semantic | New capability |
| Vector search | O(n) | O(log n) | Exponential |
| Context window | 4K-8K | 256K | 32-64x |
| Model quality | GPT-3.5 level | GPT-4+ level | Significant |
| Routing overhead | None | ~50ms | Smart model selection |

### Performance by Routing Tier

| Tier | Model | Latency | Tokens/sec | RAM |
|------|-------|---------|------------|-----|
| **Router** | Qwen3-0.6B | <100ms | 300+ | ~1 GB |
| **Fast** | Qwen3-30B-A3B | 200-500ms | 100-150 | ~18 GB |
| **Thinking** | Qwen3-30B-A3B-Thinking | 1-5s | 50-80 | ~20 GB |
| **Embeddings** | Qwen3-Embedding-8B | <50ms | 500+ emb/s | ~16 GB |

### Resource Usage on M4 Max 128GB

| Component | RAM | Notes |
|-----------|-----|-------|
| Router (0.6B) | ~1 GB | Always loaded, instant responses |
| Fast (30B-A3B) | ~18 GB | MoE - only 3.3B activated |
| Thinking (30B-A3B) | ~20 GB | Can share weights with Fast* |
| Embeddings (8B) | ~16 GB | High-quality local embeddings |
| Wooster + Node | ~1 GB | Application overhead |
| **Total (all loaded)** | **~56 GB** | |
| **Headroom** | **72 GB** | Room for larger contexts |

*The A3B base and Thinking-2507 share the same MoE architecture - potential for weight sharing.

---

## Quick Start Commands

```bash
# 1. Download Qwen3 models for mlx-box
cd /Users/lon/projects/mlx-box
./update-model.sh mlx-community/Qwen3-0.6B-4bit           # Router
./update-model.sh mlx-community/Qwen3-30B-A3B-4bit        # Fast
./update-model.sh mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit  # Thinking

# 2. Install Wooster dependencies
cd /Users/lon/projects/wooster
pnpm add hnswlib-node

# 3. Create routing files
touch src/routing/TaskComplexity.ts
touch src/routing/IntelligentRouter.ts

# 4. Update .env for intelligent routing
cat >> .env << 'EOF'
OPENAI_ENABLED=false
ROUTING_STRATEGY=intelligent
ROUTING_ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit
ROUTING_FAST_MODEL=mlx-community/Qwen3-30B-A3B-4bit
ROUTING_THINKING_MODEL=mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit
EOF

# 5. Rebuild and start
pnpm run build
pnpm start
```

### Verify Models Are Working

```bash
# Test router model (port 8080)
curl http://127.0.0.1:8080/v1/models

# Test fast model (port 8081)
curl http://127.0.0.1:8081/v1/models

# Test thinking model (port 8083)
curl http://127.0.0.1:8083/v1/models

# Test embeddings (port 8084)
curl http://127.0.0.1:8084/health
```

---

## Future Considerations

### exo for Multi-Mac Setup

If you acquire additional Macs, exo enables:
- **DeepSeek-V3 671B**: Requires ~400GB VRAM (4x M4 Max 128GB)
- **Tensor Parallelism**: 1.8-3.2x speedup across devices
- **RDMA over Thunderbolt 5**: 99% latency reduction

### Model Hot-Swapping (Advanced)

Since Qwen3-30B-A3B and Thinking-2507 share the same MoE architecture, investigate:
- Loading base weights once
- Swapping LoRA/adapter layers for thinking mode
- Single server supporting both modes via API parameter

### Tutoring Mode (Future)

Architecture for kid tutoring:
1. Separate profiles per child
2. Age-appropriate content filtering
3. Curriculum tracking integration
4. Gamification layer
5. Parent dashboard

---

## Summary: Model Selection Quick Reference

| Task Type | Model | Why |
|-----------|-------|-----|
| "Hi", "Thanks" | Router (0.6B) | Instant, no inference |
| "What's the weather?" | Fast (A3B) | Single tool call |
| "Add X to list" | Fast (A3B) | Simple GTD operation |
| "Show my tasks" | Fast (A3B) | Query + format |
| "Help me plan my week" | Thinking | Reasoning required |
| "Write code to..." | Thinking | Code agent mode |
| "Schedule X and email Y" | Thinking | Multi-tool orchestration |
| "Why isn't X working?" | Thinking | Analysis/debugging |
| "Draft an email about..." | Thinking | Creative writing |

---

*Generated: January 2026*
*Updated: January 2026 (Qwen3 MoE + Intelligent Routing)*
*Hardware: Mac Studio M4 Max 128GB*
*Recommended Models: Qwen3-30B-A3B family (MoE)*
