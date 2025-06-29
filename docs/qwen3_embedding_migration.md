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
- **Vector Store**: MemoryVectorStore with OpenAI embeddings
- **Functionality**: `queryKnowledgeBase` searches the in-memory store for the active project.
- **Limitation**: Tied to OpenAI's ecosystem.

#### **User Profile & Memory Embeddings**
- **Model**: `HuggingFace Xenova/all-MiniLM-L6-v2` (384 dimensions)
- **Usage**: User profile vector store, persistent memory operations
- **Location**: `./vector_data/user_profile_store`
- **Files**: `src/memoryVector.ts`, `src/plugins/userProfile/userProfileVectorStore.ts`
- **Vector Store**: MemoryVectorStore with HuggingFace embeddings
- **Functionality**: Same RAG chain, but embeddings are generated locally.
- **Advantage**: No external API calls for embeddings, increased privacy, potentially lower cost.

#### **Legacy Project Ingestion**
- **Model**: `HuggingFace Xenova/all-MiniLM-L6-v2` (384 dimensions)
- **Usage**: Document processing during project creation/ingestion
- **Location**: In-memory during project creation
- **Files**: `src/projectIngestor.ts`
- **Vector Store**: MemoryVectorStore with HuggingFace embeddings
- **Functionality**: Same as above, just with a different model.
- **Advantage**: Higher quality embeddings than MiniLM.

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

## 2. Target Architecture: Plugin-Based Local Embeddings

### 2.1. Design Principles

**KISS**: Keep current embeddings as default, add local as optional plugin
**Modularity**: Route all local model functionality through existing local-model plugin  
**Maintainability**: No breaking changes, backwards compatible, contained complexity

### 2.2. Proposed Architecture

**Default Behavior (No Changes)**:
```
┌─────────────────────────────────────────┐
│           Current System                │
│   OpenAI embeddings + HuggingFace      │
│        (Works exactly as today)         │
└─────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
┌───────▼─────┐ ┌───▼────┐ ┌───▼──────┐
│Project      │ │User    │ │Legacy    │
│(OpenAI)     │ │Profile │ │Ingestion │
│1536-dim     │ │(HF)    │ │(HF)      │
└─────────────┘ │384-dim │ │384-dim   │
                └────────┘ └──────────┘
```

**With Local-Model Plugin Enabled**:
```
┌─────────────────────────────────────────┐
│         Local-Model Plugin              │
│  ┌─────────────┐ ┌─────────────────────┐ │
│  │ Qwen3 Chat  │ │ Qwen3-Embedding-4B  │ │
│  │   Server    │ │      Server         │ │
│  └─────────────┘ └─────────────────────┘ │
└─────────────────────────────────────────┘
                    │
              ┌─────┴──────┐
              │ Plugin     │
              │ Routing    │
              │ Logic      │
              └─────┬──────┘
        ┌───────────┼───────────┐
        │           │           │
┌───────▼─────┐ ┌───▼────┐ ┌───▼──────┐
│Project      │ │User    │ │Legacy    │
│(Qwen3)      │ │Profile │ │Ingestion │
│4096-dim     │ │(Qwen3) │ │(Qwen3)   │
└─────────────┘ │4096-dim│ │4096-dim  │
                └────────┘ └──────────┘
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

## 4. Implementation Strategy: Extend Local-Model Plugin

### 4.1. Plugin Architecture Benefits

**Leverage Existing Infrastructure**:
- Reuse existing `ModelRouterService` for embedding routing
- Extend current `local-model` plugin instead of creating new systems
- Follow established plugin patterns in Wooster

**Clean Separation of Concerns**:
- Default users: No changes, no complexity
- Local model users: All local functionality in one place
- Easy to enable/disable entire local model stack

### 4.2. Plugin Extension Points

#### **Extend: `src/plugins/local-model/index.ts`**
**Current**: Only handles chat model routing
**Add**: Embedding model routing and health checks

#### **Extend: `src/routing/ModelRouterService.ts`**  
**Current**: Routes chat models based on task
**Add**: Route embeddings based on provider configuration

#### **Add: Local Model Server Management**
**Option A**: MLX server for both chat + embeddings
**Option B**: Separate servers (chat on :8000, embeddings on :8001)
**Option C**: Unified server with multiple endpoints

### 4.3. Configuration Integration

**Extend existing local model config**:
```json
"routing": {
  "providers": {
    "local": {
      "enabled": false,
      "serverUrl": "http://localhost:8000",
      "models": {
        "chat": "mlx-community/Qwen2.5-7B-Instruct-4bit",
        "embedding": "Qwen/Qwen3-Embedding-4B"
      },
      "embeddings": {
        "enabled": false,
        "serverUrl": "http://localhost:8001",
        "fallbackToCloud": true
      }
    }
  }
}
```

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

### 7.1. Phase 1: Plugin Extension (Week 1)
- [ ] Extend `local-model` plugin with embedding support
- [ ] Add embedding routing to `ModelRouterService`
- [ ] Create embedding server health check system
- [ ] Update plugin configuration schema

### 7.2. Phase 2: Core Integration (Week 2)  
- [ ] Modify embedding factory functions to check local-model plugin
- [ ] Add fallback logic: local → cloud embeddings
- [ ] Update vector store initialization to use routed embeddings
- [ ] Test embedding routing with existing workflows

### 7.3. Phase 3: Optional Migration (Week 3)
- [ ] Create **optional** vector store migration utilities
- [ ] Allow users to choose: keep current or migrate to local
- [ ] Provide migration validation and rollback tools
- [ ] Document migration process and trade-offs

### 7.4. Phase 4: Documentation & Polish (Week 4)
- [ ] Update local-model plugin documentation
- [ ] Create setup guide for local embedding server
- [ ] Add configuration examples and troubleshooting
- [ ] Monitor plugin adoption and gather feedback

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

The **plugin-based approach** for local embeddings respects Wooster's core principles:

✅ **KISS (Keep It Simple)**:
- Default behavior unchanged - no complexity for existing users
- Local embeddings only added when explicitly enabled
- Leverages existing plugin architecture

✅ **Modularity**:
- All local model functionality contained in local-model plugin
- Clean separation between local and cloud embedding providers
- Easy to enable/disable entire local stack

✅ **Maintainability**:
- No breaking changes to existing codebase
- Reuses existing `ModelRouterService` infrastructure
- Optional migration - users choose when/if to switch
- Fallback mechanisms ensure system reliability

### **Recommended Approach**:

1. **Default**: Keep current mixed embedding architecture (OpenAI + HuggingFace)
2. **Optional**: Extend local-model plugin to support embeddings
3. **User Choice**: Allow gradual, project-by-project migration to local embeddings
4. **Fallback**: Always support cloud embeddings as backup

This approach minimizes risk, maximizes user choice, and maintains system stability while providing a clear path for users who want complete local model deployment. 

This is a summary of the directory structure under the old FaissStore implementation.
It is preserved here for historical reference.

```
.
├── faiss.index
└── docstore.json
```

The new system uses a single `vector_store.json` file per project, located in `vector_data/{projectName}/`. 