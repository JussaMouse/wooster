# Wooster Architecture Cleanup: Blueprint for a Robust Agent-Tool System

## Executive Summary

The current Wooster architecture relies heavily on LLM reasoning for all interactions, including straightforward operations that could be handled deterministically. This creates:

- **Performance issues**: Every action requires LLM inference (seconds of latency)
- **Reliability issues**: LLM may respond incorrectly (no code block, wrong tool, hallucinated APIs)
- **Complexity**: The code agent prompt is overloaded with instructions
- **Debugging difficulty**: Hard to trace why something failed

This document outlines a vision for a cleaner, more robust architecture.

---

## Current Pain Points

### 1. Over-reliance on LLM Decision Making
```
User: "show next actions"
→ LLM decides to call viewNextActions tool
→ Sometimes LLM just answers from memory instead
→ Sometimes LLM forgets to emit code block
```

**The Problem**: Simple, deterministic operations go through the LLM, which may fail.

### 2. Code Agent Fragility
- LLM must emit valid JavaScript in a code fence
- If it outputs prose instead, the entire request fails
- No graceful degradation or retry with different strategy

### 3. Plugin Tools Not Loading
- Complex class-based plugin system with ESM/CJS issues
- Tools don't reach the code agent prompt
- No clear interface contract between plugins and core

### 4. Prompt Bloat
- The code agent prompt lists all tools manually
- Easy for prompt and reality to drift apart
- Hard for LLM to remember all available tools

---

## Proposed Architecture

### Layer 1: Command Router (Deterministic)

A fast, regex/keyword-based router that handles common operations **without LLM involvement**:

```
User Input → Command Router → Direct Execution → Response

Examples:
- "show next actions" → viewNextActions() → formatted output
- "mark 2 done" → markTaskDone(2) → confirmation
- "capture: buy milk" → capture("buy milk") → confirmation
- "what time is it" → getTime() → formatted output
```

**Benefits**:
- Instant response (no LLM latency)
- 100% reliable (no hallucination)
- Easy to test and debug

### Layer 2: Intent Classifier (Lightweight LLM)

For ambiguous inputs, use a small/fast model to classify intent:

```
User Input → Intent Classifier → { intent, entities, confidence }

If confidence > 0.9 → Direct Execution
If confidence < 0.9 → Full LLM Agent
```

**Benefits**:
- Fast classification (small model, 1-2 tokens output)
- Fallback to full agent for complex queries
- Clear decision boundary

### Layer 3: Full LLM Agent (Complex Reasoning)

Reserve the full code agent for tasks that genuinely need reasoning:

- Multi-step research
- Creative writing
- Complex planning
- Ambiguous requests that need clarification

---

## Tool System Redesign

### Current: Tools in Plugin Classes
```typescript
// Complex, class-based, ESM/CJS issues
class MyPlugin implements WoosterPlugin {
  static pluginName = 'myPlugin';
  getAgentTools(): DynamicTool[] { ... }
}
```

### Proposed: Simple Tool Registry
```typescript
// Simple function-based tools
export const tools = {
  viewNextActions: {
    name: 'viewNextActions',
    description: 'List current next actions',
    keywords: ['show next actions', 'list tasks', 'what do i need to do'],
    execute: async (args) => { ... }
  },
  markTaskDone: {
    name: 'markTaskDone',
    description: 'Mark a task as complete',
    keywords: ['mark done', 'complete task', 'finish'],
    execute: async (args) => { ... }
  }
};

// Registration
toolRegistry.register(tools.viewNextActions);
```

**Benefits**:
- No class instantiation issues
- Keywords enable deterministic routing
- Easy to test in isolation
- Clear contract: `{ name, description, keywords, execute }`

---

## Proposed File Structure

```
src/
├── core/
│   ├── commandRouter.ts      # Deterministic keyword routing
│   ├── intentClassifier.ts   # Lightweight LLM classification
│   ├── codeAgent.ts          # Full LLM agent (complex tasks)
│   └── toolRegistry.ts       # Central tool registration
│
├── tools/                    # Simple, flat tool definitions
│   ├── nextActions.ts
│   ├── capture.ts
│   ├── calendar.ts
│   ├── email.ts
│   └── search.ts
│
├── services/                 # Stateful services (databases, external APIs)
│   ├── gtd/
│   ├── scheduler/
│   └── memory/
│
└── plugins/                  # Optional extensions (keep for now, simplify later)
```

---

## Migration Strategy

### Phase 1: Add Command Router (Non-Breaking)
1. Create `commandRouter.ts` with keyword matching
2. Add shortcuts for most common operations:
   - `show next actions` → direct tool call
   - `mark N done` → direct tool call
   - `capture: X` → direct capture
   - `schedule: X at Y` → direct schedule
3. Fall through to existing code agent for unmatched inputs

**Effort**: Low | **Impact**: High | **Risk**: Low

### Phase 2: Simplify Tool Definitions
1. Create `toolRegistry.ts` with simple interface
2. Migrate one plugin at a time to new format
3. Keep old plugin system working during transition

**Effort**: Medium | **Impact**: Medium | **Risk**: Low

### Phase 3: Intent Classifier
1. Add lightweight classification before code agent
2. Route high-confidence intents to direct execution
3. Route low-confidence to full code agent

**Effort**: Medium | **Impact**: High | **Risk**: Medium

### Phase 4: Cleanup
1. Remove old plugin class system
2. Consolidate prompts
3. Remove dead code
4. Update documentation

**Effort**: Medium | **Impact**: Medium | **Risk**: Low

---

## Open Questions

1. **Keyword vs. Semantic Matching**: Should the command router use exact keywords, fuzzy matching, or embeddings?

2. **Tool Discovery**: How should the LLM know what tools are available? Dynamic prompt generation?

3. **State Management**: Where should conversation state live? In memory? SQLite?

4. **Error Handling**: What happens when a tool fails? Retry? Fallback? Ask user?

5. **Testing Strategy**: How do we test the agent without hitting real LLMs?

---

## Next Steps

1. **Review this document** - Does this capture the vision? What's missing?

2. **Prioritize pain points** - Which issues hurt most right now?

3. **Prototype command router** - Build a minimal version to validate the approach

4. **Audit existing tools** - List all tools and their usage patterns

5. **Define tool interface** - Finalize the simple tool contract

---

## Success Metrics

- **Latency**: Common operations complete in <100ms (no LLM)
- **Reliability**: 99%+ success rate for deterministic operations
- **Simplicity**: New developer can understand the system in <1 hour
- **Testability**: 80%+ of tools have unit tests

---

*Document created: January 10, 2026*
*Status: Draft - For Discussion*
