## Plugin: mlx-tools (Tool-calling wrapper for MLX/text-only LLMs)

Goal
- Provide reliable tool use with MLX (and other text-only OpenAI-compatible servers) by orchestrating a JSON tool-calling loop client-side in Wooster.
- Preserve Wooster’s existing tool ecosystem (core + plugins) and response-tuning modes (answer-first, RAG-first, etc.).

Why this is needed
- Stock MLX servers expose basic /v1/completions and /v1/models but do not implement OpenAI “tools/function-calling”.
- Wooster’s current agent uses LangChain’s Tools Agent (function calling), which works with OpenAI/cloud but not with MLX.
- A thin wrapper can implement a text/JSON-based tool protocol so MLX can suggest and execute tools through Wooster.

Architecture Overview
- Text Tools Protocol (model-facing): The model is instructed to emit JSON objects that represent tool calls and the final answer.
- Orchestrator (Wooster-facing): A controller loop in the plugin parses JSON tool calls, executes the mapped tool, feeds observations back, and repeats until a final answer is produced or limits are reached.
- Tool Registry: Introspect Wooster’s loaded tools (core + plugins) and expose a curated subset (name, description, input schema) to the model.
- Routing-aware: Only activates when the selected model does not support function-calling (e.g., MLX local). If cloud OpenAI is selected, fall back to the native Tools Agent.

Relation to existing system (keep these in sync)
- See `docs/agent.md` for overall agent/tool architecture.
- See `docs/plugins/local-model.md` for MLX routing and health checks.
- See `docs/system.md` for REPL and boot sequence.
- See `docs/system-prompts.md` for response modes (answer-first recommended with MLX).
- README remains the user entrypoint; we’ll reference this plugin there once implemented.

Protocol (model instructions)
Embed a compact, deterministic spec in the system prompt when mlx-tools is active:
```
You can call tools by emitting a single line of JSON using this schema:
{"type":"tool_call","name":"<tool_name>","arguments":{...}}
When you are done, emit:
{"type":"final_answer","content":"<answer text>"}
Rules:
- Output only JSON on tool lines (no prose), one JSON object per line.
- Keep arguments strictly valid JSON matching the tool’s input schema.
- After a tool_call, wait for an observation to continue.
- Prefer direct answers when confident; use tools when needed.
```
Notes:
- Answer-first mode meshes well: the model can emit `final_answer` immediately when tools aren’t needed.
- We’ll also present a concise tool catalog with name, description, and JSON argument schema.

Controller loop (high level)
1) Build prompt: base persona + response mode + active project context + tool catalog.
2) Get completion from MLX (/v1/completions) with the running transcript.
3) Parse last line for a JSON object. Cases:
   - type=final_answer → return to user.
   - type=tool_call → validate tool name and arguments.
4) Execute the tool via Wooster’s tool registry; capture observation (text or structured).
5) Append an observation message to the transcript:
   - `{"type":"tool_observation","name":"<tool>","content":"<summary or JSON>"}`
6) Repeat steps 2–5 until final or limits reached (max iterations/time).
7) On parse or validation errors, inject a brief error observation and allow the model to repair.

Tool registry and schemas
- Source of truth: Wooster’s loaded tools from core + plugins (via PluginManager `getAgentTools()`).
- For each tool, derive:
  - name: short kebab-case (e.g., `web_search`, `queryKnowledgeBase`, `notes_create`).
  - description: first 1–2 lines of the tool’s description.
  - input schema: JSON schema (derive from Zod if available; otherwise a simple object with required/optional fields).
- Safety: per-config allowlist of tool names; deny destructive tools unless explicitly enabled.

Error handling and robustness
- JSON parsing: try strict parse; on failure, attempt minimal JSON repair, then fail fast with a helpful observation.
- Timeouts: per-tool timeout; per-iteration LLM timeout; overall max runtime.
- Limits: maxIterations (e.g., 4), max tool payload size, max observation length.
- Redaction: strip secrets/API keys from observations; redact file paths if configured.

Security and privacy
- Respect local-only routing: do not invoke web or cloud tools when local-only mode is set.
- Confirm destructive actions:
  - Dry-run mode for file ops and scheduler changes unless the user confirms (configurable).
- Logging: write minimal, non-sensitive traces; optionally log full traces to a local-only file for debugging.

Configuration
- Env / config keys (bridge via `config/custom-environment-variables.json`):
  - `PLUGIN_MLX_TOOLS_ENABLED=true`
  - `MLX_TOOLS_MAX_ITERATIONS=4`
  - `MLX_TOOLS_MODEL_PROMPT_STYLE=jsonl` (future: `xml`, `markdown-json`)
  - `MLX_TOOLS_ALLOWED_TOOLS=web_search,queryKnowledgeBase,create_file,notes_create,scheduleAgentTask`
  - `MLX_TOOLS_TOOL_TIMEOUT_MS=20000`
  - `MLX_TOOLS_TOTAL_TIMEOUT_MS=60000`
  - `MLX_TOOLS_DRY_RUN=false`
  - `ROUTING_LOCAL_ENABLED=true` (from local-model; mlx-tools activates only when local text-only models are selected)

Integration with routing
- If `ModelRouterService` returns an OpenAI function-calling model → use the native Tools Agent.
- If it returns MLX/local (text-only) → use mlx-tools controller loop.
- Answer-first policy strongly recommended for MLX; see `prompts/base_system_prompt.txt`.

Minimal API (plugin skeleton)
```ts
// src/plugins/mlx-tools/index.ts (plan)
export class MlxToolsPlugin implements WoosterPlugin {
  static pluginName = 'mlx-tools';
  static version = '0.1.0';
  static description = 'Client-side tool calling for MLX/text-only LLMs';

  async initialize(config: AppConfig, services: CoreServices) {
    // Register a service that exposes: runWithTools(transcript, tools, policy)
    services.registerService('MlxToolsController', createMlxToolsController(config, services));
  }

  getServices() {
    return { /* controller service surfaced here */ };
  }
}
```

Controller service sketch
```ts
interface MlxToolsController {
  run(params: {
    systemPrompt: string;
    messages: { role: 'system'|'user'|'assistant'|'observation'; content: string }[];
    availableTools: ToolSpec[]; // name, description, schema, handler
    completion: (prompt: string) => Promise<string>; // MLX /v1/completions wrapper
    limits?: { maxIterations?: number; totalMs?: number };
  }): Promise<{ finalAnswer: string; trace: any[] }>;
}
```

Plan (phased)
- Phase 1 (MVP)
  - Implement JSONL protocol and controller loop.
  - Expose small tool set: `queryKnowledgeBase`, `web_search`, `notes_create`, `create_file`, `scheduleAgentTask`.
  - Add answer-first snippet to base prompt (done).
  - Unit tests: JSON parsing, single tool roundtrip, final answer path.
- Phase 2 (UX & resilience)
  - Streaming partial outputs → aggregate, extract last valid JSON.
  - Multi-tool sequences; batched observations; better summarization of large tool outputs.
  - Configurable dry-run/confirm flags for file/scheduler tools.
- Phase 3 (safety & policy)
  - Tool allow/deny lists per plugin; redaction policies; rate limiting.
  - Structured citations for web_search; source list in final answer.
- Phase 4 (unification)
  - Router integration toggle: choose native Tools Agent vs mlx-tools per model.
  - Shared traces/logging with existing `ChatDebugFileCallbackHandler`.

Testing strategy
- Golden transcripts: fixed prompts should yield consistent tool_call JSON.
- Fuzz malformed JSON: ensure repair or graceful error observation.
- Integration tests with MLX server stub.
- Regression tests against core tools (file ops, scheduler, notes, web_search).

Limitations / expectations
- The model must follow the JSON protocol; small deviations are handled, but persistent failures reduce utility.
- Complex tool schemas may require tailored examples to elicit correct JSON.
- This is not function-calling in the API sense; it’s a prompt-and-parse controller designed for text-only LLMs.

Documentation touch-points
- Update `docs/agent.md`: add mlx-tools path in agent execution flow when MLX/local is routed.
- Reference in `docs/plugins/local-model.md`: when routing to MLX, mlx-tools enables tool use.
- Reference in `docs/system-prompts.md`: confirm answer-first + JSON tool protocol section.
- README: brief mention once plugin ships.

Operational guidance
- If you mostly use local MLX: enable `mlx-tools` and answer-first. Keep `web_search` enabled for public facts.
- If you prefer cloud models for tool-rich tasks: disable `ROUTING_LOCAL_ENABLED` or override per project.
- Always keep a small set of allowed tools; expand as comfort grows.


