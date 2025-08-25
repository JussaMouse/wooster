## Gemma 3 12B IT (QAT → Q4_0) on MLX: Tips for Wooster

Link: [google/gemma-3-12b-it-qat-q4_0-unquantized on Hugging Face](https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-unquantized)

### What it is
- 12B instruction-tuned Gemma 3 checkpoint trained with Quantization Aware Training (QAT) and released unquantized; intended to be quantized to Q4_0 for deployment.
- Large context (up to 128K per model card), 8K output window; multilingual and strong general assistant behavior. Multimodal support exists in the family, but MLX text servers typically run text-only.

### Why it’s a good fit for Wooster (local assistant)
- QAT → Q4_0 generally preserves BF16 quality with ~3× lower memory, ideal for Apple Silicon.
- 12B IT has better instruction-following and reasoning than 7–8B class models; strong for day-to-day assistant tasks (notes, summaries, how-to, light coding).
- Works well with Wooster’s answer-first mode. Tool calling is handled by controller logic (mlx-tools) rather than server-native functions.

### Resource guidance (Apple Silicon)
- Target memory footprint (rough): 12B × 4 bits ≈ ~6 GB for weights; add KV cache and runtime overhead.
- Practical recommendations:
  - 16 GB RAM: feasible for basic use; keep max_tokens modest (e.g., ≤1024) and limit concurrent load.
  - 32 GB+: comfortable for longer outputs and larger batch/contexts; 64 GB+ if you frequently exploit long context windows.

### Getting the model (license & access)
- Accept Gemma terms on Hugging Face, then download. The linked repo is unquantized; quantize to Q4_0 with your preferred tool, or use a pre-quantized `mlx-community` variant if/when available. See model card for terms and details: [Gemma 3 model card](https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-unquantized).

### Run with MLX (text server)
```bash
# Start MLX (OpenAI-compatible) text server
poetry run python -m mlx_lm server \
  --model mlx-community/gemma-3-12b-it-q4_0 \
  --host 127.0.0.1 \
  --port 8080 \
  --max-tokens 2048 \
  --temp 0.5 \
  --top-p 0.9

# Health
curl -sS http://127.0.0.1:8080/v1/models | jq .

# Completion (MLX often implements /v1/completions, not /v1/chat/completions)
curl -sS -X POST http://127.0.0.1:8080/v1/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"mlx-community/gemma-3-12b-it-q4_0","prompt":"Say hello.","max_tokens":128}' | jq -r '.choices[0].text'
```

Notes
- Replace `mlx-community/gemma-3-12b-it-q4_0` with the actual model ID you install/convert; the HF link provides the unquantized QAT checkpoint.
- MLX servers usually do not implement OpenAI tool/function-calling; use Wooster’s answer-first prompt and the planned mlx-tools controller for tools.

### Wooster integration
- Routing env in `.env`:
```bash
ROUTING_ENABLED=true
ROUTING_LOCAL_ENABLED=true
ROUTING_LOCAL_SERVER_URL=http://127.0.0.1:8080
```
- Answer-first base prompt (already added): `prompts/base_system_prompt.txt` biases direct answers and uses tools only when needed.
- Tool use with MLX: enable the mlx-tools controller (once implemented) to parse JSON tool calls and execute via Wooster’s registry. Until then, explicitly ask for `web_search` if needed.

### Inference settings (assistant defaults)
- Temperature: 0.2–0.6 (0.3–0.5 typical). Lower for factual; higher for creative.
- Top-p: 0.9.
- Repetition penalty: 1.05–1.15 when long outputs get loopy.
- Max tokens: start 512–1024; increase with available RAM.
- System style: keep concise and directive; include “answer-first” guidance and minimal formatting rules.

### Prompting tips (Wooster)
- Answer-first: let the model answer directly unless the query mentions current/public info or project files.
- For RAG: phrase as “using the project notes, explain …” to increase retrieval-specific behavior.
- For tasks: give explicit, short action requests (“append to project journal”), then let tools do the operation.
- Few-shot: optional; short 1–2 example turns can stabilize style.

### Long context usage
- Gemma 3 advertises up to 128K context (model-card claim). Verify your server’s rope scaling and memory budget before pushing extreme context sizes.
- Prefer RAG over dumping huge context into the prompt; it’s faster and more controllable.

### Multimodality
- Gemma 3 family supports images in principle, but MLX text servers generally expose text-only endpoints today. Treat this as a text model unless you deploy an image-capable server.

### Safety and licensing
- Accept the Gemma license on HF before download and use.
- Add a safety preamble as needed (“avoid sensitive data; refuse unsafe tasks”).

### When to prefer Gemma 3 12B over smaller models
- You want better reasoning and instruction-following than 7–8B with acceptable local latency.
- You routinely ask multi-step questions, longer outputs, or multilingual tasks.
- You have ≥16–32 GB RAM and can keep the model warm.

### When to consider alternatives
- Tight memory/latency budgets → 3B/7B class (Qwen/Mistral/Llama 3.2 3B).
- Code-heavy sessions → coder-tuned variants (e.g., Qwen2.5-Coder) may be stronger.
- Heavy tool workflows → cloud models with native function-calling until mlx-tools is shipped.

### Known limitations with MLX
- No native OpenAI tool-calling (use controller loop in Wooster).
- Chat endpoint may be `/v1/completions` only; adapt client.
- Streaming/event endpoints may differ; verify before enabling streaming UI.

### Quick checklist for Wooster
- MLX server up on 127.0.0.1:8080 with gemma-3-12b Q4_0.
- `.env` routing set to local.
- `prompts/base_system_prompt.txt` present (answer-first).
- Tavily key configured if you want web_search.
- For tools with MLX, enable mlx-tools plugin (when implemented).

Source: [Gemma 3 12B IT QAT Q4_0 (unquantized) on Hugging Face](https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-unquantized)


