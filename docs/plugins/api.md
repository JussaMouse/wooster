# Wooster Unified API

**Version:** 1.0.0 (Initial)
**Status:** Under Development

## 1. Overview

This document outlines the specifications for the Wooster Unified API. The API provides a single, consistent HTTP interface for interacting with various Wooster capabilities from external clients, such as mobile applications, scripts, or third-party services.

-   **Base URL (Conceptual):** `http://<WOOSTER_HOST_IP>:<API_PORT>/api/v1`
    -   `<WOOSTER_HOST_IP>`: The IP address of the machine running Wooster.
    -   `<API_PORT>`: The port configured for the `ApiPlugin`.
-   **Format:** All request and response bodies are in JSON format.

## 2. Authentication

Authentication is required for all API endpoints unless otherwise specified (e.g., a public status endpoint, if ever implemented).

-   **Primary Method: API Key (Bearer Token)**
    -   Requests must include an `Authorization` header with a Bearer token.
    -   `Authorization: Bearer <YOUR_API_KEY>`
    -   The API key is configured in Wooster's `.env` file via `PLUGIN_API_KEY` (specific to this ApiPlugin).

-   **Optional: IP Whitelisting**
    -   If enabled via `PLUGIN_API_GLOBAL_IP_WHITELIST_ENABLED=true`, requests will first be checked against a list of allowed IP addresses (`PLUGIN_API_GLOBAL_ALLOWED_IPS`).
    -   If an IP is whitelisted, the API key check *may* be bypassed depending on the server's configuration (typically, whitelisting grants access).
    -   If IP whitelisting is enabled and the client IP is not in the list, the request will be denied (403 Forbidden), typically before an API key is even checked.

## 3. Common Headers

-   **`Content-Type: application/json`**: Required for requests with a JSON body (e.g., POST, PUT).
-   **`Authorization: Bearer <YOUR_API_KEY>`**: Required for authenticated endpoints.

## 4. Common HTTP Status Codes & Error Responses

-   **Success Codes:**
    -   `200 OK`: Request successful. Response body contains requested data or status.
    -   `201 Created`: Resource successfully created. Response body usually contains the created resource.
    -   `204 No Content`: Request successful, but no data to return (e.g., for a DELETE request).
-   **Client Error Codes:**
    -   `400 Bad Request`: The request was malformed (e.g., invalid JSON, missing required fields). Response body will contain an error object.
        ```json
        {
          "error": "Invalid request body: Missing 'description' field."
        }
        ```
    -   `401 Unauthorized`: Authentication failed or was not provided (e.g., missing or invalid API key).
        ```json
        {
          "error": "Unauthorized: API key is missing or invalid."
        }
        ```
    -   `403 Forbidden`: Authentication succeeded, but the authenticated user/key does not have permission for the requested action, or IP is not whitelisted.
        ```json
        {
          "error": "Forbidden: IP address not whitelisted."
        }
        ```
    -   `404 Not Found`: The requested resource or endpoint does not exist.
        ```json
        {
          "error": "Endpoint not found."
        }
        ```
-   **Server Error Codes:**
    -   `500 Internal Server Error`: An unexpected error occurred on the server.
        ```json
        {
          "error": "An internal server error occurred."
        }
        ```
    -   `503 Service Unavailable`: The server is temporarily unable to handle the request (e.g., a dependent service is down).

## 5. Rate Limiting

(Future consideration: Details on rate limits will be provided here if implemented.)

## 6. API Endpoints

All endpoints are prefixed with `/api/v1`.

### 6.1. Task Management

#### 6.1.1. Capture New Task

-   **Endpoint:** `POST /tasks`
-   **Description:** Creates a new task in the user's task list.
-   **Authentication:** Required.
-   **Request Body:**
    ```json
    {
      "description": "The textual description of the task to be captured."
    }
    ```
    -   `description` (string, required): The content of the task. Must be non-empty.
-   **Success Response (201 Created):**
    ```json
    {
      "message": "Task captured successfully.",
      "taskId": "generated-unique-task-id",
      "description": "The textual description of the task to be captured."
    }
    ```
-   **Error Responses:** `400`, `401`, `403`, `500`.

### 6.2. Health Logging

#### 6.2.1. Log Workout Detail

-   **Endpoint:** `POST /health/workouts`
-   **Description:** Logs a detail for the current day's workout. If a workout entry for the current local date already exists, the new detail is appended. Otherwise, a new entry is created for the date with this detail.
-   **Authentication:** Required.
-   **Request Body:**
    ```json
    {
      "detail": "Description of the workout activity or portion."
    }
    ```
    -   `detail` (string, required): The workout detail to log (e.g., "Morning run: 5km, 30 minutes", "Evening yoga session"). Must be non-empty.
-   **Success Response (200 OK or 201 Created):**
    ```json
    {
      "message": "Workout detail logged successfully.",
      "date": "YYYY-MM-DD", // The local date for which the workout was logged
      "workoutEntry": {
          "id": "entry-id", // ID of the health log entry
          "type": "workout",
          "content": "Full concatenated content of the day's workout.",
          "createdAt": "ISO8601_timestamp",
          "updatedAt": "ISO8601_timestamp"
      }
    }
    ```
-   **Error Responses:** `400`, `401`, `403`, `500`.

---

## 7. ApiPlugin Configuration (Wooster `.env` variables)

The following environment variables control the behavior of the Unified API Plugin:

-   `PLUGIN_API_ENABLED=(true|false)`
    -   Default: `false`
    -   Enables or disables the entire API plugin.
-   `PLUGIN_API_PORT=<number>`
    -   Default: `3000` (or a suitable unused port)
    -   The TCP port on which the API server will listen.
-   `PLUGIN_API_KEY=<your_secure_api_key>`
    -   No default. Required if API is enabled and IP whitelisting isn't the sole auth method.
    -   A secure, randomly generated key for Bearer token authentication.
    -   Example generation: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
-   `PLUGIN_API_GLOBAL_IP_WHITELIST_ENABLED=(true|false)`
    -   Default: `false`
    -   Enables IP whitelisting for all endpoints managed by this API plugin.
-   `PLUGIN_API_GLOBAL_ALLOWED_IPS=<comma_separated_ips>`
    -   Example: `127.0.0.1,::1,192.168.1.100`
    -   Comma-separated list of IP addresses allowed if IP whitelisting is enabled. 