## Wooster ↔ mlx-box Integration Notes

This document captures how to adapt Wooster to run inside the mlx-box environment and default to local LLMs for chat and embeddings.

Reference: [mlx-box repository](https://github.com/JussaMouse/mlx-box)

---

### Environment snapshot (from latest report)
- macOS 15.6, Apple M4 Max, 128 GB RAM
- Reverse proxy via nginx with IP allowlist on 443; pf firewall allows only 80/443/333
- Local services bind to 127.0.0.1
  - Chat (mlx_lm): http://127.0.0.1:8080 (OpenAI-like endpoints; `/v1/models`, `/v1/completions`; `/v1/chat/completions` not present)
  - Embeddings (Qwen3): http://127.0.0.1:8081 (`/v1/embeddings`)
- Frontend http-server errors observed; Wooster has its own Express frontend we can serve behind nginx

Report file noted in: `mlx-box-REPORT.txt` → `/Users/env/server/mlx-box/reports/system-report-YYYYMMDD-HHMMSS.txt`

---

### Key observations in Wooster
- Model routing
  - `ModelRouterService` scaffolds local routing, but default behavior is passthrough to OpenAI.
  - `LocalModelClient` health checks `/health` (not provided by mlx_lm); uses `/v1/completions` for inference which is available.
- Embeddings
  - `OpenAIEmbeddings` is instantiated directly in multiple places (e.g., `src/index.ts`, user profile store), bypassing the local HTTP embedding server.
  - `EmbeddingService` supports a local provider via in-process HF transformers, not the mlx-box HTTP embed server.
- Frontend/API
  - Frontend plugin and API plugin are Express servers, should bind to 127.0.0.1 and sit behind nginx.
  - Default ports collide if both default to 3000; need separation.
- Config
  - No env mapping yet for `routing.providers.local.serverUrl` or embedding server URL.
  - Plugin port envs exist for the frontend; API plugin port should be configurable similarly.
- Logging/monitoring
  - Wooster logs can be directed to file; mlx-box proposes unified logs and 1‑min metrics. Not yet wired.
- Process mgmt
  - mlx-box uses launchd plists and root-owned launchers. Wooster doesn’t ship a plist/launcher yet.

---

### Next steps to “just run” locally (default all LLM calls to mlx-box)

1) Local chat integration (minimal, reliable)
- Change health probe to use `/v1/models` (200 OK) instead of `/health`.
- Keep inference at `/v1/completions` (payload: `{ model, prompt, max_tokens, temperature }`; read `choices[0].text`).
- Add a config flag to prefer local provider; fallback to OpenAI if local is unhealthy.

2) LangChain adapter for local chat (so agents continue to function)
- Implement a small adapter that satisfies `BaseLanguageModel`/`BaseChatModel` by delegating to `LocalModelClient.generate(...)`.
- Update `ModelRouterService.selectModelIntelligent` to return the adapter when local is healthy.

3) Embeddings over HTTP (Qwen3 via mlx-box)
- Create `HttpEmbeddings` that POSTs to `http://127.0.0.1:8081/v1/embeddings` and returns 2560‑dim vectors.
- Replace direct uses of `OpenAIEmbeddings` with a provider selector (config-driven) for:
  - Project vector store initialization
  - User profile vector store
- Rebuild existing stores created with non‑matching dimensions.

4) Config bridge to mlx-box ports and URLs
- Extend config and env mappings:
  - `routing.providers.local.enabled=true`
  - `routing.providers.local.serverUrl=http://127.0.0.1:8080`
  - `routing.providers.local.models.fast=mlx-community/Qwen2.5-72B-Instruct-4bit` (or your chosen model)
  - `routing.providers.local.embeddings.serverUrl=http://127.0.0.1:8081`
  - `plugins.frontend.port=8082`
  - `apiPlugin.port=8083`
- Map these to environment variables so they can mirror `mlx-box` `settings.env`.

5) Bind servers to localhost and separate ports
- Ensure the Frontend and API plugins listen on `127.0.0.1` only and on distinct ports.

6) nginx integration
- Add reverse proxy locations (conceptual example):

```nginx
location /wooster/ {
  proxy_pass http://127.0.0.1:8082;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
}
location /wooster/api/ {
  proxy_pass http://127.0.0.1:8083;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
}
```

- Keep port 443 IP-allowlisted as configured in mlx-box.

7) Logging/monitoring alignment (optional but recommended)
- Point Wooster logs to `~/Library/Logs/com.mlx-box.wooster/*.log` (JSON lines).
- Add `/api/v1/health` in the API plugin to support nginx health checks.
- Optionally emit lightweight metrics aligned with mlx-box’s `logs/metrics.csv` schema.

8) launchd service for Wooster (optional)
- Provide a root-owned launcher and plist similar to mlx-box Python services to keep Wooster always-on.

---

### Concrete dev tasks (ordered)
- Routing/Chat
  - Update `LocalModelClient.isHealthy()` to call `GET /v1/models`.
  - Add a `LocalChatModel` adapter that implements LangChain’s chat interface and uses `LocalModelClient.generate(...)`.
  - In `ModelRouterService`, return `LocalChatModel` when local is healthy and routing is enabled.
- Embeddings
  - Implement `HttpEmbeddings` class for Qwen3 (2560 dims) via `/v1/embeddings`.
  - Replace `OpenAIEmbeddings` usage in `src/index.ts` and `plugins/userProfile/userProfileVectorStore.ts` with a config-driven selector.
  - Add a migration command to rebuild vector stores with new dimensions.
- Config / Env
  - Extend `config/default.json` and `custom-environment-variables.json` to include local chat/embed URLs and plugin ports.
  - Default local endpoints: `CHAT_URL=http://127.0.0.1:8080`, `EMBED_URL=http://127.0.0.1:8081`.
- Servers & nginx
  - Bind Frontend/API to `127.0.0.1`; set ports 8082/8083.
  - Add nginx locations `/wooster/` and `/wooster/api/`.
- Validation
  - Confirm `GET /v1/models` returns 200.
  - Run a chat request through the router and verify local path.
  - Rebuild a project vector store and verify 2560‑dim vectors.

---

### Notes on repo hygiene
- This file should be committed (do not add to `.gitignore`).
- Consider excluding large or transient outputs under `vector_data/` from commits if not already.


