# Plugin: Comput3

This document details the `comput3` plugin, which integrates GPU workload management and inference via Comput3 into Wooster.

## 1. Overview

- **Plugin Name**: `comput3`
- **Version**: `1.0.0` (planned)
- **Provider**: `src/plugins/comput3/index.ts` (planned)
- **Purpose**: Manage Comput3 GPU workloads (launch, list, stop), query account/profile, verify token power-ups, and interact with models hosted on running nodes (list models, text generation, image analysis). Also supports the free/premium inference API for completions.

> Cost note: Private workloads cost approximately $1/hour. Consider configuring an auto-shutdown policy.

## 2. Tools Provided

The `comput3` plugin will provide the following agent tools:

- **`comput3_api_status`**
  - **Description**: Check if the Comput3 API is operational.
  - **Endpoint**: GET `https://api.comput3.ai/api/v0/`

- **`comput3_get_types`**
  - **Description**: List available workload types you can launch.
  - **Endpoint**: GET `https://api.comput3.ai/api/v0/types`

- **`comput3_launch_workload`**
  - **Description**: Launch a GPU workload.
  - **Input**: `{ type: string, expires?: number }`
  - **Endpoint**: POST `https://api.comput3.ai/api/v0/launch`
  - **Example**:
    ```json
    {
      "type": "ollama_webui:large",
      "expires": 1744829999
    }
    ```

- **`comput3_list_workloads`**
  - **Description**: List workloads (optionally only running ones).
  - **Input**: `{ running?: boolean }`
  - **Endpoint**: POST `https://api.comput3.ai/api/v0/workloads`
  - **Example**:
    ```json
    {
      "running": true
    }
    ```

- **`comput3_stop_workload`**
  - **Description**: Stop a running workload.
  - **Input**: `{ workload: string }`
  - **Endpoint**: POST `https://api.comput3.ai/api/v0/stop`
  - **Example**:
    ```json
    {
      "workload": "00cf404b-bd80-4fa4-a305-f6403a277c31"
    }
    ```

- **`comput3_get_balance`**
  - **Description**: Retrieve your account balance.
  - **Endpoint**: GET `https://api.comput3.ai/api/v0/balance`

- **`comput3_get_profile`**
  - **Description**: Retrieve your user profile.
  - **Endpoint**: GET `https://api.comput3.ai/api/v0/profile`

- **`comput3_verify_tag`**
  - **Description**: Verify ownership of a token/tag (for API key power-ups).
  - **Input**: `{ tag: string }`
  - **Endpoint**: POST `https://api.comput3.ai/api/v0/verify_tag`
  - **Example**:
    ```json
    {
      "tag": "token:ai16z"
    }
    ```

- **`comput3_list_models_on_node`**
  - **Description**: List models available on a specific node index (after launching a workload).
  - **Input**: `{ nodeIndex: number }`
  - **Endpoint**: GET `https://app.comput3.ai/{index}/api/tags`

- **`comput3_generate`**
  - **Description**: Generate text or analyze images on a running node.
  - **Input**: `{ nodeIndex: number, model: string, prompt: string, images?: string[], stream?: boolean }`
  - **Endpoint**: POST `https://app.comput3.ai/{index}/api/generate`
  - **Examples**:
    - Text generation:
      ```json
      {
        "nodeIndex": 0,
        "model": "llama3:70b",
        "prompt": "Are you an LLM? Respond with yes or no",
        "stream": false
      }
      ```
    - Vision analysis:
      ```json
      {
        "nodeIndex": 0,
        "model": "llama3.2-vision:11b",
        "prompt": "Describe this picture in detail.",
        "images": ["<Base64 Encoded Image>"],
        "stream": false
      }
      ```

- **`comput3_completion`**
  - **Description**: Call the free/premium inference API for completions.
  - **Input**: `{ model: "llama3:70b" | "hermes3:70b", prompt: string }`
  - **Endpoint**: POST `https://api.comput3.ai/v1/completions`
  - **Notes**: `llama3:70b` is free; `hermes3:70b` requires sufficient token holdings (e.g., AI16Z, SOL, Sendcoin, OPUS).
  - **Example**:
    ```json
    {
      "model": "llama3:70b",
      "prompt": "Are you an LLM? Respond with yes or no"
    }
    ```

## 3. Configuration & Setup

For the `comput3` plugin to function, configure the following in Wooster's config (loaded by `configLoader.ts`). These keys will be added under `config.comput3` when the plugin is implemented.

### 3.1. Plugin Activation

- Set `config.plugins.comput3` to `false` to disable. If not set to `false`, the plugin will load when present.

### 3.2. Credentials and Settings

- `config.comput3.apiBaseUrl` (string, default `https://api.comput3.ai`)
- `config.comput3.appBaseUrl` (string, default `https://app.comput3.ai`)
- `config.comput3.apiKey` (string, required for v0 workload APIs)
  - Used as header `X-C3-API-KEY: <apiKey>`
- `config.comput3.inferenceApiKey` (string, required for v1 inference API)
  - Used as header `Authorization: Bearer <inferenceApiKey>`
- `config.comput3.defaultWorkloadType` (string, optional) e.g., `ollama_webui:large`
- `config.comput3.defaultNodeIndex` (number, optional) e.g., `0`
- `config.comput3.autoShutdownMinutes` (number, optional) e.g., `60`

Environment variable mappings (planned additions to `config/custom-environment-variables.json`):

- `COMPUT3_API_KEY` → `comput3.apiKey`
- `COMPUT3_INFERENCE_API_KEY` → `comput3.inferenceApiKey`
- `COMPUT3_API_BASE_URL` → `comput3.apiBaseUrl`
- `COMPUT3_APP_BASE_URL` → `comput3.appBaseUrl`
- `COMPUT3_DEFAULT_WORKLOAD_TYPE` → `comput3.defaultWorkloadType`
- `COMPUT3_DEFAULT_NODE_INDEX` → `comput3.defaultNodeIndex`
- `COMPUT3_AUTO_SHUTDOWN_MINUTES` → `comput3.autoShutdownMinutes`
- `PLUGIN_COMPUT3_ENABLED` (optional override) → `plugins.comput3`

How to obtain API Key:

1. Visit the Launch portal: [Get your API key](https://launch.comput3.ai/).
2. Use this key for both workload APIs and free/premium inference. For workload endpoints, send it in `X-C3-API-KEY`. For inference endpoints, send it as `Authorization: Bearer <key>`.

## 4. Initialization

- The plugin is discovered by the `PluginManager` during startup unless `config.plugins.comput3` is `false`.
- During initialization, the plugin will:
  - Validate presence of `comput3.apiKey` (to enable workload tools) and/or `comput3.inferenceApiKey` (to enable inference tool).
  - Construct HTTP clients with appropriate headers for v0 (`X-C3-API-KEY`) and v1 (`Authorization: Bearer`).
  - Optionally register a `Comput3Service` for programmatic access from other plugins.
- If credentials are missing, tools gracefully return helpful messages and remain disabled.

## 5. Dependencies

- `langchain/tools` and `@langchain/core/tools` for tool wiring
- `zod` for tool input validation
- Native `fetch` or `node-fetch` for HTTP calls
- Depends on the global `AppConfig` provided by `configLoader.ts`

## 6. Scheduled Tasks (Optional)

To avoid unintended costs, the plugin may optionally provide an auto-shutdown task:

- **`comput3_auto_shutdown_idle`**
  - Runs periodically (e.g., every 10 minutes), lists running workloads, and stops those exceeding `autoShutdownMinutes` or approaching `expires`.
  - Disabled by default unless `autoShutdownMinutes` is configured.

## 7. Examples (Reference)

These mirror Comput3's public API examples; the plugin tools abstract these calls for the agent.

- Workload launch (v0):
  ```http
  POST https://api.comput3.ai/api/v0/launch
  X-C3-API-KEY: <your_api_key>
  {
    "type": "ollama_webui:large",
    "expires": 1744829999
  }
  ```

- Node text generation (running node at index 0):
  ```http
  POST https://app.comput3.ai/0/api/generate
  {
    "model": "llama3:70b",
    "prompt": "Are you an LLM? Respond with yes or no",
    "stream": false
  }
  ```

- Free inference completion (v1):
  ```http
  POST https://api.comput3.ai/v1/completions
  Authorization: Bearer <your_api_key>
  {
    "prompt": "Are you an LLM? Respond with yes or no",
    "model": "llama3:70b"
  }
  ```

## 8. FAQs / Troubleshooting

- Tools are not showing up
  - Ensure the plugin is not disabled: `config.plugins.comput3 !== false`.
  - For workload tools, set `comput3.apiKey`.
  - For inference tool, set `comput3.inferenceApiKey`.
  - Check Wooster logs for any initialization errors from the `comput3` plugin.

- Which node index should I use?
  - After launching workloads, use `comput3_list_workloads` to see active nodes. Index `0` refers to the first running node in the app URL.

- Cost control
  - Configure `autoShutdownMinutes` to reduce cost exposure; you can also set explicit `expires` when launching workloads.

## 9. References

- Workload API Reference: [`https://api.comput3.ai/api/v0/apidocs/#/`](https://api.comput3.ai/api/v0/apidocs/#/)
- Example scripts: [`https://github.com/comput3ai/c3-examples`](https://github.com/comput3ai/c3-examples)
- Launch portal: [`https://launch.comput3.ai/`](https://launch.comput3.ai/)


