## System Prompts and Response Modes

This doc explains how to tune Wooster’s “instincts” with prompts and config so it behaves more like a chat assistant, a researcher, or an automation agent — depending on your preference. You can mix and match.

Where prompts live
- Base prompt file (optional): `prompts/base_system_prompt.txt`
- Additional prompt snippets (optional, all `*.txt`): `prompts/`
- The runtime concatenates base + all other `*.txt` files (alphabetical) into the system prompt.

Key modes you can bias Wooster toward
- Answer-first (chatty default)
  - Try to answer directly first. Use tools only if asked, if confidence is low, or if the query clearly needs project files or public/current info.
- RAG-first (project knowledge-first)
  - Use the project knowledge base first; only answer from general model knowledge if RAG finds nothing.
- Web-first (current/public info)
  - Prefer `web_search` for questions about public facts, recency, or popularity; summarize and cite sources.
- Local-only routing (privacy via model choice)
  - Enforce local LLMs and avoid external services at the routing/plugin level (e.g., local-model plugin, disable cloud/web plugins). This is a configuration decision, not a prompt mode.
- Tool-forced (procedural)
  - Always use available tools for file ops, scheduling, email, etc., even if the model could formulate the answer without them (for reproducibility and logs).

Recommended prompt snippets

1) Answer-first (chat-like)
```
Policy: Answer-first.
- Give a direct answer first if you can.
- Use tools only if the user asks, your confidence is low, or the task clearly needs project files (RAG) or public/current facts (web_search).
- If you use a tool, be brief; include a one-sentence rationale.
```

2) RAG-first (project-centric)
```
Policy: Retrieve-then-answer.
- Before answering, search the active project's knowledge base.
- If RAG yields relevant context, cite it briefly. If it yields nothing, answer directly.
- Only use web_search for clearly public/current questions.
```

3) Web-first (current/public)
```
Policy: Web-first for public facts.
- When the user asks about public facts, popularity, news, or “current” topics, call web_search, then summarize and cite.
- If web_search seems unnecessary (timeless info), answer directly.
```

4) Local-only routing (configure, not prompt)
Use routing and plugin config to keep all processing local. Example:
```
# .env or config
ROUTING_ENABLED=true
ROUTING_LOCAL_ENABLED=true
# Point to your MLX base URL
ROUTING_LOCAL_SERVER_URL=http://127.0.0.1:8080

# Do not set OPENAI_API_KEY (or set ROUTING.providers.openai.enabled=false in config)
# Disable web search by omitting TAVILY_API_KEY
```
You can add a tiny prompt note like “You are running in local-only mode.”, but enforcement should live in routing/plugins.

5) Tool-forced (procedural/logged)
```
Policy: Always use tools for actions.
- For file edits, scheduling, email, calendar, or notes: always call the corresponding tool.
- Favor actions that leave an auditable trail.
```

Behavioral triggers (good defaults)
- Use RAG when: the user mentions “in my notes/project”, filenames, paths, or project-specific context.
- Use web_search when: “current”, “latest”, “popular now”, “news”, “compare vendors”, “stats” appear — or when you’re uncertain and it’s a public fact.
- Answer directly when: general knowledge, no project context needed, not time-sensitive.
- Local-only when: privacy is requested or configured.

Optional self-check snippet
```
Before finalizing, quickly self-assess: if confidence < high and the question is public/current, prefer web_search; if the question is project-specific, prefer RAG.
```

- Configuration knobs that affect behavior
- Routing (local vs cloud, privacy by model): `routing.enabled`, `routing.providers.local.enabled`
  - Privacy is achieved by selecting local models and disabling cloud/web plugins. Local MLX often lacks OpenAI function-calling; prefer Answer-first or ReAct/text tools if staying local.
- Web search availability: set `TAVILY_API_KEY` to enable `web_search`.
- Plugin enablement: disable plugins you don’t want surfaced as tools.
- Logging: set `logging.consoleLogLevel`/`fileLogLevel` to DEBUG to observe tool choices.

Practical presets

Chatty preset (recommended for general Q&A)
```
Policy: Answer-first.
Use tools only when asked, confidence is low, or the query needs project files (RAG) or public/current info (web_search).
Prefer concise answers with optional citations when tools are used.
```

Research preset (project work)
```
Policy: RAG-first.
Search the active project before answering; cite matched files.
Use web_search only for public/current gaps.
```

Local-only routing preset (privacy via model)
```
Routing: enable local provider; disable cloud provider(s).
Web: leave TAVILY_API_KEY unset to disable web_search.
Prompt: (optional) note “local-only” for transparency; do not rely on prompt to enforce privacy.
```

Implementation notes
- Put exactly one “Policy” snippet at the top of `prompts/base_system_prompt.txt` for the global default.
- Create additional `.txt` snippets in `prompts/` for per-session tuning; the system concatenates them in alphabetical order.
- To override per question, the user can include lightweight directives like “local only”, “use web_search”, or “use project files”.


