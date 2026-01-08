# Wooster Performance Upgrade Guide

## System Profile
- **Hardware**: Mac Studio M4 Max (16-core: 12P+4E), 128GB Unified Memory
- **Current Stack**: mlx-box (MLX-based local inference) + Wooster (TypeScript/LangChain agent)

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

### Recommended Model Upgrades

#### Chat/Reasoning Model (Primary)

| Model | Size | Speed | Quality | RAM Usage |
|-------|------|-------|---------|-----------|
| **Qwen2.5-72B-Instruct-4bit** | 72B | ~15-25 tok/s | ⭐⭐⭐⭐⭐ | ~45 GB |
| Qwen2.5-32B-Instruct-4bit | 32B | ~35-50 tok/s | ⭐⭐⭐⭐ | ~20 GB |
| DeepSeek-V3-0324 (via exo) | 671B | ~3-8 tok/s | ⭐⭐⭐⭐⭐+ | Distributed |
| Llama-3.3-70B-Instruct-4bit | 70B | ~15-25 tok/s | ⭐⭐⭐⭐⭐ | ~42 GB |

**Recommendation**: **Qwen2.5-72B-Instruct-4bit** for daily use, with DeepSeek-V3 via exo for complex reasoning tasks.

```bash
# Download via mlx-lm
mlx_lm.server --model mlx-community/Qwen2.5-72B-Instruct-4bit --port 8080
```

#### Fast Model (Quick Tasks)

| Model | Size | Speed | Use Case |
|-------|------|-------|----------|
| **Qwen2.5-7B-Instruct-4bit** | 7B | ~100-150 tok/s | Classification, routing |
| Llama-3.2-3B-Instruct-4bit | 3B | ~200+ tok/s | Ultra-fast triage |

#### Embedding Model

| Model | Dims | Quality | Speed |
|-------|------|---------|-------|
| **Qwen3-Embedding-8B** | 4096 | ⭐⭐⭐⭐⭐ | ~500 emb/s |
| Qwen3-Embedding-4B | 2560 | ⭐⭐⭐⭐ | ~1000 emb/s |
| nomic-embed-text-v1.5 | 768 | ⭐⭐⭐ | ~2000 emb/s |

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

## Part 3: Optimizing mlx-box

### Current mlx-box Assessment

Your mlx-box setup is solid but can be optimized:

| Component | Current | Recommended |
|-----------|---------|-------------|
| Chat Model | Likely small | Qwen2.5-72B-Instruct-4bit |
| Embed Model | Qwen3-4B | Qwen3-Embedding-8B |
| Quantization | 4-bit | 4-bit (optimal for speed/quality) |
| Context Length | Default | 32K+ |

### mlx-box Optimizations

#### 1. Update Model Configuration

Edit `config/settings.toml`:

```toml
[chat]
model = "mlx-community/Qwen2.5-72B-Instruct-4bit"
max_tokens = 4096
context_length = 32768

[embed]
model = "Qwen/Qwen3-Embedding-8B"
batch_size = 64  # Batch embeddings for speed
```

#### 2. Enable KV-Cache Quantization (Memory Savings)

In `models/chat-server.py`, add:

```python
from mlx_lm import load, generate

model, tokenizer = load(
    "mlx-community/Qwen2.5-72B-Instruct-4bit",
    kv_cache_quant="8bit"  # Reduces context memory by 50%
)
```

#### 3. Pre-warm the Model

Add to LaunchDaemon to keep model hot:

```python
# In chat-server.py startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-generate a token to load model into memory
    _ = generate(model, tokenizer, prompt="Hello", max_tokens=1)
    logger.info("Model pre-warmed")
    yield
```

#### 4. Increase Embedding Batch Size

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
  
  constructor(baseUrl: string = 'http://127.0.0.1:8081') {
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
   - Connect to mlx-box embed server at `http://127.0.0.1:8081`

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

1. **Update mlx-box to use Qwen2.5-72B**:
```bash
cd /Users/lon/projects/mlx-box
./update-model.sh mlx-community/Qwen2.5-72B-Instruct-4bit
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
    "providers": {
      "local": {
        "enabled": true,
        "serverUrl": "http://127.0.0.1:8080",
        "models": {
          "fast": "mlx-community/Qwen2.5-7B-Instruct-4bit",
          "quality": "mlx-community/Qwen2.5-72B-Instruct-4bit"
        },
        "embeddings": {
          "enabled": true,
          "serverUrl": "http://127.0.0.1:8081",
          "model": "Qwen/Qwen3-Embedding-8B",
          "dimensions": 4096,
          "batchSize": 64
        }
      },
      "openai": {
        "enabled": true,
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

---

## Part 8: Expected Performance Improvements

### Before vs After

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Startup time | 5-15s | <1s | 10-15x |
| Query latency | 200-500ms | 10-50ms | 10-20x |
| Embedding cost | $0.02/1K tokens | $0 (local) | ∞ |
| Memory recall | None | Semantic | New capability |
| Vector search | O(n) | O(log n) | Exponential |
| Context window | 4K-8K | 32K+ | 4-8x |
| Model quality | GPT-3.5 level | GPT-4+ level | Significant |

### Resource Usage on M4 Max 128GB

| Resource | Idle | Active | Peak |
|----------|------|--------|------|
| RAM (Chat Model) | 45 GB | 50 GB | 60 GB |
| RAM (Embed Model) | 16 GB | 18 GB | 20 GB |
| RAM (Wooster) | 500 MB | 1 GB | 2 GB |
| **Total** | ~62 GB | ~70 GB | ~82 GB |
| **Headroom** | 66 GB | 58 GB | 46 GB |

You have plenty of capacity for both models simultaneously plus room for growth.

---

## Quick Start Commands

```bash
# 1. Update mlx-box models
cd /Users/lon/projects/mlx-box
./update-model.sh mlx-community/Qwen2.5-72B-Instruct-4bit

# 2. Install Wooster dependencies
cd /Users/lon/projects/wooster
pnpm add hnswlib-node

# 3. Rebuild vector stores after updating embeddings
pnpm run build
node -e "require('./dist/index.js').rebuildAllVectorStores()"

# 4. Start Wooster with local inference
pnpm start
```

---

## Future Considerations

### exo for Multi-Mac Setup

If you acquire additional Macs, exo enables:
- **DeepSeek-V3 671B**: Requires ~400GB VRAM (4x M4 Max 128GB)
- **Tensor Parallelism**: 1.8-3.2x speedup across devices
- **RDMA over Thunderbolt 5**: 99% latency reduction

### Tutoring Mode (Future)

Architecture for kid tutoring:
1. Separate profiles per child
2. Age-appropriate content filtering
3. Curriculum tracking integration
4. Gamification layer
5. Parent dashboard

---

*Generated: January 2026*
*Hardware: Mac Studio M4 Max 128GB*
*Wooster Version: Current*
