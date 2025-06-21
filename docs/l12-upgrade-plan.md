# Upgrade Plan: all-MiniLM-L6-v2 → all-MiniLM-L12-v2

## Overview
This plan outlines the step-by-step process to upgrade Wooster's local HuggingFace embedding model from L6 to L12 for better quality without breaking changes.

## Files Affected

### Core TypeScript Files (2 files)
1. **`src/memoryVector.ts`** - Core embedding service singleton
2. **`src/projectIngestor.ts`** - Legacy project ingestion embeddings

### Documentation Files (5 files)
1. **`docs/agent.md`** - Architecture documentation
2. **`docs/projects.md`** - Project system documentation  
3. **`docs/routing.md`** - Model routing documentation
4. **`docs/future-default-embed.md`** - Future embedding plans
5. **`docs/qwen3_embedding_migration.md`** - Migration documentation

### Dependencies
- **`src/plugins/userProfile/userProfileVectorStore.ts`** - Uses `getEmbeddingsModel()` from memoryVector.ts (no direct changes needed)

## Implementation Plan

### Phase 1: Code Changes (5 minutes)

#### Step 1: Update Core Embedding Service
**File**: `src/memoryVector.ts`  
**Line 15**: 
```typescript
// OLD
modelName: "Xenova/all-MiniLM-L6-v2",

// NEW  
modelName: "sentence-transformers/all-MiniLM-L12-v2",
```

#### Step 2: Update Project Ingestion
**File**: `src/projectIngestor.ts`  
**Line 93**:
```typescript
// OLD
const embeddings = new HuggingFaceTransformersEmbeddings({ modelName: 'Xenova/all-MiniLM-L6-v2' })

// NEW
const embeddings = new HuggingFaceTransformersEmbeddings({ modelName: 'sentence-transformers/all-MiniLM-L12-v2' })
```

### Phase 2: Testing (10 minutes)

#### Step 3: Functional Testing
```bash
# Start Wooster and test embedding functionality
pnpm run dev

# Test user profile operations
# - Add a user fact
# - Query user profile memory
# - Verify existing vector stores still load

# Test project ingestion
# - Create a new test project
# - Verify embedding generation works
```

#### Step 4: Performance Testing
```typescript
// Optional: Add timing to verify performance impact
console.time('embedding-generation');
const embeddings = await embeddingsModel.embedDocuments(['test text']);
console.timeEnd('embedding-generation');
```

### Phase 3: Documentation Updates (10 minutes)

#### Step 5: Update Architecture Documentation
**File**: `docs/agent.md`  
**Lines 39, 47**:
```markdown
# OLD
HuggingFaceTransformersEmbeddings → Xenova/all-MiniLM-L6-v2

# NEW
HuggingFaceTransformersEmbeddings → sentence-transformers/all-MiniLM-L12-v2
```

#### Step 6: Update Project Documentation  
**File**: `docs/projects.md`  
**Line 107**:
```markdown
# OLD
- **Embeddings**: `HuggingFaceTransformersEmbeddings` (`Xenova/all-MiniLM-L6-v2`).

# NEW
- **Embeddings**: `HuggingFaceTransformersEmbeddings` (`sentence-transformers/all-MiniLM-L12-v2`).
```

#### Step 7: Update Routing Documentation
**File**: `docs/routing.md`  
**Line 217**:
```markdown
# OLD
- `HuggingFaceTransformersEmbeddings` for memory vector (`Xenova/all-MiniLM-L6-v2`)

# NEW
- `HuggingFaceTransformersEmbeddings` for memory vector (`sentence-transformers/all-MiniLM-L12-v2`)
```

#### Step 8: Update Future Planning Documents
**File**: `docs/future-default-embed.md`  
**Lines 27, 28**:
```markdown
# OLD
User Profile/Memory:   HuggingFace all-MiniLM-L6-v2 (384-dim)  
Legacy Ingestion:      HuggingFace all-MiniLM-L6-v2 (384-dim)

# NEW
User Profile/Memory:   HuggingFace all-MiniLM-L12-v2 (384-dim)  
Legacy Ingestion:      HuggingFace all-MiniLM-L12-v2 (384-dim)
```

**File**: `docs/qwen3_embedding_migration.md`  
**Lines 18, 25, 107, 128**: Update references to reflect current L12 model

### Phase 4: Deployment & Monitoring (5 minutes)

#### Step 9: Commit Changes
```bash
git add src/memoryVector.ts src/projectIngestor.ts docs/
git commit -m 'feat: upgrade local embeddings to all-MiniLM-L12-v2

- Better embedding quality with same 384 dimensions
- No vector store migration required
- ~40% slower inference but irrelevant for user profile use case'
```

#### Step 10: Monitor First Use
- Watch for model download on first use (~33MB)
- Verify no errors in user profile operations
- Confirm existing vector stores load correctly

## Rollback Plan

If any issues arise, instant rollback:

```typescript
// In both files, change back to:
modelName: "Xenova/all-MiniLM-L6-v2",
```

No vector store changes needed due to same dimensions.

## Risk Assessment

### ✅ **Very Low Risk**
- Same 384 dimensions = no breaking changes
- Backward compatible with existing vector stores  
- Model change only affects new embeddings
- Easy instant rollback

### ⚠️ **Minor Considerations**
- First use will download new model (~33MB)
- ~40% slower embedding generation (irrelevant for user profile use case)
- Slightly higher memory usage (~33M vs 23M parameters)

## Success Criteria

- [ ] User profile operations work normally
- [ ] Existing vector stores load without errors
- [ ] New project ingestion completes successfully  
- [ ] No performance degradation noticeable to users
- [ ] Model downloads successfully on first use

## Expected Outcome

**Immediate benefits**: Better semantic understanding in user profile/memory operations with zero migration complexity.

**Timeline**: 30 minutes total (5 min code + 10 min testing + 10 min docs + 5 min deployment) 