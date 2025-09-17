Files/directories to add
src/agents/CodeAgentController.ts: main loop (build prompt, call LLM, parse single code block, execute, handle retries, finalAnswer).
src/agents/sandbox/jsSandbox.ts: strict JS runner (separate process, timeouts; whitelist only your Tool API).
src/agents/toolApi/index.ts: adapters that expose safe functions:
webSearch, fetchText, queryRAG, writeNote, schedule, discordNotify, signalNotify, finalAnswer.
docs/code-agent.md (done): operating notes.
prompts/code_agent_examples.txt: 1–2 short few-shots.
Files to update
src/index.ts
Load plugins before creating the agent (so tools/services exist from turn 1).
Or: create agent after loadPlugins(), not before.
src/agentExecutorService.ts
Add CHAT_MODE switch: “classic_tools” (current) vs “code_agent”.
For code_agent: call CodeAgentController.run(...) instead of LangChain Tools Agent.
Add concise logs around selection and run.
src/agent.ts
Route agentRespond(...) to either classic Tools Agent or CodeAgentController.
src/pluginManager.ts
Expose a typed registry of callable services/tool functions for toolApi (e.g., getService signatures).
Keep getAgentTools() as-is for classic mode.
src/routing/ModelRouterService.ts
No logic change required, but ensure “local” MLX path is used for code_agent when configured.
src/configLoader.ts
Add config keys: CHAT_MODE, CODE_AGENT_MAX_ATTEMPTS, CODE_AGENT_STEP_TIMEOUT_MS, CODE_AGENT_TOTAL_TIMEOUT_MS.
config/custom-environment-variables.json
Map: CHAT_MODE, CODE_AGENT_MAX_ATTEMPTS, CODE_AGENT_STEP_TIMEOUT_MS, CODE_AGENT_TOTAL_TIMEOUT_MS.
.env.example
Add the above keys with sensible defaults and a comment.
prompts/base_system_prompt.txt
Add the “code-only, JS fenced block, finalAnswer once” header; keep answer-first lines.
docs/system-prompts.md
Reference code-agent prompt snippet and few-shots.
How to apply the change
Step 1: Add code-agent controller/sandbox/toolApi (new files).
Step 2: Reorder startup in src/index.ts so plugins load before the agent is created, or reinitialize the agent post-load.
Step 3: Add CHAT_MODE switch in src/agentExecutorService.ts and route to CodeAgentController when CHAT_MODE=code_agent.
Step 4: Add env/config keys and defaults; update .env.example.
Step 5: Add 1–2 few-shots in prompts/code_agent_examples.txt and include them in the system prompt.
Step 6: Keep answer-first as outer policy; instruct tools only when needed.
How to test
Sanity (local MLX):
.env: CHAT_MODE=code_agent; ROUTING_LOCAL_ENABLED=true; ROUTING_LOCAL_SERVER_URL=http://127.0.0.1:8080.
Task 1 (web): “Find the population of X and summarize in 2 lines.”
Verify logs: “CodeAgent: received code block”, tool calls: webSearch → fetchText → finalAnswer.
RAG:
Add a short note/file to project; ask: “Using project notes, summarize Y (1–2 sentences).”
Verify queryRAG call and finalAnswer with tiny citation.
Actions:
Ask to add a note/schedule/notify; confirm side effects occur and are logged (macos-notes, scheduler, discord/signal).
Robustness:
Force a code error (bad arg), ensure one retry and graceful finalAnswer.
What to log (and where)
src/agents/CodeAgentController.ts
INFO: start/end; selected model/provider; attempts; finalAnswer short preview.
DEBUG: emitted code (hash or redacted); tool calls (name + short args, no secrets); error summaries.
src/agents/sandbox/jsSandbox.ts
WARN/ERROR: timeouts, killed process.
Continue using logs/wooster_session.log (or your ~/Library/Logs path), INFO level by default.
How to revise
Tighten prompt if you see extra prose (enforce “one fenced code block only”).
Reduce tool catalog initially; add more only after stability (search, RAG, write, notify, schedule).
Lower temperature if code formatting wobbles (0.2–0.3).
Add a simple JSON linter/fixer for finalAnswer extraction and a last-line JSON guard if needed.
Minimal acceptance checklist
CodeAgent selectable via CHAT_MODE.
Plugins loaded before agent created (tools/services available).
Code-only outputs for at least 3 tasks (web+summarize; RAG+cite; notify).
Logs show one code block + finalAnswer per request; errors retried once; no secrets in logs.