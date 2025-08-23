## macOS Notes Plugin (Shortcuts-based)

This plugin lets Wooster create, read, and append Apple Notes using the macOS Shortcuts CLI. It’s ideal when email is unavailable and you want synced Notes across your Apple devices.

### Prerequisites
- macOS with a logged-in GUI user
- iCloud Notes enabled (Notes → Preferences → Accounts)
- Shortcuts app installed and working
- Shortcuts CLI available: `shortcuts list`

### Create the Shortcuts
Create these three Shortcuts in the GUI user’s session.

1) "Wooster Create Note"
- Accepts: Text
- Actions:
  - Get Dictionary from Input
  - Get Dictionary Value (key: `title`, default: `From Wooster`)
  - Get Dictionary Value (key: `body`, default: empty)
  - Get Dictionary Value (key: `folder`, default: `Notes`)
  - Create Note (Name: `title`, Body: `body`, Folder: `folder`)

2) "Wooster Get Note"
- Accepts: Text (the note title)
- Actions:
  - Find Notes (Name is [Shortcut Input])
  - Get Contents of Note
  - Return (Text)

3) "Wooster Append Note"
- Accepts: Text (JSON string)
- Actions:
  - Get Dictionary from Input
  - Get Dictionary Value (key: `title`)
  - Get Dictionary Value (key: `append`)
  - Find Notes (Name is `title`)
  - Append to Note (`append`)

### Running from SSH
Run as the console (GUI) user to access Shortcuts and Notes:
```bash
CONSOLE_USER=$(stat -f%Su /dev/console)
printf '%s' '{"title":"From Wooster","body":"Created via SSH","folder":"Notes"}' > /tmp/wooster-note.json
sudo launchctl asuser $(id -u "$CONSOLE_USER") shortcuts run "Wooster Create Note" --input-path /tmp/wooster-note.json
rm -f /tmp/wooster-note.json
```

### Wooster Tools
With the plugin enabled, the agent gains:
- `notes_create`: Create a note. Input can be plain text (used as body) or JSON `{ "title", "body", "folder" }`.
- `notes_get`: Get the contents of a note by exact title. Input is the title string.
- `notes_append`: Append to a note. Input JSON `{ "title", "append" }`.

### Configuration
Optional override for Shortcut names in `config/local.json`:
```json
{
  "plugins": {
    "macosNotes": {
      "shortcutNames": {
        "create": "Wooster Create Note",
        "get": "Wooster Get Note",
        "append": "Wooster Append Note"
      }
    }
  }
}
```

### Troubleshooting
- If nothing happens, ensure a user is logged into the GUI and open Notes once to initialize.
- First run may prompt for automation permissions. Approve via Screen Sharing or local session.
- Verify the Shortcuts exist and run manually from the Shortcuts app.


