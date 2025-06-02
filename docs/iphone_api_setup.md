# Wooster API: iPhone Setup via Shortcuts App

This guide explains how to use the Apple Shortcuts app on your iPhone to interact with your Wooster application's API, specifically for capturing tasks.

## Prerequisites

1.  **Wooster API Running:**
    *   Your Wooster application must be running on a computer on your local network.
    *   The `ApiPlugin` must be enabled in your Wooster `.env` file (`PLUGIN_API_ENABLED=true`).
    *   You need to know the `PLUGIN_API_PORT` Wooster is using (e.g., `3000`).
    *   You must have an `PLUGIN_API_KEY` set in your Wooster `.env` file.
2.  **Local Network:**
    *   Your iPhone and the computer running Wooster must be connected to the **same Wi-Fi network**.
3.  **Wooster Machine's Local IP Address:**
    *   You need the local IP address of the computer running Wooster (e.g., `192.168.1.100`).
    *   **To find on macOS:** System Settings > Network > (Select Wi-Fi/Ethernet connection).
4.  **Firewall (Wooster Machine):**
    *   Ensure your computer's firewall allows incoming connections for Node.js or specifically for the Wooster API port.

## Creating the "Capture Wooster Task" Shortcut

1.  **Open the Shortcuts App** on your iPhone.
2.  Tap the **`+`** button in the top-right corner to create a new shortcut.
3.  **Rename Shortcut:** Tap the default name at the top (e.g., "New Shortcut 1") and rename it to something like "Capture Wooster Task" or "Log Wooster Task".

4.  **Add Action: "Ask for Input"**
    *   Search for "Ask for Input" and add it.
    *   **Prompt:** Type a question, e.g., `What task do you want to capture?`
    *   Tap "Show More":
        *   **Input Type:** Ensure it's `Text`.
        *   You can leave "Default Answer" blank.

5.  **Add Action: "URL"**
    *   Search for "URL" and add it.
    *   In the URL field, type: `http://<YOUR_MAC_LOCAL_IP>:<YOUR_API_PORT>/api/v1/tasks`
        *   **Replace `<YOUR_MAC_LOCAL_IP>`** with the actual local IP address of your computer running Wooster (e.g., `192.168.1.100`).
        *   **Replace `<YOUR_API_PORT>`** with the port your Wooster `ApiPlugin` is using (e.g., `3000`).
        *   *Example:* `http://192.168.1.100:3000/api/v1/tasks`

6.  **Add Action: "Get Contents of URL"**
    *   Search for "Get Contents of URL" and add it.
    *   Tap on the blue "URL" text (which should show the variable from the previous step) to expand the options, or tap "Show More".
    *   **Method:** Change from `GET` to `POST`.
    *   **Headers:**
        *   Tap "Add new header".
            *   **Key:** `Content-Type`
            *   **Text (Value):** `application/json`
        *   Tap "Add new header" again.
            *   **Key:** `Authorization`
            *   **Text (Value):** `Bearer <YOUR_PLUGIN_API_KEY>`
                *   **Replace `<YOUR_PLUGIN_API_KEY>`** with the *exact* API key you set in your Wooster `.env` file.
    *   **Request Body:**
        *   **Type:** `JSON`.
        *   Tap "Add new field".
            *   **Key:** `description`
            *   **Type:** Change to `Text`.
            *   **Value:** Tap the field. Look for the "magic variable" icon (often a wand or an `X` in a box). Select "Provided Input" (this should be the output from your "Ask for Input" action).

7.  **Add Action (Optional): "Show Notification" (Basic Feedback)**
    *   Search for "Show Notification" and add it.
    *   **Title:** You can type "Wooster Task" or leave it blank to use the Shortcut name.
    *   **Body:** Tap the field, use the magic variable icon, and select "Contents of URL". This will show the raw JSON response from the API (e.g., `{"message":"Task captured successfully...", ...}`).
    *   You can turn off "Play Sound" if desired.

    *For more advanced feedback (parsing the JSON and showing a custom message), see the "Advanced Feedback" section below.*

8.  **Done:** Tap "Done" to save the Shortcut.

## Running Your Shortcut

*   Tap the Shortcut card in the Shortcuts app.
*   It will ask for the task description (if you added "Ask for Input").
*   It will then attempt to send the data to your Wooster API.
*   You should see a notification with the result.

You can also:
*   Add the Shortcut to your **Home Screen**: Open the Shortcut, tap the `(i)` icon or the share icon at the bottom, and select "Add to Home Screen".
*   Run it via **Siri**: "Hey Siri, Capture Wooster Task" (or whatever you named it).

## Advanced Feedback (Optional)

Instead of just showing the raw JSON in the notification, you can parse it:

*   After the "Get Contents of URL" action:
    1.  **Add Action: "If"**
        *   **Input:** Select the "Contents of URL" variable.
        *   **Condition:** "has any value" (or you could check if "Status Code" from "Contents of URL" is 201 if you want to be more specific, but this requires an extra "Get Details of Contents of URL" action first).
    2.  **Inside the "If" block (i.e., drag subsequent actions here):**
        *   **Add Action: "Get Dictionary from Input"**
            *   **Input:** Select the "Contents of URL" variable.
        *   **Add Action: "Get Value for Key"**
            *   **Key:** `message` (this is from the success response `{"message":"Task captured..."}`)
            *   **Dictionary:** Select the "Dictionary" variable from the previous step.
        *   **Add Action: "Show Notification"**
            *   **Title:** `Wooster Task`
            *   **Body:** Select the "Value" variable from the "Get Value for Key" step.
    3.  **In the "Otherwise" section of the "If" block:**
        *   **Add Action: "Show Notification"**
            *   **Title:** `Wooster Error`
            *   **Body:** `Failed to capture task. Check Wooster logs.` (You could also try to get an error message from "Contents of URL" if your API consistently returns JSON errors with a specific key).

## Troubleshooting

*   **"Could Not Connect to Server" / Timeout:**
    *   Verify your Mac's local IP address.
    *   Verify the API port number.
    *   Ensure your iPhone and Mac are on the same Wi-Fi network.
    *   Check your Mac's firewall settings.
    *   Ensure Wooster and the `ApiPlugin` are running on your Mac (check terminal logs).
*   **`{"error":"Unauthorized"}`:**
    *   Double-check your `PLUGIN_API_KEY` in your Wooster `.env` file.
    *   Ensure the `Authorization: Bearer <key>` header in your Shortcut *exactly* matches this key.
*   **`{"error":"Task capture feature is currently unavailable."}`:**
    *   Ensure `PLUGIN_TASKCAPTURE_ENABLED=true` in your Wooster `.env` file.
    *   Check Wooster logs to ensure the `TaskCapturePlugin` initialized correctly and registered its service.
*   **Other Errors:** Check the Wooster terminal logs for more detailed error messages from the `ApiPlugin` or other plugins.

This should give you a good starting point for interacting with Wooster from your iPhone! 