# Wooster System Architecture & REPL Guide

Wooster is a modular, extensible CLI assistant. This document explains its boot sequence, REPL loop, environment config, plugin and memory design.

## 1. Environment & Configuration
- Load `.env` via `dotenv/config`. Supported vars:
  - `OPENAI_API_KEY` (required)
  - `EMAIL_ADDRESS`, `EMAIL_TO`, `EMAIL_APP_PASSWORD` or Gmail OAuth2 vars (for email plugin)
- See `.env.example` for full list.
- `.gitignore` excludes `.env`, `memory.db`, `vector_data/`.

## 2. Boot Sequence
1. Load environment variables.
2. Validate `OPENAI_API_KEY` and exit if missing.
3. Initialize vector memory: `initVectorStore()` → returns empty FAISS store.
4. Initialize RAG chain: `buildRagChain(apiKey, vectorStore)`.
5. Load plugins: `loadPlugins()` scans `src/plugins/` and imports defaults.
6. Init plugins: `initPlugins({ apiKey, vectorStore, ragChain })`.
7. Start interactive REPL: `startREPL()`.

## 3. REPL Loop
- Prompts `> ` using Node's `readline`.
- On each input line:
  1. Trim; ignore blank.
  2. Intercept built-in commands (`load project`, `unload project`, etc.).
  3. Run each plugin's `onUserInput` hook.
  4. Record user turn: SQL `addNode`, vector `upsertDocument`.
  5. Invoke RAG chain: `ragChain.invoke({ input })`.
  6. Record assistant turn: SQL + vector.
  7. Run each plugin's `onAssistantResponse` hook.
  8. Print `Assistant: <response>`.
- On `close` event or Ctrl+C, print "Goodbye!" and exit.

## 4. Built-in Help & Commands
- `help`: list top-level commands.
- `list capabilities`: list core and plugin features.
- `load project <name>` / `unload project`: manage project contexts.

## 5. Plugin Architecture
Plugins implement:
```ts
interface Plugin {
  name: string
  onInit?: (ctx: { apiKey; vectorStore; ragChain }) => void
  onUserInput?: (input: string) => Promise<string> | string
  onAssistantResponse?: (resp: string) => Promise<void> | void
}
```
- `loadPlugins()`: auto-loads `src/plugins/*.ts`.  
- `initPlugins(ctx)`: runs `onInit`.  
- `handleUserInput(input)`: chains `onUserInput`.  
- `handleAssistantResponse(resp)`: chains `onAssistantResponse`.

## 6. Memory Layers
- **SQL Memory**: `better-sqlite3` stores nodes & edges (conversational DAG).  
- **Vector Memory**: FAISS stores embeddings via `@langchain/community`.  
- **RAG Chain**: LangChain's retrieval + OpenAI LLM for context-driven answers.

## 7. Extensibility
- **Add plugins**: drop a `.ts` exporting `Plugin` in `src/plugins/`.  
- **Add commands**: insert pattern match & handler in `src/index.ts` before plugins.  

---
This architecture keeps Wooster light for simple commands and powerful for deep RAG-enabled lookups and plugin-driven automation.
