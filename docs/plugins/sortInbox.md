# Wooster Plugin: sortInbox

**Version:** 1.6.0

## 1. Purpose

The `sortInbox` plugin provides a command-line interface to systematically process items captured in the main `inbox.md` file. It allows users to review each item and decide on the appropriate action, helping to keep the inbox clear and actionable items routed to their correct destinations, following GTD (Getting Things Done) principles.

## 2. Assumed File Structure (Relative to Wooster Project Root `./`)

The `sortInbox` plugin interacts with the following files and directories:

*   **Inbox File (Source):** `./inbox.md`
*   **Archive for Processed Inbox Items:** `./logs/inboxArchive/`
*   **Next Actions List:** `./next_actions.md`
*   **Someday/Maybe List:** `./someday_maybe.md`
*   **Waiting For List:** `./waiting_for.md`
*   **Projects Root Directory:** `./projects/`
    *   **Project-Specific Reference File:** `./projects/[Selected Project Name]/[Selected Project Name].md` (New reference items are appended here)

## 3. The Inbox Processing Workflow

### 3.1. Initialization

The user invokes the plugin, typically through a Wooster agent command like `wooster process inbox`.

### 3.2. Item Display

The plugin reads `inbox.md`, taking the first unprocessed item (e.g., a line starting with `- [ ]`).
It displays a preview of the item, including its capture timestamp if available.

Example:
```
-----------------------------------------------------
Item: "Plan weekend trip" (Captured: 2023-10-27 10:15:30)
-----------------------------------------------------
```

### 3.3. Action Menu

The user is presented with a menu of single-letter commands:

```
Choose an action:
  (t)rash         - Delete this item
  (d)one          - Mark as completed & archive
  (n)ext Action   - Add to Next Actions list
  (p)roject       - Create new project / Add to existing project
  (r)eference     - Add as reference material to a specific project's main notes file
  (s)omeday/Maybe - Add to Someday/Maybe list
  (w)aiting For   - Add to Waiting For list
  (c)alendar      - Schedule it (add due date/reminder to Next Actions)
  (e)dit          - Modify this item before processing
  (q)uit          - Exit inbox processing

Enter code: _
```

### 3.4. Action Execution & Feedback

Based on the user's input:

*   **(t)rash**:
    *   **Action**: Removes the item line from `./inbox.md`. (Optionally, could also log the deletion).
    *   **Feedback**: "Item trashed."

*   **(d)one**:
    *   **Action**: Creates a new Markdown file in `./logs/inboxArchive/` (e.g., `./logs/inboxArchive/YYYY-MM-DD_item_summary.md`) containing the item's details. Removes the item line from `./inbox.md`.
    *   **Feedback**: "Item marked as Done and archived."

*   **(n)ext Action**:
    *   **Action**: Prompts: "Optional: +project @context due:YYYY-MM-DD". Appends the item (formatted as a task, including any user additions) to `./next_actions.md`. Creates an archive copy in `./logs/inboxArchive/`. Removes item from `./inbox.md`.
    *   **Feedback**: "Item added to Next Actions and archived."

*   **(p)roject**:
    *   **Action**:
        1.  Prompts: "Create (n)ew project or add to (e)xisting?"
        2.  If (n)ew: Prompts: "New project name:". Creates a directory `./projects/[New Project Name]/`. Creates an initial project file `./projects/[New Project Name]/[New Project Name].md` seeded with the item's content.
        3.  If (e)xisting: Lists project directories from `./projects/`. Prompts to choose. Prompts: "What is the next action for this item within '[Selected Project]'? (Leave blank if just filing item under project)". Appends item content or the new action to `./projects/[Selected Project Name]/[Selected Project Name].md` (or a specific tasks section within).
        4.  Creates an archive copy in `./logs/inboxArchive/`. Removes item from `./inbox.md`.
    *   **Feedback**: "Project '[Project Name]' created/updated. Item archived."

*   **(r)eference**:
    *   **Action**:
        1.  Lists project directories from `./projects/`. Example:
            ```
            Select a project for this reference material:
            1. Project Alpha
            2. Project Beta
            (b)ack - Return to main action menu
            Enter project number or (b)ack: _
            ```
        2.  User selects a project.
        3.  The plugin appends the content of the inbox item to `./projects/[Selected Project Name]/[Selected Project Name].md` under a heading like `## Captured Reference Items` or similar. Content could be appended with a separator and timestamp:
            ```markdown
            ---
            ### Reference Item - Added: YYYY-MM-DD HH:mm:ss
            #### Original Capture: [Original Inbox Item Timestamp if available]
            [Content of the inbox item]
            ```
        4.  Creates an archive copy in `./logs/inboxArchive/`. Removes item from `./inbox.md`.
    *   **Feedback**: "Item added as reference to '[Selected Project Name]' and archived."

*   **(s)omeday/Maybe**:
    *   **Action**: Appends the item's content (or a link to its archived version) to `./someday_maybe.md`. Creates an archive copy in `./logs/inboxArchive/`. Removes item from `./inbox.md`.
    *   **Feedback**: "Item added to Someday/Maybe list and archived."

*   **(w)aiting For**:
    *   **Action**: Prompts: "Waiting for whom/what? Optional follow-up date (YYYY-MM-DD):". Appends details to `./waiting_for.md`. Creates an archive copy in `./logs/inboxArchive/`. Removes item from `./inbox.md`.
    *   **Feedback**: "Item added to Waiting For list and archived."

*   **(c)alendar**:
    *   **Action**: Prompts: "Schedule for YYYY-MM-DD (or 'today', 'tomorrow', 'next week'). Task description (defaults to item content):". Appends a task with a due date to `./next_actions.md`. Creates an archive copy in `./logs/inboxArchive/`. Removes item from `./inbox.md`.
    *   **Feedback**: "Item scheduled and archived."

*   **(e)dit**:
    *   **Action**: Opens the current inbox item line (or a temporary file copy of it) in the system's default text editor (`$EDITOR`). After the user saves and closes the editor, the plugin re-displays the (potentially modified) item and the action menu. The original line in `inbox.md` is updated upon choosing an action other than `(e)dit` or `(q)uit`.
    *   **Feedback**: (None, just re-displays item and menu)

*   **(q)uit**:
    *   **Action**: Exits the `sortInbox` plugin.
    *   **Feedback**: "Exiting inbox processing."

### 3.5. Next Item

If an action other than `(q)uit` was chosen, the plugin processes the next unprocessed item from `./inbox.md`.

### 3.6. Inbox Zero

If `./inbox.md` contains no unprocessed items, the plugin prints a message like "Inbox zero! 🎉" and exits.

## 4. Key Files & Interactions Summary

*   **Reads From:**
    *   `./inbox.md` (primary source of items)
    *   `./projects/` (to list existing projects)
*   **Writes To/Modifies:**
    *   `./inbox.md` (removes processed lines, updates edited lines)
    *   `./logs/inboxArchive/` (creates archive files for processed items)
    *   `./next_actions.md` (appends new tasks)
    *   `./someday_maybe.md` (appends items)
    *   `./waiting_for.md` (appends items)
    *   `./projects/[ProjectName]/[ProjectName].md` (appends reference items, seeds new project files, adds tasks to existing projects)
*   **Creates Directories:**
    *   `./projects/[New Project Name]/` (for new projects)
    *   `./logs/inboxArchive/` (if it doesn't exist)

This plugin relies on file system operations like reading files, listing directories, appending to files, creating files, and creating directories. It may leverage core Wooster file system tools or implement these directly. 

## 5. Agent Tools

The `sortInbox` plugin provides the following tools for the agent:

*   **`sortInboxInteractively`**:
    *   **Description**: Starts an interactive command-line session to process items currently in the `inbox.md` file. Each item will be presented one by one, and the user will be prompted to choose an action (e.g., convert to next action, schedule, delegate, archive, delete, add to waiting for, etc.).
    *   **Input**: This tool does not take any direct input from the agent, as it initiates an interactive session with the user in the terminal.
    *   **Output**: A message indicating the session has started and another when it's completed (e.g., "Interactive inbox sorting session completed."). The actual processing and output happen in the user's terminal.

*   **`addWaitingForItem`**:
    *   **Version**: Introduced in `1.5.0`
    *   **Description**: Directly adds an item to the 'Waiting For' list (`waiting_for.md`) without needing to go through the full interactive inbox sorting process.
    *   **Input Structure**: This tool **MUST** be called with an object containing a single key: `'input'`. The value for this `'input'` key **MUST** be a JSON string. This JSON string **ITSELF MUST** represent an object with the following keys:
        *   `'description'` (string, required): What you are waiting for.
        *   `'waitingFor'` (string, optional): The person, entity, or event you are waiting on.
    *   **Example Agent Call**: `agent.callTool('addWaitingForItem', { input: '{"description": "approval on the Q3 budget", "waitingFor": "Finance Department"}' })`
    *   **Output**: A confirmation message, e.g., "Added to Waiting For list: 'approval on the Q3 budget' (waiting for Finance Department)".
    *   **File Interaction**: Appends a formatted line to `waiting_for.md`. The typical format is: `- [ ] @Waiting [Person/Entity, if provided] re: [Description] (Logged: YYYY-MM-DD)`.

*   **`viewWaitingForItems`**:
    *   **Description**: Reads and displays all items from the global `waiting_for.md` file. This tool requires no parameters.
    *   **Input**: This tool takes no parameters.
    *   **Output**: The content of the `waiting_for.md` file, typically prefixed with a header like "Contents of waiting_for.md:", or a message if the file doesn't exist or is empty.

*   **`viewInboxItems`**:
    *   **Description**: Reads and displays all items from the global `inbox.md` file. This tool requires no parameters.
    *   **Input**: This tool takes no parameters.
    *   **Output**: The content of the `inbox.md` file, typically prefixed with a header like "Contents of inbox.md:", or a message if the file is empty or doesn't exist. 