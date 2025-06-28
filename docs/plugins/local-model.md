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

## 12. Local Embedding Models Implementation Plan

### 12.1. Current Embedding Architecture in Wooster

Wooster currently uses **3 different embedding models** across different components:

#### **Project Knowledge Embeddings**
- **Model**: `OpenAI text-embedding-3-small` (1536 dimensions)
- **Usage**: Project document embeddings for RAG/knowledge base queries  
- **Location**: `projects/*/vectorStore/`
- **Files**: `src/projectStoreManager.ts`, `src/agentExecutorService.ts`

#### **User Profile & Memory Embeddings**
- **Model**: `HuggingFace sentence-transformers/all-MiniLM-L12-v2` (384 dimensions)
- **Usage**: User profile vector store, persistent memory operations
- **Location**: `./vector_data/user_profile_store`
- **Files**: `src/memoryVector.ts`, `src/plugins/userProfile/userProfileVectorStore.ts`

#### **Legacy Project Ingestion**
- **Model**: `HuggingFace sentence-transformers/all-MiniLM-L12-v2` (384 dimensions)
- **Usage**: Document processing during project creation/ingestion
- **Files**: `src/projectIngestor.ts`

### 12.2. Local Embedding Integration Strategy

#### **Design Principles**
1. **Independent Configuration**: Projects and user profile embeddings can be configured separately
2. **Plugin-Based**: All local embedding functionality lives in the local-model plugin
3. **Fallback Support**: Graceful degradation to cloud embeddings when local unavailable
4. **Zero Breaking Changes**: Default behavior unchanged, local embeddings are opt-in

#### **Target Architecture**
```typescript
// Enhanced configuration in config/default.json
"routing": {
  "providers": {
    "local": {
      "enabled": false,
      "serverUrl": "http://localhost:8000",
      "models": {
        "chat": "mlx-community/Qwen2.5-7B-Instruct-4bit",
        "embedding": "BAAI/bge-large-en-v1.5"
      },
      "embeddings": {
        "enabled": false,
        "serverUrl": "http://localhost:8001", // Separate embedding server
        "projects": {
          "enabled": false,
          "model": "BAAI/bge-large-en-v1.5",
          "dimensions": 1024,
          "fallbackToCloud": true
        },
        "userProfile": {
          "enabled": false, 
          "model": "sentence-transformers/all-MiniLM-L12-v2",
          "dimensions": 384,
          "fallbackToCloud": true
        }
      }
    }
  }
}
```

### 12.3. Implementation Plan

#### **Phase 1: Core Infrastructure (Week 1)**

##### **Step 1: Extend LocalModelClient for Embeddings**
**File**: `src/routing/LocalModelClient.ts`
```typescript
// Add embedding support to existing LocalModelClient
export class LocalModelClient {
  // ... existing chat methods ...

  /**
   * Generate embeddings using local model
   */
  async generateEmbeddings(texts: string[], options?: {
    model?: string;
    normalize?: boolean;
  }): Promise<number[][]> {
    const payload = {
      model: options?.model || this.embeddingModel,
      input: texts,
      normalize: options?.normalize ?? true
    };
    
    const res = await axios.post(`${this.embeddingServerUrl}/v1/embeddings`, payload, { 
      timeout: this.timeout 
    });
    
    if (res.status === 200 && res.data?.data) {
      return res.data.data.map((item: any) => item.embedding);
    }
    throw new Error('Local embedding generation failed');
  }

  /**
   * Health check for embedding server
   */
  async isEmbeddingServerHealthy(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.embeddingServerUrl}/health`, { 
        timeout: this.timeout 
      });
      return res.status === 200 && res.data?.status === 'ok';
    } catch (err) {
      return false;
    }
  }
}
```

##### **Step 2: Create Local Embedding Service**
**File**: `src/plugins/local-model/LocalEmbeddingService.ts` (new)
```typescript
import { Embeddings } from '@langchain/core/embeddings';
import { LocalModelClient } from '../../routing/LocalModelClient';
import { log, LogLevel } from '../../logger';

export class LocalEmbeddingService extends Embeddings {
  private client: LocalModelClient;
  private model: string;
  private dimensions: number;
  private fallbackService?: Embeddings;

  constructor(options: {
    client: LocalModelClient;
    model: string;
    dimensions: number;
    fallbackService?: Embeddings;
  }) {
    super();
    this.client = options.client;
    this.model = options.model;
    this.dimensions = options.dimensions;
    this.fallbackService = options.fallbackService;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    try {
      // Check if local embedding server is healthy
      const isHealthy = await this.client.isEmbeddingServerHealthy();
      if (!isHealthy) {
        throw new Error('Local embedding server unavailable');
      }

      const embeddings = await this.client.generateEmbeddings(texts, {
        model: this.model
      });
      
      log(LogLevel.DEBUG, `Generated ${embeddings.length} embeddings locally using ${this.model}`);
      return embeddings;
      
    } catch (error) {
      log(LogLevel.WARN, `Local embedding failed: ${error.message}, falling back to cloud`);
      
      if (this.fallbackService) {
        return await this.fallbackService.embedDocuments(texts);
      }
      throw error;
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    const embeddings = await this.embedDocuments([text]);
    return embeddings[0];
  }
}
```

##### **Step 3: Extend ModelRouterService for Embeddings**
**File**: `src/routing/ModelRouterService.ts`
```typescript
export class ModelRouterService {
  // ... existing properties ...
  
  // New embedding routing properties
  private projectEmbeddingService: Embeddings | null = null;
  private userProfileEmbeddingService: Embeddings | null = null;

  constructor(config: AppConfig) {
    // ... existing initialization ...
    
    // Initialize embedding services if local embeddings enabled
    this.initializeEmbeddingServices();
  }

  private initializeEmbeddingServices(): void {
    const embeddingConfig = this.routingConfig.providers.local?.embeddings;
    if (!embeddingConfig?.enabled) return;

    // Initialize project embeddings
    if (embeddingConfig.projects?.enabled) {
      const fallback = new OpenAIEmbeddings({
        modelName: this.config.openai.embeddingModelName,
        openAIApiKey: this.config.openai.apiKey
      });

      this.projectEmbeddingService = new LocalEmbeddingService({
        client: this.localModelClient!,
        model: embeddingConfig.projects.model,
        dimensions: embeddingConfig.projects.dimensions,
        fallbackService: embeddingConfig.projects.fallbackToCloud ? fallback : undefined
      });
    }

    // Initialize user profile embeddings  
    if (embeddingConfig.userProfile?.enabled) {
      const fallback = new HuggingFaceTransformersEmbeddings({
        modelName: "sentence-transformers/all-MiniLM-L12-v2"
      });

      this.userProfileEmbeddingService = new LocalEmbeddingService({
        client: this.localModelClient!,
        model: embeddingConfig.userProfile.model,
        dimensions: embeddingConfig.userProfile.dimensions,
        fallbackService: embeddingConfig.userProfile.fallbackToCloud ? fallback : undefined
      });
    }
  }

  /**
   * Get embedding service for project knowledge
   */
  getProjectEmbeddingService(): Embeddings {
    return this.projectEmbeddingService || new OpenAIEmbeddings({
      modelName: this.config.openai.embeddingModelName,
      openAIApiKey: this.config.openai.apiKey
    });
  }

  /**
   * Get embedding service for user profile/memory
   */
  getUserProfileEmbeddingService(): Embeddings {
    return this.userProfileEmbeddingService || new HuggingFaceTransformersEmbeddings({
      modelName: "sentence-transformers/all-MiniLM-L12-v2"
    });
  }
}
```

#### **Phase 2: Integration Points (Week 2)**

##### **Step 4: Update Project Store Manager**
**File**: `src/projectStoreManager.ts`
```typescript
// Replace direct OpenAI embedding instantiation
import { ModelRouterService } from './routing/ModelRouterService';

export async function initializeProjectVectorStore(
  projectName: string, 
  projectPath: string, 
  embeddings: OpenAIEmbeddings, // Keep for backward compatibility
  appConfig: AppConfig
): Promise<FaissStore> {
  // Use router service if available, otherwise use provided embeddings
  const routerService = ModelRouterService.getInstance();
  const embeddingService = routerService ? 
    routerService.getProjectEmbeddingService() : 
    embeddings;

  // ... rest of function uses embeddingService instead of embeddings
}
```

##### **Step 5: Update Memory Vector Service**
**File**: `src/memoryVector.ts`
```typescript
import { ModelRouterService } from './routing/ModelRouterService';

let embeddingsModel: Embeddings | null = null;

export function getEmbeddingsModel(): Embeddings {
  if (!embeddingsModel) {
    // Try to use local model router first
    const routerService = ModelRouterService.getInstance();
    if (routerService) {
      embeddingsModel = routerService.getUserProfileEmbeddingService();
    } else {
      // Fallback to current HuggingFace model
      embeddingsModel = new HuggingFaceTransformersEmbeddings({
        modelName: "sentence-transformers/all-MiniLM-L12-v2",
      });
    }
  }
  return embeddingsModel;
}
```

##### **Step 6: Update Project Ingestion**
**File**: `src/projectIngestor.ts`
```typescript
// Update to use router service
import { ModelRouterService } from './routing/ModelRouterService';

export async function ingestProjectDocuments(
  projectPath: string,
  projectName: string
): Promise<void> {
  const routerService = ModelRouterService.getInstance();
  const embeddings = routerService ? 
    routerService.getUserProfileEmbeddingService() :
    new HuggingFaceTransformersEmbeddings({ 
      modelName: 'sentence-transformers/all-MiniLM-L12-v2' 
    });

  // ... rest of function uses embeddings service
}
```

#### **Phase 3: Local Embedding Server Setup (Week 3)**

##### **Step 7: Python Embedding Server**
**File**: `scripts/embedding_server.py` (new)
```python
#!/usr/bin/env python3
"""
Local embedding server for Wooster
Provides OpenAI-compatible embedding API using local models
"""

import asyncio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import torch
from sentence_transformers import SentenceTransformer
import uvicorn
import os
from pathlib import Path

app = FastAPI(title="Wooster Local Embedding Server")

# Model cache
models = {}

class EmbeddingRequest(BaseModel):
    input: List[str]
    model: str
    normalize: Optional[bool] = True

class EmbeddingResponse(BaseModel):
    data: List[dict]
    model: str
    usage: dict

@app.get("/health")
async def health_check():
    return {"status": "ok", "models_loaded": list(models.keys())}

@app.post("/v1/embeddings")
async def create_embeddings(request: EmbeddingRequest):
    try:
        # Load model if not cached
        if request.model not in models:
            models[request.model] = SentenceTransformer(request.model)
        
        model = models[request.model]
        
        # Generate embeddings
        embeddings = model.encode(
            request.input,
            normalize_embeddings=request.normalize,
            convert_to_tensor=False
        )
        
        # Format response to match OpenAI API
        data = []
        for i, embedding in enumerate(embeddings):
            data.append({
                "object": "embedding",
                "index": i,
                "embedding": embedding.tolist()
            })
        
        return EmbeddingResponse(
            data=data,
            model=request.model,
            usage={
                "prompt_tokens": sum(len(text.split()) for text in request.input),
                "total_tokens": sum(len(text.split()) for text in request.input)
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("EMBEDDING_SERVER_PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

##### **Step 8: Server Management Script**
**File**: `scripts/start_embedding_server.sh` (new)
```bash
#!/bin/bash
# Start local embedding server for Wooster

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMBEDDING_PORT=${EMBEDDING_SERVER_PORT:-8001}
MODELS_DIR=${LOCAL_EMBEDDING_MODELS_DIR:-"$HOME/.cache/wooster_embeddings"}

echo "🚀 Starting Wooster Local Embedding Server..."
echo "   Port: $EMBEDDING_PORT"
echo "   Models cache: $MODELS_DIR"

# Create models directory
mkdir -p "$MODELS_DIR"

# Set environment variables
export TRANSFORMERS_CACHE="$MODELS_DIR"
export SENTENCE_TRANSFORMERS_HOME="$MODELS_DIR"
export EMBEDDING_SERVER_PORT="$EMBEDDING_PORT"

# Check if Python environment exists
if [ ! -d "$SCRIPT_DIR/../.venv" ]; then
    echo "⚠️  Python virtual environment not found. Setting up..."
    python3 -m venv "$SCRIPT_DIR/../.venv"
    source "$SCRIPT_DIR/../.venv/bin/activate"
    pip install fastapi uvicorn sentence-transformers torch
else
    source "$SCRIPT_DIR/../.venv/bin/activate"
fi

# Start server
echo "🔥 Server starting on http://localhost:$EMBEDDING_PORT"
python "$SCRIPT_DIR/embedding_server.py"
```

#### **Phase 4: Configuration & Documentation (Week 4)**

##### **Step 9: Update Configuration Schema**
**File**: `src/configLoader.ts`
```typescript
export interface LocalEmbeddingConfig {
  enabled: boolean;
  serverUrl: string;
  projects: {
    enabled: boolean;
    model: string;
    dimensions: number;
    fallbackToCloud: boolean;
  };
  userProfile: {
    enabled: boolean;
    model: string;
    dimensions: number;
    fallbackToCloud: boolean;
  };
}

export interface LocalProviderConfig {
  enabled: boolean;
  serverUrl: string;
  autoStart: boolean;
  models: Record<string, string>;
  modelsDir?: string;
  healthCheckInterval?: number;
  embeddings?: LocalEmbeddingConfig; // Add embedding config
}
```

##### **Step 10: Update Plugin Registration**
**File**: `src/plugins/local-model/index.ts`
```typescript
export default class LocalModelPlugin implements Plugin {
  // ... existing properties ...

  async initialize(): Promise<void> {
    // ... existing initialization ...

    // Initialize embedding services if enabled
    const embeddingConfig = this.config.routing?.providers?.local?.embeddings;
    if (embeddingConfig?.enabled) {
      await this.initializeEmbeddingServices();
    }
  }

  private async initializeEmbeddingServices(): Promise<void> {
    const embeddingConfig = this.config.routing!.providers.local!.embeddings!;
    
    log(LogLevel.INFO, 'LocalModelPlugin: Initializing local embedding services');
    
    // Health check embedding server
    const client = new LocalModelClient({
      serverUrl: embeddingConfig.serverUrl,
      model: 'dummy', // Not used for embeddings
      timeout: 5000
    });

    const isHealthy = await client.isEmbeddingServerHealthy();
    if (!isHealthy) {
      log(LogLevel.WARN, 'LocalModelPlugin: Embedding server not available, will use fallback');
    } else {
      log(LogLevel.INFO, 'LocalModelPlugin: Local embedding server is healthy');
    }
  }

  getAgentTools(): DynamicTool[] {
    const tools = [...this.baseTools];

    // Add embedding management tools
    if (this.config.routing?.providers?.local?.embeddings?.enabled) {
      tools.push(
        this.createEmbeddingHealthCheckTool(),
        this.createEmbeddingModelListTool()
      );
    }

    return tools;
  }

  private createEmbeddingHealthCheckTool(): DynamicTool {
    return new DynamicTool({
      name: "check_local_embedding_health",
      description: "Check if local embedding server is running and healthy",
      func: async () => {
        // Implementation for health check
        return "Local embedding server status: healthy";
      }
    });
  }

  private createEmbeddingModelListTool(): DynamicTool {
    return new DynamicTool({
      name: "list_embedding_models",
      description: "List available local embedding models",
      func: async () => {
        // Implementation for model listing
        return "Available embedding models: BAAI/bge-large-en-v1.5, sentence-transformers/all-MiniLM-L12-v2";
      }
    });
  }
}
```

### 12.4. Recommended Embedding Models

#### **For Project Knowledge (High Quality)**
- **BAAI/bge-large-en-v1.5** (1024 dimensions)
  - Excellent for document retrieval
  - Good balance of quality vs. size
  - Widely used and well-tested

- **sentence-transformers/all-mpnet-base-v2** (768 dimensions)
  - High quality semantic understanding
  - Good for diverse document types

#### **For User Profile/Memory (Efficiency)**
- **sentence-transformers/all-MiniLM-L12-v2** (384 dimensions)
  - Current model, proven performance
  - Fast inference, low memory usage
  - Good for personal data embeddings

- **BAAI/bge-small-en-v1.5** (384 dimensions)
  - Alternative to MiniLM with potentially better quality
  - Similar dimensions for easy migration

### 12.5. Migration Strategy

#### **Dimension Compatibility**
- **User Profile**: Keep 384 dimensions (no migration needed)
- **Projects**: Support both 1536 (OpenAI) and 1024 (local) dimensions
- **New Projects**: Use local embeddings by default when enabled
- **Existing Projects**: Keep current embeddings, optional migration

#### **Gradual Migration Approach**
1. **Phase 1**: New projects use local embeddings
2. **Phase 2**: Provide migration tool for existing projects
3. **Phase 3**: User choice on per-project basis
4. **Phase 4**: Optional bulk migration utility

### 12.6. Performance Considerations

#### **Local Embedding Server Performance**
- **Cold Start**: 10-30 seconds (model loading)
- **Inference**: 10-100ms per batch (depending on model size)
- **Memory Usage**: 1-4GB (depending on model)
- **Throughput**: 500-2000 embeddings/second

#### **Resource Requirements**
- **CPU**: Modern multi-core processor (Apple Silicon preferred)
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 2-8GB for model weights
- **Network**: Not required once models downloaded

### 12.7. Configuration Examples

#### **Basic Local Embeddings (User Profile Only)**
```json
{
  "routing": {
    "providers": {
      "local": {
        "enabled": true,
        "embeddings": {
          "enabled": true,
          "serverUrl": "http://localhost:8001",
          "userProfile": {
            "enabled": true,
            "model": "sentence-transformers/all-MiniLM-L12-v2",
            "dimensions": 384,
            "fallbackToCloud": true
          }
        }
      }
    }
  }
}
```

#### **Full Local Embeddings (Projects + User Profile)**
```json
{
  "routing": {
    "providers": {
      "local": {
        "enabled": true,
        "embeddings": {
          "enabled": true,
          "serverUrl": "http://localhost:8001",
          "projects": {
            "enabled": true,
            "model": "BAAI/bge-large-en-v1.5",
            "dimensions": 1024,
            "fallbackToCloud": true
          },
          "userProfile": {
            "enabled": true,
            "model": "sentence-transformers/all-MiniLM-L12-v2", 
            "dimensions": 384,
            "fallbackToCloud": true
          }
        }
      }
    }
  }
}
```

#### **Privacy-First Configuration (No Fallback)**
```json
{
  "routing": {
    "providers": {
      "local": {
        "enabled": true,
        "embeddings": {
          "enabled": true,
          "serverUrl": "http://localhost:8001",
          "projects": {
            "enabled": true,
            "model": "BAAI/bge-large-en-v1.5",
            "dimensions": 1024,
            "fallbackToCloud": false
          },
          "userProfile": {
            "enabled": true,
            "model": "sentence-transformers/all-MiniLM-L12-v2",
            "dimensions": 384,
            "fallbackToCloud": false
          }
        }
      }
    }
  }
}
```

### 12.8. Benefits of Local Embeddings

#### **Privacy & Security**
- **Complete Privacy**: No document content sent to external APIs
- **Data Sovereignty**: All embeddings generated and stored locally
- **Compliance**: Easier to meet data protection requirements
- **Offline Capability**: Works without internet connection

#### **Cost & Performance**
- **No API Costs**: Unlimited embedding generation
- **Consistent Performance**: No network latency or rate limits
- **Batch Processing**: Efficient bulk document processing
- **Custom Models**: Option to fine-tune models for specific domains

#### **Control & Flexibility**
- **Model Choice**: Select optimal models for specific use cases
- **Version Control**: Pin specific model versions
- **Custom Configuration**: Tune parameters for specific needs
- **Independent Scaling**: Scale embedding generation independently

---

*This document provides a comprehensive overview of local MLX integration options. Implementation will begin with the OpenAI-compatible server approach for fastest time-to-value, with expansion to more advanced features based on user needs and feedback.* 

# Local Model Plugin

The Local Model Plugin enables Wooster to route chat requests and embeddings to locally running models instead of cloud APIs. This provides enhanced privacy, cost control, and offline capabilities.

## Features

- **Chat Model Routing**: Route conversations to local MLX, Ollama, or other local language models
- **Local Embeddings**: Use local embedding models for projects and user profiles  
- **Health Monitoring**: Track status and performance of local model services
- **Graceful Fallbacks**: Automatically fall back to cloud services when local models are unavailable
- **Zero Configuration**: Works out of the box with sensible defaults

## Quick Start

1. **Enable the plugin** in your Wooster configuration
2. **Start your local model server** (see guides below)
3. **Configure routing** to use local models
4. **Enjoy private, local AI** with Wooster

## Configuration

### Basic Configuration

Add to your `config/default.json`:

```json
{
  "routing": {
    "providers": {
      "local": {
        "enabled": true,
        "chat": {
          "baseURL": "http://localhost:8080",
          "model": "mlx-community/Llama-3.2-3B-Instruct-4bit"
        },
        "embeddings": {
          "enabled": true,
          "projects": {
            "enabled": true,
            "model": "sentence-transformers/all-mpnet-base-v2",
            "dimensions": 768
          },
          "userProfile": {
            "enabled": true,
            "model": "sentence-transformers/all-mpnet-base-v2", 
            "dimensions": 768
          }
        }
      }
    }
  }
}
```

### Privacy-First Configuration

For maximum privacy, route everything locally:

```json
{
  "routing": {
    "defaultProvider": "local",
    "providers": {
      "local": {
        "enabled": true,
        "chat": {
          "baseURL": "http://localhost:8080",
          "model": "mlx-community/Llama-3.2-3B-Instruct-4bit"
        },
        "embeddings": {
          "enabled": true,
          "projects": {
            "enabled": true,
            "model": "sentence-transformers/all-mpnet-base-v2",
            "dimensions": 768
          },
          "userProfile": {
            "enabled": true,
            "model": "sentence-transformers/all-mpnet-base-v2",
            "dimensions": 768
          }
        }
      }
    }
  }
}
```

## Local Server Setup Guides

### Option 1: MLX Chat Server (Recommended for macOS)

MLX provides excellent performance on Apple Silicon Macs.

#### Installation

```bash
# Install MLX LM
pip install mlx-lm

# Or with conda
conda install -c conda-forge mlx-lm
```

#### Running the Server

**Same Machine as Wooster:**
```bash
# Start MLX server on localhost
mlx_lm.server \
  --model mlx-community/Llama-3.2-3B-Instruct-4bit \
  --host 127.0.0.1 \
  --port 8080 \
  --max-tokens 2048
```

**Different Machine (Network Access):**
```bash
# Start MLX server accessible from network
mlx_lm.server \
  --model mlx-community/Llama-3.2-3B-Instruct-4bit \
  --host 0.0.0.0 \
  --port 8080 \
  --max-tokens 2048

# Update Wooster config to point to the server:
# "baseURL": "http://YOUR_SERVER_IP:8080"
```

#### Recommended Models

**Small & Fast (2-4GB RAM):**
- `mlx-community/Llama-3.2-1B-Instruct-4bit`
- `mlx-community/Qwen2.5-3B-Instruct-4bit`

**Balanced (6-8GB RAM):**
- `mlx-community/Llama-3.2-3B-Instruct-4bit` 
- `mlx-community/Qwen2.5-7B-Instruct-4bit`

**High Quality (12-16GB RAM):**
- `mlx-community/Llama-3.1-8B-Instruct-4bit`
- `mlx-community/Qwen2.5-14B-Instruct-4bit`

### Option 2: Ollama (Cross-Platform)

Ollama provides easy model management across platforms.

#### Installation

```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows: Download from https://ollama.ai/download
```

#### Running the Server

**Same Machine as Wooster:**
```bash
# Start Ollama (runs on localhost:11434 by default)
ollama serve

# Pull and run a model
ollama pull llama3.2:3b
ollama run llama3.2:3b
```

**Wooster Configuration for Ollama:**
```json
{
  "routing": {
    "providers": {
      "local": {
        "chat": {
          "baseURL": "http://localhost:11434/v1",
          "model": "llama3.2:3b"
        }
      }
    }
  }
}
```

### Option 3: Local Embedding Server

For projects that need local embeddings, you can run a dedicated embedding server.

> **📖 Complete Setup Guide**: See [Local Embedding Server Setup Guide](../local-embedding-server-setup.md) for detailed installation, configuration, and troubleshooting instructions.

#### Quick Start

```bash
# Install dependencies
pip install fastapi uvicorn sentence-transformers torch

# Create and run the server (see full guide for complete code)
python embedding_server.py

# Server will be available at http://localhost:8081
```

#### Wooster Configuration

```json
{
  "routing": {
    "providers": {
      "local": {
        "embeddings": {
          "enabled": true,
          "baseURL": "http://localhost:8081/v1",
          "projects": {
            "enabled": true,
            "model": "sentence-transformers/all-mpnet-base-v2",
            "dimensions": 768
          }
        }
      }
    }
  }
}
```

## Performance Recommendations

### Hardware Requirements

**Minimum (Chat Only):**
- 8GB RAM
- 4 CPU cores
- Apple Silicon M1+ or modern x64 CPU

**Recommended (Chat + Embeddings):**
- 16GB RAM  
- 8 CPU cores
- Apple Silicon M2+ or modern x64 CPU with AVX2

**Optimal (Multiple Models):**
- 32GB RAM
- 12+ CPU cores
- Apple Silicon M3+ or modern x64 CPU with AVX-512

### Model Selection Guide

**For Chat Models:**

| Use Case | Model | RAM | Quality | Speed |
|----------|-------|-----|---------|-------|
| Quick responses | Llama-3.2-1B | 2-3GB | Good | Very Fast |
| Balanced | Llama-3.2-3B | 4-6GB | Very Good | Fast |
| High quality | Llama-3.1-8B | 12-16GB | Excellent | Moderate |

**For Embedding Models:**

| Model | Dimensions | RAM | Quality | Speed |
|-------|------------|-----|---------|-------|
| all-MiniLM-L6-v2 | 384 | ~100MB | Good | Very Fast |
| all-MiniLM-L12-v2 | 384 | ~130MB | Very Good | Fast |
| all-mpnet-base-v2 | 768 | ~440MB | Excellent | Moderate |

## Troubleshooting

### Common Issues

**"Connection refused" errors:**
- Check if the server is running: `curl http://localhost:8080/health`
- Verify the port matches your configuration
- Ensure firewall isn't blocking the port

**"Model not found" errors:**
- Verify the model name is correct
- Check if the model is downloaded (for Ollama: `ollama list`)
- Ensure sufficient disk space for model downloads

**Slow performance:**
- Reduce model size or use quantized versions
- Increase system RAM
- Use faster storage (SSD vs HDD)
- Close other memory-intensive applications

**Out of memory errors:**
- Use smaller models or quantized versions
- Reduce batch sizes in server configuration
- Increase system swap/virtual memory

### Health Monitoring

The local-model plugin provides health checking tools:

```bash
# Check if local models are responding
pnpm run dev -- --plugin local-model --action health-check

# View local model status
pnpm run dev -- --plugin local-model --action status
```

## Security Considerations

### Network Security

**Same Machine (Recommended):**
- Use `127.0.0.1` or `localhost` for maximum security
- No network exposure
- Fastest performance

**Network Access:**
- Use `0.0.0.0` only when necessary
- Consider VPN or private networks
- Add authentication if exposing to internet
- Use HTTPS in production

### Data Privacy

**Local Processing Benefits:**
- No data sent to external APIs
- Complete control over model and data
- Compliance with strict privacy requirements
- Offline operation capability

## Advanced Configuration

### Multiple Model Instances

Run different models for different use cases:

```bash
# Terminal 1: Fast model for quick responses
mlx_lm.server --model mlx-community/Llama-3.2-1B-Instruct-4bit --port 8080

# Terminal 2: High-quality model for complex tasks  
mlx_lm.server --model mlx-community/Llama-3.1-8B-Instruct-4bit --port 8081

# Terminal 3: Embedding server
python embedding_server.py --port 8082
```

### Load Balancing

For high-throughput scenarios, run multiple instances:

```bash
# Instance 1
mlx_lm.server --model llama-3.2-3b --port 8080 &

# Instance 2  
mlx_lm.server --model llama-3.2-3b --port 8081 &

# Use a load balancer or configure Wooster to round-robin
```

### Docker Deployment

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  mlx-server:
    image: mlx-community/mlx-server:latest
    ports:
      - "8080:8080"
    environment:
      - MODEL=mlx-community/Llama-3.2-3B-Instruct-4bit
    volumes:
      - ./models:/models
    
  embedding-server:
    build: .
    ports:
      - "8081:8081"
    environment:
      - MODEL=sentence-transformers/all-mpnet-base-v2
```

## Integration Examples

### TypeScript/JavaScript

```typescript
// Test local chat model
const response = await fetch('http://localhost:8080/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'llama-3.2-3b',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});

// Test local embeddings
const embeddings = await fetch('http://localhost:8081/v1/embeddings', {
  method: 'POST', 
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    input: 'Test text for embedding',
    model: 'sentence-transformers/all-mpnet-base-v2'
  })
});
```

### Python

```python
import requests

# Test chat model
response = requests.post('http://localhost:8080/v1/chat/completions', json={
    'model': 'llama-3.2-3b',
    'messages': [{'role': 'user', 'content': 'Hello!'}]
})

# Test embeddings
embeddings = requests.post('http://localhost:8081/v1/embeddings', json={
    'input': 'Test text for embedding',
    'model': 'sentence-transformers/all-mpnet-base-v2'
})
```

## Best Practices

1. **Start Small**: Begin with smaller models and scale up based on needs
2. **Monitor Resources**: Keep an eye on RAM, CPU, and disk usage
3. **Test Thoroughly**: Verify model responses meet your quality requirements
4. **Plan for Fallbacks**: Always configure cloud fallbacks for reliability
5. **Update Regularly**: Keep models and servers updated for security and performance
6. **Document Configuration**: Maintain clear documentation of your local setup

## Support

For issues with the local-model plugin:
1. Check the troubleshooting section above
2. Review Wooster logs for error messages
3. Test local servers independently before integration
4. Consult the Wooster documentation for configuration help

For model-specific issues:
- **MLX**: [MLX Community](https://github.com/ml-explore/mlx)
- **Ollama**: [Ollama Documentation](https://ollama.ai/docs)
- **Sentence Transformers**: [Sentence Transformers Documentation](https://www.sbert.net/) 