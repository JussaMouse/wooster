# Wooster Projects UX Reference

Wooster treats each code/document collection as a named "project" you can load and unload on demand. This keeps its memory focused and your REPL snappy.

## 1. Project Catalog
- File: `projects.json` at the repository root.
- Maps project names to either:
  - A folder path (e.g. `"personal health": "HealthNotes"`)
  - A glob pattern (e.g. `"wooster": ["src/**/*.ts", "README.md"]`)
- Folder paths are auto-expanded to `folder/**/*` when loading.

Example `projects.json`:
```json
{
  "wooster": ["src/**/*.ts", "README.md"],
  "personal health": "HealthNotes"
}
```

## 2. Loading & Unloading Projects

- **load project <name>**
  1. In the REPL, this command is intercepted before any other processing.
  2. Calls `createProjectStore(name)` from `src/projectIngestor.ts`, which:
     - Reads the mapping from `projects.json`.
     - Converts folder paths to globs (e.g. `HealthNotes/**/*`).
     - Uses `fast-glob` to find matching files.
     - Splits and embeds documents with `HuggingFaceTransformersEmbeddings`.
     - Constructs a new FAISS store containing only those chunks.
  3. Rebuilds the RAG chain via `buildRagChain(apiKey, vectorStore)`.
  4. Prints `✅ Project "<name>" loaded.`

- **unload project**
  1. Resets Wooster to no-project state.
  2. Re-initializes the vector store (`initVectorStore()`) to an empty FAISS index.
  3. Rebuilds the RAG chain.
  4. Prints `✅ Project context cleared.`

## 3. Adding New Documents

1. Save or create your file inside the folder (or pattern path) defined for your project.
2. At the REPL prompt:
   ```bash
   > load project personal health
   ```
   Wooster will re-scan the directory—your new file will now be part of the project memory.

## 4. Example Interaction
```bash
> load project personal health
✅ Project "personal health" loaded.

> what does chapter 3 say?
Assistant: "In chapter 3, we discuss..."

> unload project
✅ Project context cleared.
```

## 5. Implementation Details
- **Catalog parser:** `src/projectIngestor.ts` → `createProjectStore(name)`
- **REPL hooks:** Inline in `src/index.ts` before plugin processing
- **Vector store:** `FaissStore` (local FAISS)
- **Embeddings:** `HuggingFaceTransformersEmbeddings` (`Xenova/all-MiniLM-L6-v2`)
- **File discovery:** `fast-glob` with `onlyFiles: true`

---
Keep your projects folder organized, and Wooster will only load what you need when you need it. This focused approach minimizes startup time and maximizes relevance. 