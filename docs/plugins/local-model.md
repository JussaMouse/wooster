# Plugin: Local MLX Models Integration

This document outlines the approaches for integrating local MLX (Apple Silicon) language models into Wooster, providing AI capabilities without external API dependencies.

## 1. Overview

- **Plugin Name**: `LocalMLX` (future implementation)
- **Version**: TBD
- **Provider**: `src/plugins/localMLX/index.ts` (planned)
- **Purpose**: This plugin enables Wooster to leverage local MLX-optimized language models running on Apple Silicon (M1/M2/M3/M4) Macs. It provides AI capabilities for chat, text generation, code assistance, and task processing while maintaining privacy and reducing external API costs.

## 2. MLX Model Ecosystem Overview

### 2.1. Supported Models
Based on the MLX community ecosystem, Wooster can integrate with:

#### Recommended Models by Use Case:

**General Purpose (Balanced Performance/Memory)**
- `mlx-community/Mistral-7B-Instruct-v0.3-4bit` (~4GB RAM)
- `mlx-community/Qwen2.5-7B-Instruct-4bit` (~4.5GB RAM)
- `mlx-community/Llama-3.1-8B-Instruct-4bit` (~5GB RAM)

**Lightweight/Fast Response**
- `mlx-community/Qwen2.5-3B-Instruct-4bit` (~2GB RAM)
- `mlx-community/gemma-2-2b-it-4bit` (~1.5GB RAM)

**Coding/Development Tasks**
- `mlx-community/Qwen2.5-Coder-7B-Instruct-4bit`
- `mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit`

**Vision Tasks (Future)**
- `mlx-community/Llava-v1.6-mistral-7b-hf-4bit`
- `mlx-community/qwen2-vl-7b-instruct-4bit`

### 2.2. Memory Requirements
- **8GB Mac**: Limited to 3B parameter models or smaller
- **16GB Mac**: Can run 7B models comfortably  
- **32GB+ Mac**: Can run larger models or multiple models simultaneously

## 3. Integration Approaches

### 3.1. Approach A: OpenAI-Compatible Server (Recommended)

**Description**: Run MLX models as a local server that mimics OpenAI's API, allowing seamless integration with existing OpenAI client code.

**Advantages**:
- Minimal code changes to existing Wooster infrastructure
- Standardized API interface
- Easy model switching
- Familiar debugging and monitoring

**Implementation**:
```bash
# Start MLX server (OpenAI API compatible)
mlx_lm.server --model mlx-community/Mistral-7B-Instruct-v0.3-4bit --port 8000
```

**Wooster Integration**:
- Modify `src/configLoader.ts` to support local endpoint
- Update OpenAI client configuration to point to `http://localhost:8000`
- Add fallback logic (local → OpenAI API if local unavailable)

### 3.2. Approach B: Python Bridge Service

**Description**: Create a dedicated Python service that handles MLX model interactions, communicating with Wooster via REST API or IPC.

**Advantages**:
- Dedicated Python environment for MLX
- Better resource management
- Isolated model processes
- Advanced MLX features accessible

**Architecture**:
```
Wooster (Node.js/TypeScript) 
    ↕ HTTP/WebSocket
Python MLX Service
    ↕ MLX Library
Local Models
```

### 3.3. Approach C: Child Process Integration

**Description**: Spawn Python MLX processes directly from Node.js as needed for specific tasks.

**Advantages**:
- Direct process control
- On-demand model loading
- Resource efficiency

**Disadvantages**:
- Model loading overhead per request
- Complex error handling
- Process management complexity

### 3.4. Approach D: WebAssembly Integration (Future)

**Description**: Use WebAssembly builds of MLX models for direct browser/Node.js integration.

**Status**: Experimental - awaiting MLX WebAssembly support

## 4. Recommended Architecture: Hybrid Approach

### 4.1. Primary: OpenAI-Compatible Server
Use MLX server for most AI interactions:

```typescript
// Enhanced OpenAI client configuration
const aiClient = new OpenAI({
  baseURL: config.localMLX?.enabled 
    ? 'http://localhost:8000/v1' 
    : 'https://api.openai.com/v1',
  apiKey: config.localMLX?.enabled 
    ? 'local-key' 
    : config.openai.apiKey
});
```

### 4.2. Fallback: External APIs
Maintain OpenAI/Anthropic API support for:
- Model unavailability
- Complex reasoning tasks requiring larger models
- Internet-dependent queries

### 4.3. Specialized: Direct MLX Integration
For specific high-performance use cases:
- Real-time streaming responses
- Custom model fine-tuning
- Advanced MLX features

## 5. Configuration & Setup

### 5.1. Environment Variables

```bash
# Plugin Activation
PLUGIN_LOCALMLX_ENABLED=true

# Local MLX Configuration
TOOLS_LOCALMLX_ENABLED=true
LOCALMLX_SERVER_URL=http://localhost:8000
LOCALMLX_DEFAULT_MODEL=mlx-community/Mistral-7B-Instruct-v0.3-4bit
LOCALMLX_MAX_TOKENS=2048
LOCALMLX_TEMPERATURE=0.7

# Fallback Configuration
LOCALMLX_FALLBACK_TO_OPENAI=true
LOCALMLX_AUTO_START_SERVER=true

# Model Management
LOCALMLX_MODELS_DIR=/Users/{username}/.cache/mlx_models
LOCALMLX_AUTO_DOWNLOAD=true
LOCALMLX_QUANTIZATION=4bit
```

### 5.2. Python Environment Setup

**Prerequisites**:
- Python 3.11+ (via pyenv)
- Poetry for dependency management
- Apple Silicon Mac (M1/M2/M3/M4)

**Quick Setup**:
```bash
# Install Python environment tools
brew install pyenv
curl -sSL https://install.python-poetry.org | python3 -

# Create MLX environment
mkdir ~/.wooster-mlx
cd ~/.wooster-mlx
pyenv local 3.11.10
poetry init --no-interaction
poetry add mlx-lm fastapi uvicorn
poetry install
```

### 5.3. Model Download & Management

```bash
# Auto-download on first use
poetry run mlx_lm.generate --model mlx-community/Mistral-7B-Instruct-v0.3-4bit --prompt "test"

# Or pre-download models
poetry run python -c "
from mlx_lm import load
load('mlx-community/Mistral-7B-Instruct-v0.3-4bit')
"
```

## 6. Tools Provided (Planned)

### 6.1. Core AI Tools
- **`local_chat`**: Chat interface using local MLX models
- **`local_generate`**: Text generation for various tasks
- **`local_code_assist`**: Code completion and assistance
- **`local_summarize`**: Document and content summarization

### 6.2. Model Management Tools
- **`list_local_models`**: Show available local models
- **`download_model`**: Download new MLX models
- **`switch_model`**: Change active model
- **`model_status`**: Show model performance and memory usage

### 6.3. Hybrid Tools
- **`intelligent_route`**: Route queries to best available model (local vs. API)
- **`batch_process`**: Process multiple items locally for efficiency

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. Set up Python MLX environment
2. Create OpenAI-compatible server wrapper
3. Basic Wooster integration with fallback logic
4. Configuration system implementation

### Phase 2: Core Features (Week 3-4)
1. Model management tools
2. Streaming response support
3. Error handling and recovery
4. Performance monitoring

### Phase 3: Advanced Features (Week 5-6)
1. Multi-model support
2. Custom prompt templates
3. Fine-tuning integration
4. Vision model support (if applicable)

### Phase 4: Optimization (Week 7-8)
1. Memory optimization
2. Response caching
3. Load balancing
4. Production hardening

## 8. Performance Considerations

### 8.1. Model Loading
- **Cold Start**: 5-30 seconds depending on model size
- **Warm Responses**: 50-500ms for typical queries
- **Memory Usage**: 2-8GB depending on model

### 8.2. Optimization Strategies
- Keep models loaded in memory
- Use model quantization (4-bit recommended)
- Implement response caching
- Batch similar requests

### 8.3. Resource Management
- Monitor memory usage
- Implement graceful degradation
- Auto-restart on memory issues
- Queue management for multiple requests

## 9. Security & Privacy

### 9.1. Advantages
- **Complete Privacy**: No data leaves local machine
- **No API Costs**: Unlimited usage without external charges
- **Offline Capability**: Works without internet connection
- **Data Control**: Full control over model versions and updates

### 9.2. Considerations
- **Model Source Trust**: Verify MLX community models
- **Local Security**: Protect model files and cache
- **Resource Limits**: Prevent resource exhaustion attacks

## 10. Troubleshooting

### 10.1. Common Issues

**Q: MLX server won't start**
- Check Python environment: `poetry env info`
- Verify Apple Silicon: `python -c "import platform; print(platform.machine())"`
- Test MLX: `python -c "import mlx.core as mx; print(mx.metal.is_available())"`

**Q: Model download fails**
- Check internet connection
- Verify disk space (models are 2-8GB each)
- Check Hugging Face connectivity

**Q: High memory usage**
- Switch to smaller quantized models (4-bit)
- Monitor with Activity Monitor
- Restart MLX server periodically

**Q: Slow responses**
- Ensure model is fully loaded (check logs)
- Verify no memory swapping occurring
- Consider smaller model for faster responses

### 10.2. Performance Tuning

**Memory Optimization**:
```bash
# Use smaller quantization
LOCALMLX_QUANTIZATION=4bit

# Limit context length
LOCALMLX_MAX_TOKENS=1024

# Enable model offloading
LOCALMLX_OFFLOAD_INACTIVE=true
```

**Response Speed**:
```bash
# Pre-warm models
LOCALMLX_PRELOAD_MODELS=true

# Use streaming responses
LOCALMLX_STREAM_RESPONSES=true

# Cache frequent responses
LOCALMLX_ENABLE_CACHE=true
```

## 11. Future Enhancements

### 11.1. Advanced Features
- **Multi-Modal Support**: Vision + text models
- **Custom Fine-Tuning**: Train models on Wooster data
- **Model Ensemble**: Combine multiple models for better results
- **Distributed Processing**: Use multiple Macs in network

### 11.2. Integration Improvements
- **Smart Routing**: Auto-select best model for task type
- **Cost Optimization**: Balance local vs. API usage
- **Performance Learning**: Adapt based on usage patterns
- **User Preferences**: Personalized model selection

### 11.3. Ecosystem Integration
- **Plugin Marketplace**: Share custom model configurations
- **Community Models**: Wooster-optimized model variants
- **Benchmark Suite**: Performance testing across models
- **Update Management**: Automated model updates and testing

---

*This document provides a comprehensive overview of local MLX integration options. Implementation will begin with the OpenAI-compatible server approach for fastest time-to-value, with expansion to more advanced features based on user needs and feedback.* 