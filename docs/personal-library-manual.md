# Personal Library Manual

Wooster's Personal Library system allows you to chat with your notes, projects, and documents using a hybrid retrieval system (Full-Text Search + Vector Embeddings). It is designed to work entirely locally (using MLX on Mac) or with cloud providers.

## 1. Setup & Configuration

### Environment Variables
Configure your `.env` file based on `.env.example`. Key variables:

```bash
# --- OpenAI vs Local ---
OPENAI_ENABLED=false # Set to false to force local models
ROUTING_LOCAL_ENABLED=true
ROUTING_LOCAL_SERVER_URL=http://127.0.0.1:8080

# --- Embeddings (Vector Search) ---
MLX_EMBEDDINGS_ENABLED=true
MLX_EMBEDDINGS_URL=http://127.0.0.1:8081/v1
MLX_EMBEDDINGS_MODEL=Qwen/Qwen3-Embedding-4B
```

### Local Servers (Mac/MLX)
1. **Chat Server:** Run your MLX-compatible chat server (e.g., `python -m mlx_lm.server ...`) on port 8080.
2. **Embedding Server:** Run the dedicated embedding server on port 8081.
   See `docs/local-embedding-guide.md` for setup instructions.

## 2. Managing Your Library

Wooster watches specific directories for Markdown files.

### Directory Structure
*   `notes/`: General notes, Zettelkasten, thoughts.
*   `projects/`: Project-specific documentation.
*   `gtd/`: Inbox and task lists.

### File Format
*   **Markdown:** `.md` files only.
*   **Frontmatter (Optional):**
    ```yaml
    ---
    id: my-unique-id (optional, UUID generated if missing)
    title: My Note Title
    tags: [ai, wooster, dev]
    aliases: [Project X, Secret Plan]
    ---
    ```
*   **Wikilinks:** `[[Note Name]]` syntax is supported and indexed.

### Ingestion
*   Wooster automatically watches these folders.
*   When you add or edit a file, it is re-parsed, hashed, and re-embedded automatically.
*   **Startup:** On startup, it scans all files and indexes changes.

## 3. Usage

### Chatting with your Library
You can ask Wooster naturally:
*   "What does *Shmoodly* mean?" (Triggers library search)
*   "Search my notes for 'project alpha status'"
*   "Recall what I wrote about React hooks"

### Agent Tools
The agent has access to:
*   `kb_query(query, scope?)`: Hybrid search.
*   `zk_create(title, body)`: Create new notes.
*   `webSearch(query)`: Search the internet (if enabled).

### Search Logic
Wooster uses a **Hybrid Search** strategy:
1.  **FTS (Full-Text Search):** Fast, exact keyword matching (SQLite FTS5).
2.  **Vector Search:** Semantic matching using embeddings (Local or OpenAI).
3.  **Results:** It merges and ranks results from both sources.

## 4. Troubleshooting

*   **Startup Banner:** Check the startup banner to confirm active Chat and Embedding models.
*   **Logs:** `wooster_session.log` contains detailed execution traces.
*   **Rebuilding:** If you change embedding models, you may need to delete `database/knowledge_base.sqlite3` (or the vector file) to re-index.

