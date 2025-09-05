# Wooster Agent Guide (Code-Agent + Classic)

This guide explains how to use Wooster’s agent(s) for day‑to‑day tasks: chat, web search, projects, GTD, notes, and API usage (web/voice).

## Modes
- `classic_tools` (default): Function‑calling agent; good with cloud models.
- `code_agent`: Model emits one JS block; Wooster executes it with a minimal Tool API. Great for local MLX.

Switch at runtime:
```
> mode code
> mode tools
```

Enable by default in `.env`:
```
CHAT_MODE=code_agent
```

## Chat
- Natural conversation in the REPL.
- Agent will answer directly when possible (answer‑first policy). If unsure, it may use tools.
- Conversation history is kept (trimmed window).

## Web Search (Code-Agent)
- Ask factual/current questions: “search the web for <topic> and summarize in 3 lines”.
- The Tool API returns:
```
{ results: [{ title, url, snippet }] }
```
- Typical code flow the agent will emit:
```js
const r = await webSearch('topic');
const first = r.results[0];
const page = first?.url ? await fetchText(first.url) : '';
finalAnswer(`${first?.title || 'Result'}\n${first?.url || ''}\n${page.slice(0,400)}`);
```

## Projects
- One active project at a time (default: `home`).
- Project directory: `projects/<name>/`
- Journal: `projects/<name>/<name>.md`
- Vector store per project for RAG.
- Switch/create via built‑ins (in classic mode) or ask the agent in chat.

## GTD (Inbox/Sort/Next Actions)
- Capture quickly to `gtd/inbox.md` via chat or API (see API section).
- Sort inbox with the `sortInbox` plugin interactively.
- Next actions live in `gtd/next_actions.md`.
- Scheduled items use the Scheduler; the agent can call `schedule(iso, text)` in code-agent.

## Notes (Markdown‑first, Obsidian‑friendly)
- Keep notes in project journals and GTD files.
- Ask the agent to write notes in code-agent via `writeNote(text)` (simple append), or in classic mode through file tools.
- Use Obsidian to browse/edit; Wooster reads your Markdown.

## RAG (Project Knowledge)
- Ask: “what do our notes say about X in the current project?”
- Code-Agent uses `queryRAG(query)` under the hood; classic mode uses the RAG tool.
- Ensure relevant docs live under `projects/<name>/`.

## API Usage (Web App / Voice / Shortcuts)
- Enable the API plugin (`PLUGIN_API_ENABLED=true`).
- Endpoints (default): `http://localhost:3000/api/v1`.

### Capture to Inbox
```
POST /api/v1/capture
Content-Type: application/json
Authorization: Bearer <PLUGIN_API_KEY>
{
  "text": "Call Alice about the proposal"
}
```

### Log Health Event
```
POST /api/v1/health/events
Content-Type: application/json
Authorization: Bearer <PLUGIN_API_KEY>
{
  "text": "10,000 steps; 2L water"
}
```

### Voice / Mobile
- Use iOS Shortcuts or any HTTP client to hit the capture endpoint.
- For voice assistants, map a voice trigger to send your transcript to `/api/v1/capture`.

## Debugging Code-Agent
- Start with: `CODE_AGENT_DEBUG=1 pnpm start`
- Look for:
  - Tool keys/types before injection
  - Bootstrap shim prefix
  - Emitted code prefix
  - Full error stacks

## Safety Tips
- Prefer local models if privacy is a concern.
- Keep `.env` out of git.
- Review logs in `logs/wooster_session.log`.

## Quick Checklist
- [ ] Set `.env`, enable API (optional), set Tavily key
- [ ] Choose mode: `mode code` or `mode tools`
- [ ] Create/switch project if needed
- [ ] Ask for web search / RAG / schedule / notes
- [ ] Integrate via API for web/voice
