# 🚀 Qwen2.5-72B MLX Chat Server Setup

Complete guide to run Qwen2.5-72B-Instruct with MLX as an OpenAI-compatible server for Wooster.

## 📋 Prerequisites

- **Apple Silicon Mac** (M1/M2/M3/M4)
- **64GB+ RAM recommended** (32GB minimum for 4bit)
- **Poetry** for dependency management
- **Stable network** for model download

## 🛠️ Installation

### 1. Install MLX Dependencies

```bash
# Add MLX to your Poetry project
poetry add mlx mlx-lm requests

# Update pyproject.toml if needed
poetry add mlx mlx-lm --group mlx
```

### 2. Choose Your Model Quantization

| Quantization | RAM Usage | Quality | Speed |
|--------------|-----------|---------|-------|
| **4bit** | ~40GB | Good | Fast |
| **6bit** | ~60GB | Better | Medium |
| **8bit** | ~80GB | Best | Slower |

**Recommendation**: Start with 4bit, upgrade if you have the RAM.

## 🚀 Quick Start

### Option 1: Direct MLX Server

```bash
# Start 4bit server (most compatible)
poetry run python -m mlx_lm server \
  --model mlx-community/Qwen2.5-72B-Instruct-4bit \
  --port 8080 \
  --host 127.0.0.1 \
  --max-tokens 4096

# Or 8bit for better quality (if you have 80GB+ RAM)
poetry run python -m mlx_lm server \
  --model mlx-community/Qwen2.5-72B-Instruct-8bit \
  --port 8080 \
  --host 127.0.0.1
```

### Option 2: Enhanced Script (Recommended)

```bash
# Default 4bit
poetry run python chat_server.py

# 6bit quantization
poetry run python chat_server.py 6bit

# 8bit quantization
poetry run python chat_server.py 8bit
```

## ⚙️ Wooster Configuration

Add this to your Wooster configuration:

```json
{
  "routing": {
    "providers": {
      "local": {
        "chat": {
          "enabled": true,
          "baseURL": "http://127.0.0.1:8080/v1",
          "model": "qwen2.5-72b-instruct",
          "supportsStreaming": true,
          "apiKey": "not-required"
        }
      }
    }
  }
}
```

### Alternative Wooster Provider Config

```json
{
  "providers": {
    "mlx-local": {
      "type": "openai",
      "baseURL": "http://127.0.0.1:8080/v1",
      "models": {
        "qwen2.5-72b": {
          "id": "qwen2.5-72b-instruct",
          "maxTokens": 32768,
          "supportsStreaming": true,
          "supportsFunctions": true
        }
      }
    }
  }
}
```

## 🧪 Testing the Server

### 1. Health Check

```bash
curl http://127.0.0.1:8080/health
```

### 2. List Available Models

```bash
curl http://127.0.0.1:8080/v1/models
```

### 3. Test Chat Completion

```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5-72b-instruct",
    "messages": [
      {"role": "user", "content": "Hello! Can you help me with coding?"}
    ],
    "max_tokens": 100,
    "temperature": 0.7
  }'
```

### 4. Test Streaming

```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5-72b-instruct",
    "messages": [
      {"role": "user", "content": "Write a Python hello world"}
    ],
    "max_tokens": 150,
    "stream": true
  }'
```

## 📊 Performance & Memory

### Expected Performance
- **First run**: 20-40GB download + model loading (5-10 minutes)
- **Subsequent runs**: 2-5 minutes loading
- **Inference speed**: 15-50 tokens/second (depends on quantization)
- **Memory usage**: Stable after warmup

### Memory Monitoring

```bash
# Monitor memory usage
watch -n 1 'ps aux | grep mlx_lm | grep -v grep'

# Or use Activity Monitor to watch Python processes
```

## 🔧 Troubleshooting

### Common Issues

1. **Out of Memory**
   ```bash
   # Try lower quantization
   poetry run python chat_server.py 4bit
   ```

2. **Model Download Fails**
   ```bash
   # Pre-download manually
   poetry run python -c "
   from mlx_lm import load
   load('mlx-community/Qwen2.5-72B-Instruct-4bit')
   "
   ```

3. **Server Won't Start**
   ```bash
   # Check if port is in use
   lsof -i :8080
   
       # Use different port
    poetry run python -m mlx_lm server --port 8081 --model mlx-community/Qwen2.5-72B-Instruct-4bit
   ```

4. **Slow Performance**
   - Ensure no other heavy processes running
   - Check available RAM with Activity Monitor
   - Consider using 4bit quantization

### Advanced Tuning

```bash
# Custom server parameters
poetry run python -m mlx_lm server \
  --model mlx-community/Qwen2.5-72B-Instruct-4bit \
  --port 8080 \
  --max-tokens 8192 \
  --temp 0.7 \
  --top-p 0.9 \
  --repetition-penalty 1.1
```

## 🎯 Integration Tips

### For Wooster
1. **Start server before Wooster**
2. **Use 127.0.0.1** (not localhost) for better compatibility
3. **Enable streaming** for better UX
4. **Set reasonable timeouts** (30-60 seconds)

### OpenAI Compatibility
- Supports `/v1/chat/completions`
- Supports `/v1/models`  
- Supports streaming with `"stream": true`
- Function calling available (experimental)

## 📈 Scaling Options

### Multiple Models
```bash
# Run embedding server on 8081
poetry run python embed-server.py &

# Run chat server on 8080  
poetry run python chat_server.py &
```

### Production Setup
```bash
# Use tmux for persistent sessions
tmux new-session -d -s mlx-chat 'poetry run python chat_server.py'

# View logs
tmux attach -t mlx-chat
```

## 🔗 Related Services

- **Embeddings**: Port 8081 (embed-server.py)
- **Chat**: Port 8080 (chat_server.py)
- **Wooster**: Configure to use both services

## 📚 Model Information

**Qwen2.5-72B-Instruct** features:
- **Context Length**: 32,768 tokens
- **Training**: Instruction-tuned for chat
- **Languages**: English, Chinese, and 27+ others
- **Capabilities**: Code, math, reasoning, function calling
- **License**: Tongyi Qianwen (commercial friendly)

---

**🎉 You're ready to run Qwen2.5-72B locally with Wooster!** 