## CodeAgent: Practical setup notes for Wooster (MLX‑friendly)

Purpose
- Make tools work robustly with local, text‑only LLM servers (e.g., MLX) by having the model “think in code” and letting Wooster execute the code via a sandboxed Tool API.
- Reduce dependence on server‑side function‑calling; improve multi‑step planning and token efficiency.

### Prompt shape (JS)
- Instruct the model to emit exactly one fenced code block and nothing else.
- Provide a small Tool API and ask the model to call `finalAnswer('…')` once at the end.

Example header (append to system prompt):
```
You can solve tasks by emitting a single JavaScript code block, and nothing else.
Rules:
- Output exactly one fenced code block: ```js ... ``` and no prose outside it.
- Use only the provided APIs: webSearch(query), fetchText(url), queryRAG(query),
  writeNote(text), schedule(time, text), discordNotify(msg), signalNotify(msg), finalAnswer(text).
- Keep code concise (≤ ~60 lines). Use try/catch and small helpers. Call finalAnswer once at the end.
- Summarize long tool outputs before re‑feeding them into the model. Do not print secrets.
```

Few‑shot patterns (2 short examples recommended):
- Web search + summarize (show 2 calls: webSearch → fetchText → finalAnswer)
- RAG + cite (queryRAG → short answer with brief citations → finalAnswer)

### Runtime (sandbox)
- Executes JS in an isolated‑vm sandbox with strict globals; only whitelisted Tool API.
- Per‑step time/memory caps; captured stdout/stderr; robust error stacks.

### Loop control
- Max code attempts per query: 2–3.
- If no `finalAnswer` after max attempts, fall back to a direct LLM answer (answer‑first policy).

### Logging
- Store: emitted code prefix, tool calls (name + short args), and finalAnswer.
- Redact secrets; enable deep logs with `CODE_AGENT_DEBUG=1`.

### Tuning
- temperature: 0.2–0.4 (stable formatting)
- top_p: 0.9
- max_new_tokens: sized to hardware; start ~512–1024

### Current Tool API (normalized)
- `webSearch(query: string) -> { results: Array<{ title: string; url: string; snippet: string }> }`
- `fetchText(url: string) -> string`
- `queryRAG(query: string) -> string` (short excerpt with tiny citations)
- `writeNote(text: string) -> void`
- `schedule(whenISO: string, text: string) -> string`
- `discordNotify(msg: string) -> void`
- `signalNotify(msg: string) -> string`
- `finalAnswer(text: string) -> void` (must be called once at the end)

Notes:
- Tool responses are truncated to `CODE_AGENT_MAX_OUTPUT_LENGTH` when needed.
- URL access may be restricted via allowlist.

### Model recommendations (local MLX first)
- Balanced default: Qwen3‑14B Instruct (MLX) or Gemma 3 12B IT.
- Code‑heavy: Qwen2.5‑Coder‑7B/14B Instruct.
- Fallback (cloud): GPT‑4o / Claude 3.5 Sonnet for hard queries.

### Troubleshooting
- `await is only valid ...` → Ensure sandbox wraps code in an async IIFE.
- `webSearch is not defined` → Verify Tool API injection and shims.
- `Reference is not a function` → Ensure ivm.Reference.apply is used by shim; avoid invalid options.
- `finalAnswer is not a function` → Provide a shim (same pattern as tools).
- `undefined` results → Ensure tool result copying across isolate boundary (`result: { copy: true, promise: true }`).

### Config flags
- CHAT_MODE=code_agent | classic_tools
- CODE_AGENT_MAX_ATTEMPTS=2
- CODE_AGENT_STEP_TIMEOUT_MS=20000
- CODE_AGENT_TOTAL_TIMEOUT_MS=60000
- CODE_AGENT_MEMORY_LIMIT_MB=128
- CODE_AGENT_MAX_OUTPUT_LENGTH=10000

### Migration tips from Tools Agent
- Keep “answer‑first” policy as the outer guard.
- Swap function‑calling for code emission; reuse existing plugin tools via the JS Tool API.
- Start with a tiny catalog (search, RAG, write, notify). Expand after safety and stability.


