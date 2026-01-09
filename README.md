# Wooster: Personal Digital Assistant

Wooster is an AI assistant designed to be extended and customized. He uses LLMs and a suite of tools to help with various tasks, from answering questions to managing your information and schedule. Wooster now emphasizes a **local-first, Markdown-driven philosophy** for core productivity tasks, allowing you to own and easily manage your data.

⚠️ This software is experimental and has no guarantee of working or being maintained.

⚠️ This software will share data about you with whichever LLM you attach to it. Use a local LLM if you care about your privacy.


## What's New: Performance Upgrade (January 2026)

Wooster has been significantly upgraded with:

- **3-Tier Intelligent Routing**: Automatically routes queries to the optimal model (Router → Fast → Thinking)
- **Local-First Architecture**: Run entirely on Apple Silicon with mlx-box (no cloud required)
- **Enhanced Memory System**: Episodic memory, semantic profile, and "where we left off" context
- **New Plugins**: Habits tracking, Goals with milestones, Proactive insights
- **48ms Build Times**: Using esbuild instead of tsc

For the complete upgrade guide, see [Performance Upgrade Guide](docs/wooster-performance-upgrade-guide.md).


## Quick Start

```bash
# Clone and install
git clone https://github.com/JussaMouse/wooster.git
cd wooster
pnpm install

# Configure
cp .env.example .env
# Edit .env with your settings

# Build and run
pnpm run build  # 48ms with esbuild
pnpm start
```


## Architecture Overview

### Local Model Setup (Recommended)

Wooster works best with [mlx-box](https://github.com/your-username/mlx-box) providing local inference:

| Service | Port | Model | Purpose |
|---------|------|-------|---------|
| **Router** | 8080 | Qwen3-0.6B-4bit | Request classification |
| **Fast** | 8081 | Qwen3-30B-A3B-4bit | Simple queries, single tools |
| **Thinking** | 8083 | Qwen3-30B-A3B-Thinking-2507-4bit | Complex reasoning, code |
| **Embedding** | 8084 | Qwen3-Embedding-8B | Vector embeddings |

Configure in `.env`:
```bash
ROUTING_STRATEGY=intelligent
ROUTING_ROUTER_URL=http://127.0.0.1:8080
ROUTING_FAST_URL=http://127.0.0.1:8081
ROUTING_THINKING_URL=http://127.0.0.1:8083
MLX_EMBEDDINGS_URL=http://127.0.0.1:8084/v1
```

### Intelligent Routing

Queries are automatically routed to the optimal model:

| Query Type | Model | Why |
|------------|-------|-----|
| "Hi", "Thanks" | Router (0.6B) | Instant, no inference needed |
| "What's the weather?" | Fast (A3B) | Single tool call |
| "Add X to list" | Fast (A3B) | Simple operation |
| "Help me plan my week" | Thinking | Reasoning required |
| "Write code to..." | Thinking | Code agent mode |


## Core Features

### Memory System

Wooster remembers your conversations and learns about you:

- **Episodic Memory**: Summaries of past conversations with semantic search
- **Semantic Profile**: Structured facts (preferences, habits, goals, relationships)
- **Session Context**: "Where we left off" briefing when you return

### New Plugins

#### Habits Plugin
Track daily, weekly, or monthly habits with streaks:
```
> Create a habit called "Morning meditation" that's daily
> Check in to meditation
> Show my habit stats
```

#### Goals Plugin
Track long-term goals with milestones:
```
> Create a goal to "Learn MLX" in the learning category with deadline end of March
> Add milestone "Complete MLX tutorial" to my MLX goal
> Show my goal progress
```

#### Insights Plugin
Get proactive suggestions based on your patterns:
```
> Give me weekly insights
> What habits should I consider based on my patterns?
> Any organization tips for me?
```

### Existing Capabilities

- **Universal Capture**: Quick note capture to `inbox.md`
- **Inbox Processing**: Systematic review and sorting
- **Personal Health Logging**: Track health events to `health_events.log.md`
- **Daily Review**: Customizable daily briefings
- **Google Calendar**: Create, list, manage events
- **Email**: Send via Gmail
- **Web Search**: Via Tavily API
- **Code Agent**: Secure sandbox for code execution


## Project Structure

```
wooster/
├── src/
│   ├── routing/           # Intelligent model routing
│   │   ├── IntelligentRouter.ts
│   │   ├── TaskComplexity.ts
│   │   └── LocalModelClient.ts
│   ├── services/
│   │   ├── memory/        # Memory system
│   │   │   ├── EpisodicMemory.ts
│   │   │   ├── SemanticProfile.ts
│   │   │   └── SessionState.ts
│   │   ├── analytics/     # Pattern recognition
│   │   │   └── PatternService.ts
│   │   └── knowledgeBase/ # Vector stores
│   │       ├── HNSWVectorStore.ts
│   │       └── CachedVectorStore.ts
│   ├── embeddings/        # Embedding providers
│   │   ├── EmbeddingService.ts
│   │   └── HttpEmbeddings.ts
│   └── plugins/           # Feature plugins
│       ├── habits/        # Habit tracking
│       ├── goals/         # Goal tracking
│       ├── insights/      # Proactive suggestions
│       └── ...
├── docs/
│   ├── wooster-performance-upgrade-guide.md
│   └── plugins/           # Plugin documentation
└── config/
```


## Configuration

### Environment Variables

Key settings in `.env`:

```bash
# Model Routing
ROUTING_ENABLED=true
ROUTING_STRATEGY=intelligent  # or 'speed', 'quality', 'cost'

# Local Models (via mlx-box)
ROUTING_ROUTER_URL=http://127.0.0.1:8080
ROUTING_FAST_URL=http://127.0.0.1:8081
ROUTING_THINKING_URL=http://127.0.0.1:8083

# Local Embeddings
MLX_EMBEDDINGS_ENABLED=true
MLX_EMBEDDINGS_URL=http://127.0.0.1:8084/v1

# Memory System
MEMORY_EPISODIC_ENABLED=true
MEMORY_SEMANTIC_ENABLED=true

# Plugins
PLUGIN_HABITS_ENABLED=true
PLUGIN_GOALS_ENABLED=true
PLUGIN_INSIGHTS_ENABLED=true

# OpenAI (fallback or primary if local disabled)
OPENAI_API_KEY=your-key-here
OPENAI_ENABLED=false  # Set true to use OpenAI
```

See `.env.example` for all options.


## Build System

Wooster uses **esbuild** (via tsx) for fast builds:

```bash
pnpm run build      # Fast esbuild (48ms)
pnpm run typecheck  # TypeScript type checking (optional)
pnpm run build:tsc  # Traditional tsc build (slow, needs 12GB+ heap)
pnpm run dev        # Development mode with hot reload
pnpm run test       # Run tests
```

Why esbuild? LangChain's TypeScript types are extremely complex, causing tsc to require 8-12GB+ heap memory. esbuild transpiles without type checking, completing in ~48ms.


## Documentation

- [Performance Upgrade Guide](docs/wooster-performance-upgrade-guide.md) - Complete optimization guide
- [Agent Guide](docs/agent-guide.md) - End-to-end walkthrough
- [Plugin Development Guide](docs/plugin_development_guide.md) - Creating plugins
- [Productivity Guide](docs/productivity_guide.md) - Markdown-driven workflow
- **Plugin Docs**:
  - [Habits Plugin](docs/plugins/habits.md)
  - [Goals Plugin](docs/plugins/goals.md)
  - [Insights Plugin](docs/plugins/insights.md)


## Hardware Requirements

### Minimum (OpenAI mode)
- Any modern computer
- Node.js 18+

### Recommended (Local mode with mlx-box)
- Apple Silicon Mac (M1/M2/M3/M4)
- 32GB+ RAM for basic models
- 64GB+ RAM for Qwen3-30B-A3B
- 128GB RAM for full 3-tier setup + embeddings


## License

ISC
