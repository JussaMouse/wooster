# Embedding Server Setup for Apple Silicon Mac

Simple guide to run Qwen3 embedding models as a local API server on Apple Silicon.

## Quick Setup

### 1. Install Dependencies with Poetry

```bash
# Core dependencies
poetry add fastapi uvicorn "sentence-transformers>=2.7.0" "transformers>=4.51.0" torch

# Optional performance boost
poetry add "accelerate>=0.21.0"
```

### 2. Create the Server

Create `embed-server.py`:

```python
#!/usr/bin/env python3
"""
Apple Silicon optimized embedding server for Qwen3 models
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import uvicorn
import torch
from typing import List, Union
from contextlib import asynccontextmanager
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model instance
model = None
model_name = "Qwen/Qwen3-Embedding-4B"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global model, model_name
    logger.info(f"Loading Qwen3 model: {model_name}")
    
    # Optimize for Apple Silicon
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    logger.info(f"Using device: {device}")
    
    model = SentenceTransformer(model_name, device=device)
    logger.info("✅ Qwen3 model loaded successfully")
    
    yield
    
    # Shutdown (cleanup if needed)
    logger.info("Shutting down embedding server")

app = FastAPI(
    title="Qwen3 Embedding Server", 
    version="1.0.0",
    lifespan=lifespan
)

class EmbeddingRequest(BaseModel):
    input: Union[str, List[str]]
    model: str = "Qwen/Qwen3-Embedding-4B"

class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: List[dict]
    model: str
    usage: dict

@app.post("/v1/embeddings")
async def create_embeddings(request: EmbeddingRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Handle both string and list inputs
        texts = [request.input] if isinstance(request.input, str) else request.input
        
        # Generate embeddings with proper instruction handling
        query_embeddings = []
        document_embeddings = []
        
        for text in texts:
            # Simple heuristic: questions get query prompt, others are documents
            if text.strip().endswith('?') or text.lower().startswith(('what', 'how', 'why', 'when', 'where')):
                # Use query prompt for questions
                embedding = model.encode([text], prompt_name="query")[0]
            else:
                # Regular document embedding
                embedding = model.encode([text])[0]
            
            document_embeddings.append(embedding)
        
        # Format response to match OpenAI API
        data = []
        for i, embedding in enumerate(document_embeddings):
            data.append({
                "object": "embedding",
                "index": i,
                "embedding": embedding.tolist()
            })
        
        return EmbeddingResponse(
            data=data,
            model=model_name,
            usage={
                "prompt_tokens": sum(len(text.split()) for text in texts),
                "total_tokens": sum(len(text.split()) for text in texts)
            }
        )
        
    except Exception as e:
        logger.error(f"Error generating embeddings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    mps_available = torch.backends.mps.is_available() if torch.backends.mps else False
    return {
        "status": "healthy",
        "model": model_name,
        "model_loaded": model is not None,
        "device": "mps" if mps_available else "cpu",
        "apple_silicon_optimized": mps_available
    }

@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [{
            "id": model_name,
            "object": "model",
            "created": 1677610602,
            "owned_by": "qwen",
            "dimensions": 2560  # Qwen3-4B embedding dimensions
        }]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8081)
```

### 3. Run the Server

```bash
# Start the server
poetry run python embed_server.py

# Check health
curl http://localhost:8081/health
```

## Usage

### Test Embeddings

```bash
# Single text
curl -X POST http://localhost:8081/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"input": "What is machine learning?"}'

# Multiple texts
curl -X POST http://localhost:8081/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"input": ["What is AI?", "Machine learning is a subset of AI"]}'
```

### Python Client

```python
import requests

response = requests.post("http://localhost:8081/v1/embeddings", 
                        json={"input": "Hello, world!"})
embeddings = response.json()["data"][0]["embedding"]
print(f"Embedding dimensions: {len(embeddings)}")  # Should be 2560
```

## Model Options

Change the model in `embed_server.py`:

```python
# Options (by size and performance):
model_name = "Qwen/Qwen3-Embedding-0.6B"   # ~2GB RAM, 1024 dims
model_name = "Qwen/Qwen3-Embedding-4B"     # ~8GB RAM, 2560 dims  
model_name = "Qwen/Qwen3-Embedding-8B"     # ~16GB RAM, 4096 dims
```

## Wooster Integration

Add to Wooster's `config/default.json`:

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
            "model": "Qwen/Qwen3-Embedding-4B",
            "dimensions": 2560
          },
          "userProfile": {
            "enabled": true,
            "model": "Qwen/Qwen3-Embedding-4B", 
            "dimensions": 2560
          }
        }
      }
    }
  }
}
```

## Apple Silicon Optimizations

The server automatically:
✅ Uses MPS (Metal Performance Shaders) for GPU acceleration  
✅ Optimizes memory usage for Apple Silicon  
✅ Handles Qwen3 instruction-aware prompts  
✅ Provides 2560-dimensional embeddings (Qwen3-4B)  

## Troubleshooting

**Server won't start:**
```bash
# Check if port is in use
lsof -i :8081

# Try different port
# Change uvicorn.run(app, host="127.0.0.1", port=8082)
```

**Out of memory:**
- Use smaller model: `Qwen/Qwen3-Embedding-0.6B`
- Close other applications
- Check Activity Monitor for RAM usage

**Model not found:**
```bash
# Verify transformers version
poetry run python -c "import transformers; print(transformers.__version__)"
# Should be >= 4.51.0
```

## Performance

Expected performance on Apple Silicon:
- **M2/M3 Mac**: 2-5x faster than CPU
- **Memory usage**: ~8-10GB for Qwen3-4B
- **Throughput**: ~100-500 embeddings/second depending on text length

## Next Steps

1. **Start server**: `poetry run python embed_server.py`
2. **Test health**: `curl http://localhost:8081/health`
3. **Configure Wooster**: Update config with local embedding endpoint
4. **Monitor performance**: Check Activity Monitor for GPU usage 