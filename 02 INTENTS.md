# Wooster Commands & Plugin Hooks Guide

Wooster uses a combination of built-in REPL commands and plugin hooks to deliver low-friction assistance. Unrecognized input falls back to the RAG chain over loaded project documents.

## 1. Built-in Project Commands

- **load project <name>**
  - Rebuilds Wooster's memory to only include files defined for `<name>` in `projects.json`.
  - Implementation: In `src/index.ts`, this pattern is matched and calls `createProjectStore(name)`, then `buildRagChain(apiKey, vectorStore)` to reload the RAG chain.

- **unload project**
  - Clears the current project context, resetting to no-project state.
  - Implementation: Re-initializes the FAISS store (`initVectorStore()`) and rebuilds the RAG chain.

## 2. Communication Commands (Plugins)

- **send (me )?an? email( that says)? <message>**
  - Queues `<message>` and, immediately after Wooster's next response, sends it via Gmail SMTP with OAuth2.
  - Implementation: `src/plugins/emailPlugin.ts` uses `onUserInput` to capture the pattern and `onAssistantResponse` to actually send the queued email.

## 3. Fallback Behavior (RAG Chain)

For all other inputs:
1. Pass through each plugin's `onUserInput` hook.
2. Append to SQLite memory and vector store via `upsertDocument`.
3. Invoke the RAG chain (`ragChain.invoke({ input })`) over the current project documents.
4. Append the response to memory and pass through `onAssistantResponse` hooks.
5. Print the assistant's answer.

## 4. Adding Custom Commands

- To add a new built-in command (no RAG): edit `src/index.ts` and insert before plugin pre-processing:
  ```ts
  if (/^my command$/i.test(input)) {
    // handle command
    rl.prompt()
    return
  }
  ```

- To hook into user or assistant text via plugins: create a file in `src/plugins/` exporting a `Plugin` with `onUserInput` and/or `onAssistantResponse`.

---

Wooster's lightweight command routing ensures that routine tasks stay snappy while deep lookups use powerful RAG over exactly the files you've loaded. 