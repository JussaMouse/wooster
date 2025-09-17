## Code-Agent Migration Review for Wooster

### 1) Current Behavior Overview

This summarizes how Wooster runs today, focusing on the main loop, agent stack, plugins, RAG, routing, and scheduling.

- **Main runtime and REPL**
  - Entry: `src/index.ts` starts the app, loads config, initializes embeddings/vector store, initializes the agent executor, loads plugins, starts the scheduler, then launches a REPL.
  - User input loop calls `agentRespond(...)` in `src/agent.ts`, which delegates to `executeAgent(...)` in `src/agentExecutorService.ts` and prints the final response.

- **Agent stack (LangChain Tools Agent)**
  - `src/agent.ts` maps REPL history to `BaseMessage[]` and calls `executeAgent(...)`.
  - `src/agentExecutorService.ts` builds a LangChain `AgentExecutor` with tools (core + plugin-provided).
  - Tools include file ops, knowledge base query (RAG), scheduling, and plugin tools. The agent decides whether to call tools or answer directly; oan bservations are fed back until a final output.

- **Prompting**
  - System prompt: `prompts/base_system_prompt.txt` plus any additional `.txt` in `prompts/` (alphabetical). The agent prompt describes persona, capabilities, and tools.

- **Plugins**
  - `src/pluginManager.ts` discovers `src/plugins/*/index.ts`, validates metadata, instantiates classes, and calls `initialize(...)`.
  - Plugins may return `getAgentTools()` and `getScheduledTaskSetups()`; tools are merged with core tools; scheduled tasks are registered with the scheduler.

- **RAG / Knowledge base**
  - Project stores are created/loaded via `src/projectIngestor.ts` and `src/projectStoreManager.ts` (vector data under `vector_data/PROJECT/...`).
  - Core tool `queryKnowledgeBase` in `src/agentExecutorService.ts` uses history-aware retrieval with the current project vector store and the agent LLM.
  - A simpler helper `src/ragChain.ts` also exists for building a retrieval chain.

- **Model routing (multi-model)**
  - `src/routing/ModelRouterService.ts` + `src/routing/profiles.ts` + `src/routing/types.ts` define a task-profile-based router (speed/quality/cost/etc.).
  - Currently used to select models for agent and RAG; supports OpenAI and local models (phased rollout), with fallbacks and logging knobs.

- **Scheduling**
  - `src/scheduler/schedulerService.ts` executes tasks either by prompting the agent (`AGENT_PROMPT`) or calling a direct function (`DIRECT_FUNCTION`).
  - `src/schedulerTool.ts` exposes `scheduleAgentTask` as a tool so the agent can schedule future work.
  - Natural-language time parsing lives in `src/scheduler/scheduleParser.ts` (chrono-node).

- **Configuration and logging**
  - Config: `config/*.json`, `.env` keys mapped via `config/custom-environment-variables.json`.
  - Logging via `src/logger.ts`. Interaction logging is configurable. Some logs flow into `logs/` and project MD files.


### 2) Impact of Adopting the Code-Agent Paradigm

The code-agent paradigm asks the model to emit a single JavaScript code block that Wooster executes inside a sandboxed runtime, exposing a small Tool API. This affects several subsystems:

- **Agent orchestration**
  - The current LangChain Tools Agent loop continues to exist for classic mode. For code-agent mode, we introduce a new orchestration path that:
    1) Builds a code-agent prompt (enforcing one fenced JS block and `finalAnswer(...)`).
    2) Routes the request to a suitable model (often local MLX) via `ModelRouterService`.
    3) Extracts the code block, executes it in a sandbox with a constrained Tool API, and captures the final answer.
    4) Implements a small retry loop on runtime errors before falling back to classic mode.

- **Prompting**
  - Add a code-agent header (see `docs/code-agent.md`) into the system prompt path when `CHAT_MODE=code_agent`. Few-shots are tailored to the Tool API surface.

- **Tooling surface**
  - Instead of LangChain Tools function-calling, the sandbox exposes a minimal JS Tool API: `webSearch`, `fetchText`, `queryRAG`, `writeNote`, `schedule`, `discordNotify`, `signalNotify`, and `finalAnswer`.
  - Existing plugin tools are not automatically available in code; selected tools will be bridged explicitly into the sandbox API or added gradually.

- **RAG**
  - The code-agent calls `queryRAG(...)`, which should internally reuse the current history-aware retrieval + answer chain backed by the active project vector store.

- **Scheduler**
  - The code-agent calls `schedule(whenISO, text)`, which should delegate to `scheduleAgentTask` with the correct payload mapping.

- **Routing**
  - Emphasize local, text-only models for code generation where possible (MLX). Fallback to cloud models for harder queries. Profiles may map code-agent tasks to `CODE_ASSISTANCE` or `COMPLEX_REASONING` as appropriate.

- **Logging and safety**
  - Log emitted code, tool calls, and `finalAnswer` with redaction. Enforce sandbox limits (time/memory/IO). Add retry-and-fallback behavior.

- **REPL and toggles**
  - Optionally add REPL commands to switch modes (`mode code` / `mode tools`) and display sandbox logs.


### 3) Step-by-Step Migration Plan

This plan introduces code-agent mode in a backward-compatible, feature-flagged way. Default remains classic tools.

1. Add configuration flags and defaults
   - In `config/default.json`, add:
     - `chatMode`: `"classic_tools" | "code_agent"` (default `classic_tools`).
     - `codeAgent`: `{ maxAttempts: 2, stepTimeoutMs: 20000, totalTimeoutMs: 60000, logging: { enabled: true, redactions: true } }`.
   - In `config/custom-environment-variables.json`, map optional `.env` keys:
     - `CHAT_MODE`, `CODE_AGENT_MAX_ATTEMPTS`, `CODE_AGENT_STEP_TIMEOUT_MS`, `CODE_AGENT_TOTAL_TIMEOUT_MS`.
   - Update `.env.example` accordingly.

2. Implement a sandboxed code execution engine
   - Create `src/codeAgent/CodeSandbox.ts`:
     - Execute a single JS code string in an isolated context (no `require`, `fs`, or net access).
     - Expose only whitelisted Tool API functions (see step 3) via a context object.
     - Enforce per-execution timeouts (wall-clock) and output size caps; terminate on timeout.
     - Capture `stdout`, `stderr`, and provide a `finalAnswer` sink; ensure exactly one `finalAnswer` is returned.
     - Emit structured logs: code string hash, tool call summaries, error summaries.
   - Recommended approach: Node `vm` or `vm2` with strict globals. Deny dynamic import and non-whitelisted globals.

3. Provide the Code-Agent Tool API bridge
   - Create `src/codeAgent/tools.ts` that exports a factory to build the API object per request, reusing existing capabilities:
     - `webSearch(query: string)` → reuse existing web search (plugin/tool) or implement a minimal fetch-based search.
     - `fetchText(url: string)` → fetch and return text (size-limited, content-type validated).
     - `queryRAG(query: string)` → wrap the current `queryKnowledgeBase` logic against the active project vector store (history-aware).
     - `writeNote(text: string)` → append a line to the current project notes file or a designated `notes.md` under the active project.
     - `schedule(whenISO: string, text: string)` → call `scheduleAgentTask` with mapped payload.
     - `discordNotify(msg: string)`, `signalNotify(msg: string)` → delegate to existing notification plugins if enabled.
     - `finalAnswer(text: string)` → captured by the sandbox runner and returned to the REPL.
   - Validate arguments strictly; normalize and truncate long outputs before returning to the model.

4. Build the code-agent orchestrator and mode switch
   - Add a new path in `src/agentExecutorService.ts` (or a sibling `src/agentCodeExecutor.ts`) behind `chatMode === 'code_agent'`:
     - Build a prompt: base system prompt + code-agent header from `docs/code-agent.md` + 1–2 few-shots.
     - Use `ModelRouterService` to select the generation model (prefer local where available).
     - Call the LLM, extract exactly one ```js fenced block.
     - Execute via `CodeSandbox.run(code, toolApi, limits)`.
     - If error: log, optionally retry once more with an error observation. On final failure, fall back to classic tools agent.
     - Return `finalAnswer` to `agentRespond(...)`.

5. Prompt composition for code-agent
   - Reuse `prompts/base_system_prompt.txt` and append the Code-Agent header and few-shots when in code-agent mode. The header is outlined in `docs/code-agent.md`.
   - Keep the header short and strict; enforce single code block and Tool API constraints.

6. Integrate with REPL and mode toggles
   - In `src/index.ts`, ensure `setAgentConfig(...)` reads `chatMode`.
   - Optionally add REPL controls:
     - `mode code` → switch to code-agent.
     - `mode tools` → switch back to classic tools.
     - `code log on|off`, `code attempts N` for quick tuning.

7. Logging and redaction
   - Extend `src/logger.ts` to support structured logs for code-agent:
     - Store emitted code (hashed or partially redacted), tool call metadata, and final answers.
     - Avoid logging secrets/URLs; mask tokens.
   - Write concise per-turn traces under `logs/` with timestamps.

8. Safety hardening and limits
   - Timeouts: per step and total conversation turn (`CODE_AGENT_STEP_TIMEOUT_MS`, `CODE_AGENT_TOTAL_TIMEOUT_MS`).
   - Memory/outputs: cap response sizes from tools; sanitize HTML; allow only text.
   - Allowed hosts: if needed, restrict `fetchText` to a safe allowlist.

9. Bridge selected plugin tools (optional, iterative)
   - For high-value tools, add thin wrappers into `src/codeAgent/tools.ts` and register them under stable names.
   - Keep initial surface small to ensure safety and reliability.

10. Tests and evaluation
   - Quick manual tasks: web+summarize, RAG+cite, write note, schedule, notify.
   - Track: success rate, obedience to single code block + `finalAnswer`, tokens/latency, retries.
   - Compare local default vs. cloud fallback per `docs/code-agent.md` recommendations.

11. Rollout
   - Default remains classic tools. Enable code-agent via `CHAT_MODE=code_agent`.
   - Ship with a minimal Tool API; expand after stability and safety are validated.


### 4) File-Level Impact Summary

- Orchestration
  - `src/agent.ts` (no breaking changes): continues to call into the executor; reads config to decide mode.
  - `src/agentExecutorService.ts` (updated): add code-agent execution path or delegate to `src/agentCodeExecutor.ts`.

- Prompting
  - `prompts/base_system_prompt.txt` (no change), plus code-agent header/few-shots injected at runtime when in code mode.
  - `docs/code-agent.md` (source of header guidelines and few-shot patterns).

- Sandbox and Tool API (new)
  - `src/codeAgent/CodeSandbox.ts` (new): secure JS sandbox, timeouts, logging.
  - `src/codeAgent/tools.ts` (new): bridge to existing capabilities (RAG, schedule, notes, notify, web fetch/search).

- RAG
  - `src/agentExecutorService.ts` (reuse `queryKnowledgeBase` logic) or factor shared helper for `queryRAG`.
  - `src/projectIngestor.ts`, `src/projectStoreManager.ts` (no changes needed).

- Routing
  - `src/routing/ModelRouterService.ts`, `src/routing/profiles.ts` (optionally map code-agent requests to `CODE_ASSISTANCE`/`COMPLEX_REASONING`).

- Scheduler
  - `src/schedulerTool.ts`, `src/scheduler/schedulerService.ts` (reused via `schedule(...)`).

- Plugins
  - `src/pluginManager.ts` (no changes). Optional: add wrappers in `src/codeAgent/tools.ts` for selected plugin functions.

- Config & Docs
  - `config/default.json`, `config/custom-environment-variables.json`, `.env.example` (add flags).
  - New doc (this file), and update `docs/code-agent.md` if the Tool API evolves.


### 5) Risks and Mitigations

- **Sandbox escapes or unsafe IO**
  - Use strict sandboxing (`vm`/`vm2`), whitelist-only APIs, no `require`, constrained globals, and hard timeouts.

- **Model violates output format**
  - Enforce parsing of exactly one ```js block; add retry with format reminder; fall back to classic tools.

- **Tool API misuse or argument issues**
  - Validate all inputs, truncate outputs, redact secrets. Provide compact error messages to guide retries.

- **Latency or local model availability**
  - Route using `ModelRouterService`, prefer local models when healthy, fallback to cloud per profile.

- **User experience regressions**
  - Keep default mode as classic tools. Expose REPL toggle and clear logging for troubleshooting.


### 6) Configuration Cheatsheet

Example `.env` keys (mapped in `config/custom-environment-variables.json`):

```bash
CHAT_MODE=code_agent # or classic_tools (default)
CODE_AGENT_MAX_ATTEMPTS=2
CODE_AGENT_STEP_TIMEOUT_MS=20000
CODE_AGENT_TOTAL_TIMEOUT_MS=60000
```

These feed into `config/default.json` under `chatMode` and `codeAgent`.


### 7) Quick Validation Script (manual)

Run these tasks after enabling code-agent mode:
- Ask: “search the web for X and summarize in 3 bullets; include 1 link.”
- Ask: “from our project notes, what mentions Y? cite briefly.”
- Ask: “append ‘- [ ] follow up on Z’ to today’s notes.”
- Ask: “schedule ‘Check weather’ tomorrow 8am.”
- Ask: “send a Signal notification ‘Done with test’.”


### 8) References

- Code-Agent notes: `docs/code-agent.md`
- Agent architecture: `docs/agent.md`
- Routing system: `docs/routing.md`
- Scheduler: `docs/scheduler.md`
- Plugin manager: `docs/pluginManager.md`
- RAG chain and vector stores: `src/agentExecutorService.ts`, `src/projectIngestor.ts`


—

This document is intentionally implementation-oriented to serve as the migration playbook. Default mode remains classic tools; code-agent is gated behind a config flag for safe rollout.


