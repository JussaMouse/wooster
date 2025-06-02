# iPhone Shortcut: Daily Notes Capture to Wooster API

This document guides you through creating an iPhone Shortcut to automatically find notes created or modified today in the Apple Notes app and send them one by one to a specified API (referred to as "Wooster API").

**Goal:** Automate the transfer of daily Apple Notes to your Wooster API.

**Assumptions:**

*   You have a "Wooster API" endpoint (e.g., a `taskCapture` endpoint).
*   This API endpoint accepts `POST` requests with a JSON payload containing the note's content (and optionally, title and timestamp).
*   You know the full URL of this API endpoint.
*   If your API requires authentication (e.g., an API key or token), you have this information ready.

---

## Part 1: Creating the "Upload Daily Notes to Wooster" Shortcut

This shortcut will find all notes from the current day and then iterate through them, sending each one to your API.

**Steps to Create the Shortcut:**

1.  **Open the Shortcuts App** on your iPhone.
2.  Tap the `+` icon in the top-right corner to create a new shortcut.
3.  Tap "Add Action".

4.  **Find Today's Notes:**
    *   Search for the action: **`Find Notes`**.
    *   Tap on `All Notes` (or the default filter) to configure it.
    *   Set `Sort by` to `Created Date` (or `Last Modified Date` if you prefer to also capture notes edited today).
    *   Set `Order` to `Latest First` (optional, good for processing).
    *   Turn **ON** the `Limit` switch if you want to cap the number of notes processed (usually not needed for "today's notes").
    *   Tap `Add Filter`.
        *   Change the filter from `Folder` (or default) to `Created Date`.
        *   Set the condition to `is today`.
        *   *(Optional)*: Add another filter if you want to restrict notes from a specific folder (e.g., `Folder` `is` `Inbox`).

5.  **Loop Through Each Found Note:**
    *   Search for the action: **`Repeat with Each`**.
    *   This action will automatically use the `Notes` from the "Find Notes" action (from step 4) as its input. The items in this loop will be referred to as `Repeat Item`.

6.  **Inside the "Repeat with Each" Loop:**
    *(Actions added below should be placed inside the `Repeat with Each` and `End Repeat` block).*

    a.  **Get Note Title (Optional, but Recommended):**
        *   Tap `Add Action` (inside the loop).
        *   Search for: **`Get Details of Notes`**.
        *   Tap on `Detail` and select `Name`. (The output will be a variable like "Details of Notes", representing the note's title).

    b.  **Get Note Body and Convert to Plain Text:**
        *   Tap `Add Action`.
        *   Search for: **`Get Text from Input`**.
        *   Tap on `Input` for this action.
        *   Select the Magic Variable icon (it looks like a wand).
        *   Choose **`Repeat Item`** from the list of variables. (This is the current note in the loop). The output of this action will be the plain text content of the note.

    c.  **Prepare Data for API (Create a Dictionary):**
        *   Tap `Add Action`.
        *   Search for: **`Dictionary`**.
        *   Tap `Add new item`:
            *   `Key`: `text` (or the field name your API expects for the note content).
            *   `Value`: Tap the field, select the Magic Variable icon, and choose the output of the `Text` action from step 6b (e.g., "Text from Repeat Item").
        *   Tap `Add new item` (optional, for the title):
            *   `Key`: `title` (or your API's expected field name).
            *   `Value`: Tap the field, select Magic Variable, and choose the output of the `Get Details of Notes` (Name) action from step 6a.
        *   Tap `Add new item` (optional, for timestamp):
            *   `Key`: `capturedAt` (or your API's expected field name).
            *   `Value`: Tap the field, select Magic Variable, and choose `Current Date`. You can tap on `Current Date` again to specify a date format if needed (ISO 8601 is common for APIs).

    d.  **Make the API Call (Send to Wooster API):**
        *   Tap `Add Action`.
        *   Search for: **`Get Contents of URL`**.
        *   Tap on the `URL` field and enter the **full URL for your Wooster API `taskCapture` endpoint**.
        *   Tap `Show More` to reveal more options.
        *   Set `Method` to **`POST`**.
        *   **Headers:**
            *   Tap `Add new header`.
                *   `Key`: `Content-Type`
                *   `Value`: `application/json`
            *   *If your API requires authentication (e.g., a Bearer Token):*
                *   Tap `Add new header`.
                *   `Key`: `Authorization`
                *   `Value`: `Bearer YOUR_API_TOKEN` (Replace `YOUR_API_TOKEN` with your actual token).
        *   **Request Body:**
            *   Tap the type selector and choose `JSON`.
            *   Tap the `Value` field, select the Magic Variable icon, and choose the `Dictionary` you created in step 6c.

    e.  **(Optional) Notify Success/Failure for Each Note:**
        *   Tap `Add Action`.
        *   Search for: **`If`**.
        *   For the `If` condition:
            *   Tap `Input` and select the Magic Variable `Contents of URL` (this is the response from your API call in step 6d).
            *   Change the condition from `Has any value` to `is` or check the `Status Code` property of the `Contents of URL` if your API returns a specific success code (e.g., `Status Code` `is` `200`). For a simple check, `Has any value` might suffice if a failed call returns no body or an error object.
        *   **Inside "If" (Success):**
            *   Add a **`Show Notification`** action.
            *   Set the title to "Note Uploaded".
            *   Set the body to something like: `[Note Title variable from 6a] - Success`.
        *   Tap **`Otherwise`**.
        *   **Inside "Otherwise" (Failure):**
            *   Add a **`Show Notification`** action.
            *   Set the title to "Note Upload Failed".
            *   Set the body to something like: `[Note Title variable from 6a] - Check API/Shortcut`.
        *   Tap **`End If`** (or ensure subsequent actions are outside this block).

7.  **End Repeat:**
    *   This block closes automatically after the last action added inside the loop (e.g., after the `End If` from step 6e).

8.  **(Optional) Final Notification:**
    *   After the `End Repeat` action (i.e., outside the loop).
    *   Add a **`Show Notification`** action.
    *   Set the text to something like: "Daily notes processing complete." You can enhance this by trying to get a count of processed notes (e.g., `[Notes from Find Notes action] processed.`).

9.  **Name Your Shortcut:**
    *   Tap the shortcut name at the top of the screen (e.g., "New Shortcut").
    *   Rename it to something descriptive, like "Upload Daily Notes to Wooster".
10. Tap `Done` in the top-right corner.

---

## Part 2: Automating the Shortcut to Run Daily

This will set up your shortcut to run automatically at a time you specify each day.

1.  In the Shortcuts app, tap on the **`Automation`** tab at the bottom of the screen.
2.  Tap the `+` icon in the top-right corner (or "Create Personal Automation" if this is your first automation).
3.  Choose **`Time of Day`**.
4.  Set the `Time` to when you want the automation to run (e.g., 10:00 PM or another suitable time in the evening).
5.  Under `Repeat`, ensure **`Daily`** is selected.
6.  Tap `Next`.
7.  Tap `Add Action`.
8.  Search for the action: **`Run Shortcut`**.
9.  Tap on the faded `Shortcut` text within the "Run Shortcut" action.
10. Select the "Upload Daily Notes to Wooster" shortcut you created in Part 1.
11. Tap `Next`.
12. **Crucially:** Turn **OFF** the `Ask Before Running` toggle. This allows the automation to run automatically without requiring your confirmation.
13. Confirm by tapping `Don't Ask` in the pop-up.
14. Tap `Done`.

---

**Important Considerations & Tips:**

*   **API Endpoint Details:** Double-check the exact URL, expected JSON structure (field names like `text`, `title`), and any authentication requirements for your Wooster API.
*   **Error Handling:** The optional notification step (6e) provides basic feedback. For more robust error handling, you might consider logging errors to a dedicated note in Apple Notes or a file in iCloud Drive.
*   **Note Content Types:** This shortcut is designed primarily for text-based notes. If your notes frequently contain images, attachments, or complex formatting that needs to be preserved or handled differently, the API call and data preparation (especially step 6b and 6c) might need significant adjustments. Your Wooster API must also be capable of handling such data.
*   **Security of API Tokens:** Be mindful of pasting API tokens directly into shortcuts. For personal use, this is often acceptable, but for shared or more sensitive scenarios, explore more secure ways to handle secrets if possible within the Shortcuts environment or via an intermediary service.
*   **Thorough Testing:**
    *   Test the "Upload Daily Notes to Wooster" shortcut manually several times with test notes created on the current day.
    *   You can temporarily disable the `Find Notes` action and manually select a single test note using the `Select Note` action to test the loop's logic for one item.
    *   Verify that data arrives at your Wooster API as expected.
*   **Deduplication Strategy:** Consider how to prevent processing the same note multiple times if the automation runs unexpectedly or if a note from "today" is slightly modified on a subsequent day but still meets the "modified today" criteria (if you chose that).
    *   **Tagging:** Add a step in your shortcut to add a specific tag (e.g., `#wooster_processed`) to a note after a successful API call. Then, modify your `Find Notes` action (step 4) to exclude notes containing this tag.
    *   **API-Side Deduplication:** Your Wooster API could handle deduplication based on a unique note ID (if Apple Notes provides one that's stable and accessible via Shortcuts) or by generating a hash of the note content.
*   **Running the Automation:** Ensure your iPhone is on and has an internet connection at the scheduled automation time. If "Ask Before Running" is off, it should execute in the background.

This Markdown document should provide a clear set of instructions for setting up the desired iPhone Shortcut. 