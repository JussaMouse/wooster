# Qwen3-Embedding-4B Migration Plan for Wooster

This document outlines the architecture and migration strategy for replacing Wooster's current embedding models with the local **Qwen3-Embedding-4B** model.

## 1. Current Embedding Architecture Analysis

### 1.1. Current Embedding Models in Use

Wooster currently uses **3 different embedding models** across different components:

#### **Project Knowledge Embeddings**
- **Model**: `OpenAI text-embedding-3-small` (1536 dimensions)
- **Usage**: Project document embeddings for RAG/knowledge base queries  
- **Location**: `projects/*/vectorStore/`
- **Files**: `src/projectStoreManager.ts`, `src/agentExecutorService.ts`
- **Vector Store**: FaissStore with OpenAI embeddings

#### **User Profile & Memory Embeddings**
- **Model**: `HuggingFace Xenova/all-MiniLM-L6-v2` (384 dimensions)
- **Usage**: User profile vector store, persistent memory operations
- **Location**: `./vector_data/user_profile_store`
- **Files**: `src/memoryVector.ts`, `src/plugins/userProfile/userProfileVectorStore.ts`
- **Vector Store**: FaissStore with HuggingFace embeddings

#### **Legacy Project Ingestion**
- **Model**: `HuggingFace Xenova/all-MiniLM-L6-v2` (384 dimensions)
- **Usage**: Document processing during project creation/ingestion
- **Location**: In-memory during project creation
- **Files**: `src/projectIngestor.ts`
- **Vector Store**: FaissStore with HuggingFace embeddings

### 1.2. Configuration Architecture

```typescript
// Current config structure
openai: {
  embeddingModelName: "text-embedding-3-small"
}

// Used in these files:
- config/default.json
- src/configLoader.ts (OpenAIConfig interface)
- src/projectStoreManager.ts (OpenAIEmbeddings)
- src/agentExecutorService.ts (OpenAIEmbeddings)
```

## 2. Target Architecture: Qwen3-Embedding-4B

### 2.1. Qwen3-Embedding-4B Specifications

- **Model**: `Qwen/Qwen3-Embedding-4B`
- **Dimensions**: 4096 (significantly larger than current models)
- **Context Length**: 32,768 tokens
- **Languages**: Multilingual support (English, Chinese, etc.)
- **Performance**: State-of-the-art embedding quality
- **Local Deployment**: Can run via MLX, vLLM, or custom server

### 2.2. Unified Embedding Architecture

Instead of 3 different embedding models, we'll use **Qwen3-Embedding-4B** for all embedding tasks:

```
┌─────────────────────────────────────────┐
│        Qwen3-Embedding-4B Server        │
│         (Local MLX/vLLM)                │
└─────────────────────────────────────────┘
                    │
                    │ HTTP API
                    │
┌─────────────────────────────────────────┐
│     EmbeddingRouterService              │
│   (Health checks, fallback logic)      │
└─────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
┌───────▼─────┐ ┌───▼────┐ ┌───▼──────┐
│Project      │ │User    │ │Legacy    │
│Knowledge    │ │Profile │ │Ingestion │
│Embeddings   │ │Memory  │ │          │
└─────────────┘ └────────┘ └──────────┘
```

## 3. Codebase Components to Replace

### 3.1. Core Embedding Services

#### **File: `src/memoryVector.ts`**
**Current**: 
```typescript
embeddingsModel = new HuggingFaceTransformersEmbeddings({
  modelName: "Xenova/all-MiniLM-L6-v2"
});
```
**Replace With**: Qwen3 embedding service client

#### **File: `src/projectStoreManager.ts`**
**Current**:
```typescript
initializeProjectVectorStore(
  projectName: string, 
  projectPath: string, 
  embeddingsInstance: OpenAIEmbeddings, // ← Replace this
  appConfig: AppConfig
)
```
**Replace With**: Generic `Embeddings` interface backed by Qwen3

#### **File: `src/projectIngestor.ts`**
**Current**:
```typescript
const embeddings = new HuggingFaceTransformersEmbeddings({ 
  modelName: 'Xenova/all-MiniLM-L6-v2' 
});
```
**Replace With**: Qwen3 embedding service client

#### **File: `src/agentExecutorService.ts`**
**Current**:
```typescript
let embeddingsInstance: OpenAIEmbeddings | null = null;
```
**Replace With**: Generic embedding interface

### 3.2. Plugin System Embeddings

#### **File: `src/plugins/userProfile/userProfileVectorStore.ts`**
**Current**: Uses `getEmbeddingsModel()` from `memoryVector.ts`
**Replace With**: Qwen3 embedding service via new abstraction layer

### 3.3. Configuration System

#### **File: `src/configLoader.ts`**
**Current**:
```typescript
export interface OpenAIConfig {
  embeddingModelName: string; // ← Remove dependency
}
```
**Add**:
```typescript
export interface EmbeddingConfig {
  provider: 'qwen3-local' | 'openai' | 'huggingface';
  qwen3?: {
    serverUrl: string;
    model: string;
    timeout?: number;
  };
}
```

#### **File: `config/default.json`**
**Current**:
```json
"openai": {
  "embeddingModelName": "text-embedding-3-small"
}
```
**Add**:
```json
"embeddings": {
  "provider": "qwen3-local",
  "qwen3": {
    "serverUrl": "http://localhost:8002",
    "model": "Qwen/Qwen3-Embedding-4B"
  }
}
```

## 4. New Components to Create

### 4.1. Qwen3 Embedding Server

#### **Server Implementation Options**

**Option A: MLX Server (macOS Apple Silicon)**
```bash
# MLX-based server for Apple Silicon
mlx_lm.server --model Qwen/Qwen3-Embedding-4B --port 8002
```

**Option B: vLLM Server (Linux/CUDA)**
```bash
# vLLM server for CUDA/ROCm
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3-Embedding-4B \
  --port 8002 \
  --embedding-mode
```

**Option C: Custom Python Server**
```python
# Custom server using transformers + FastAPI
# For maximum control and compatibility
```

### 4.2. Wooster Integration Components

#### **File: `src/embeddings/Qwen3EmbeddingService.ts`** (New)
- LangChain-compatible `Embeddings` class
- Health checks for Qwen3 server
- Batch processing optimization
- Error handling and fallbacks

#### **File: `src/embeddings/EmbeddingRouterService.ts`** (New)
- Route embedding requests to appropriate service
- Health monitoring for local Qwen3 server
- Fallback to cloud services when local unavailable
- Configuration-driven provider selection

#### **File: `src/embeddings/index.ts`** (New)
- Factory functions for creating embedding services
- Unified interface for all embedding operations
- Migration utilities for existing vector stores

## 5. Vector Store Migration Challenges

### 5.1. Dimension Mismatch Problem

**Critical Issue**: Existing vector stores use different dimensions:
- **Current OpenAI**: 1536 dimensions
- **Current HuggingFace**: 384 dimensions  
- **Qwen3-Embedding-4B**: 4096 dimensions

**Impact**: All existing vector stores must be **completely rebuilt**

### 5.2. Migration Strategy

#### **Phase 1: Parallel System**
1. Deploy Qwen3 embedding service alongside existing system
2. Create new vector stores with Qwen3 embeddings
3. Keep old vector stores as fallback
4. Allow gradual migration per project

#### **Phase 2: Bulk Migration**
1. Create migration script to rebuild all vector stores
2. Batch process all existing documents through Qwen3
3. Update vector store directory structure
4. Preserve metadata and project associations

#### **Phase 3: Cleanup**
1. Remove old vector stores after validation
2. Clean up legacy embedding service references
3. Update documentation and configuration

### 5.3. Storage Impact

**Current Storage (Example)**:
```
projects/my-project/vectorStore/
├── faiss.index        # 1536-dim OpenAI vectors
└── docstore.json      # Document metadata
```

**After Migration**:
```
projects/my-project/vectorStore/
├── faiss.index        # 4096-dim Qwen3 vectors (2.6x larger)
├── docstore.json      # Document metadata
└── migration.log      # Migration history
```

**Storage Increase**: ~2.6x size increase due to higher dimensions

## 6. Performance Considerations

### 6.1. Local Model Requirements

#### **Hardware Requirements**
- **RAM**: 8-16GB for Qwen3-Embedding-4B
- **Storage**: 8GB+ for model weights
- **Compute**: Apple Silicon M1+ or CUDA-compatible GPU recommended

#### **Performance Expectations**
- **Cold Start**: 30-60 seconds (model loading)
- **Inference**: 50-200ms per batch (depending on hardware)
- **Throughput**: 100-500 embeddings/second

### 6.2. Network Considerations

#### **Local Server Benefits**
- No API rate limits
- Complete privacy (no data leaves machine)
- No network dependency
- Consistent performance

#### **Fallback Strategy**
- Health check Qwen3 server before each operation
- Automatic fallback to OpenAI if local server down
- Graceful degradation with user notification

## 7. Implementation Phases

### 7.1. Phase 1: Infrastructure (Week 1)
- [ ] Deploy Qwen3-Embedding-4B local server
- [ ] Create `Qwen3EmbeddingService` class
- [ ] Add embedding configuration to config system
- [ ] Implement health checks and fallback logic

### 7.2. Phase 2: Integration (Week 2)  
- [ ] Replace embedding services in core modules
- [ ] Update project store manager
- [ ] Modify user profile embedding system
- [ ] Test compatibility with existing workflows

### 7.3. Phase 3: Migration (Week 3)
- [ ] Create vector store migration utilities
- [ ] Implement gradual migration strategy
- [ ] Rebuild critical project vector stores
- [ ] Validate embedding quality and performance

### 7.4. Phase 4: Production (Week 4)
- [ ] Switch default embedding provider to Qwen3
- [ ] Monitor performance and stability
- [ ] Clean up legacy embedding references
- [ ] Update documentation and user guides

## 8. Risk Assessment

### 8.1. High Risk Items
- **Vector Store Compatibility**: All existing embeddings invalidated
- **Performance Regression**: Local model may be slower than cloud APIs
- **Hardware Dependencies**: Requires significant local compute resources
- **Migration Complexity**: Complex data migration with potential for loss

### 8.2. Mitigation Strategies
- **Parallel Deployment**: Keep existing system running during migration
- **Automated Testing**: Comprehensive embedding quality tests
- **Rollback Plan**: Quick revert to OpenAI/HuggingFace if issues arise
- **Staged Migration**: Migrate projects one at a time with validation

## 9. Success Metrics

### 9.1. Performance Metrics
- **Embedding Quality**: Semantic similarity scores vs current system
- **Response Time**: <200ms average for embedding requests
- **Availability**: 99%+ uptime for local embedding service
- **Resource Usage**: <16GB RAM, <50% CPU during normal operation

### 9.2. User Experience Metrics
- **Migration Success Rate**: 100% successful vector store migrations
- **Feature Parity**: All existing embedding features work with Qwen3
- **Performance Satisfaction**: No noticeable degradation in search quality
- **Reliability**: Zero data loss during migration process

## 10. Conclusion

The migration to Qwen3-Embedding-4B represents a significant architectural change that will:

✅ **Benefits**:
- Complete local privacy for embeddings
- State-of-the-art embedding quality  
- No API rate limits or costs
- Unified embedding model across all use cases

⚠️ **Challenges**:
- Complete vector store rebuild required
- Significant hardware requirements
- Complex migration process
- Potential performance impact

The migration should be approached carefully with a phased rollout, comprehensive testing, and robust fallback mechanisms to ensure system stability throughout the transition. 