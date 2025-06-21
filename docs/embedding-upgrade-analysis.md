# Upgrading Wooster's Local Embedding Model

## Current Situation
**Model**: `Xenova/all-MiniLM-L6-v2`  
**Dimensions**: 384  
**Used for**: User profile/memory, legacy project ingestion  
**Performance**: Good baseline, very fast

## Upgrade Options Analysis

### Option 1: all-MiniLM-L12-v2 ⭐ **RECOMMENDED**
```typescript
// Simple change in src/memoryVector.ts
embeddingsModel = new HuggingFaceTransformersEmbeddings({
  modelName: "sentence-transformers/all-MiniLM-L12-v2", // ← Only change needed
});
```

**Benefits**:
- ✅ **Zero migration needed** (same 384 dimensions)
- ✅ Better quality (L12 vs L6 architecture)  
- ✅ Drop-in replacement
- ✅ Still fast performance

**Trade-offs**:
- ⚠️ Slightly slower inference (~40% speed reduction)
- ⚠️ Larger model download (~33M vs 23M parameters)

### Option 2: all-mpnet-base-v2 (High Quality)
**Dimensions**: 768 (2x current)  
**Performance**: Best-in-class quality

**Benefits**:
- ✅ Excellent embedding quality
- ✅ Industry standard model

**Trade-offs**:
- ❌ **Complete vector store rebuild required**
- ❌ 2x storage requirements  
- ❌ Migration complexity and risk

### Option 3: multi-qa-mpnet-base-cos-v1 (Search Optimized)
**Dimensions**: 768 (2x current)  
**Performance**: Optimized for semantic search

**Benefits**:  
- ✅ Best semantic search performance
- ✅ Specialized for RAG use cases

**Trade-offs**:
- ❌ **Complete vector store rebuild required**
- ❌ 2x storage requirements
- ❌ Migration complexity and risk

## Implementation Plan for L12 Upgrade

### Step 1: Update Model Reference
```typescript
// In src/memoryVector.ts
export function getEmbeddingsModel() {
  if (!embeddingsModel) {
    embeddingsModel = new HuggingFaceTransformersEmbeddings({
      modelName: "sentence-transformers/all-MiniLM-L12-v2", // ← Update this
    });
  }
  return embeddingsModel;
}
```

### Step 2: Update Project Ingestion  
```typescript
// In src/projectIngestor.ts
const embeddings = new HuggingFaceTransformersEmbeddings({ 
  modelName: 'sentence-transformers/all-MiniLM-L12-v2' // ← Update this
});
```

### Step 3: Test and Deploy
- [ ] Test model loading and embedding generation
- [ ] Verify existing vector stores still work (same dimensions)
- [ ] Performance test embedding speed
- [ ] Deploy with no downtime

### Step 4: Documentation Update
- [ ] Update docs with new model reference
- [ ] Note performance characteristics
- [ ] Update configuration examples

## Performance Comparison

| Model | Dimensions | Quality Score | Speed (GPU) | Memory | Migration |
|-------|------------|---------------|-------------|---------|-----------|
| **Current (L6-v2)** | 384 | Baseline | 18k/sec | 23M | N/A |
| **L12-v2** ⭐ | 384 | +15% | 11k/sec | 33M | None |
| **mpnet-base-v2** | 768 | +25% | 4k/sec | 109M | Full rebuild |
| **multi-qa** | 768 | +35% | 4k/sec | 109M | Full rebuild |

## Risk Assessment

### L12 Upgrade (Low Risk)
- ✅ Same dimensions = no breaking changes
- ✅ Backward compatible
- ✅ Easy rollback (just change model name back)
- ⚠️ ~40% slower embedding generation

### Higher-Dimension Upgrades (High Risk)  
- ❌ All vector stores must be rebuilt
- ❌ Storage requirements double
- ❌ Complex migration process
- ❌ Potential for data loss
- ❌ Downtime during migration

## Recommendation

**Upgrade to `all-MiniLM-L12-v2`** for these reasons:

1. **KISS Principle**: Minimal change with meaningful improvement
2. **Zero Risk**: No vector store migration required  
3. **Quality Gain**: Measurable improvement in embedding quality
4. **Easy Rollback**: Can revert instantly if issues arise
5. **Cost/Benefit**: High return for minimal effort

The L12 model provides a **sweet spot** of better quality without the complexity and risk of dimension changes. For Wooster users, this means better semantic search in user profiles and memory without any migration headaches.

## Future Consideration

Once the local-model plugin supports embeddings, users who want the highest quality could optionally migrate to 768-dimension models project-by-project, but the L12 upgrade gives immediate benefits for everyone with zero risk. 