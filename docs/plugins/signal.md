## Signal notifications (signal-cli)

Purpose
- Let Wooster send one-way announcements to you with true push notifications and end-to-end encryption (E2EE) via Signal.
- Minimal dependencies on the server; works headless; no GUI session required after linking.

What this plugin does
- Exposes a tool `signal_notify` that sends a message via `signal-cli` to either:
  - a specific recipient (`SIGNAL_TO`),
  - a Signal group (`SIGNAL_GROUP_ID`), or
  - “Note to Self” (fallback when neither is set).
- Splits long messages into multiple sends.
- Logs errors, respects a configurable timeout.

When to use
- Immediate, private push notifications to your phone (builds finished, long jobs done, reminders, alerts).
- Alternative to Discord/Telegram when you want E2EE by default.

Prerequisites (one-time)
1) Install signal-cli (already available via Homebrew on macOS; use your preferred method).
2) Link this server as a secondary Signal device (recommended):
   - On the server: `signal-cli link -n "wooster-server"` (prints a QR code/link)
   - On your phone: Signal → Settings → Linked Devices → Link New Device → scan the QR → confirm.
   - After linking, the server can send messages from your number without a SIM.

Alternative: Dedicated number on server (primary registration)
- Use this if you created a new Signal account with a fresh phone number specifically for Wooster.
  1) Get a phone number that can receive SMS or voice calls (Signal does not accept many VoIP providers).
  2) Register the number with signal-cli (you may be prompted for a CAPTCHA token):
     - Basic SMS registration:
       ```bash
       signal-cli -a "+15551234567" register
       ```
     - If a CAPTCHA is required, open `https://signalcaptchas.org/registration/generate.html` in a browser, solve it, and pass the token:
       ```bash
       signal-cli -a "+15551234567" register --captcha <CAPTCHA_TOKEN>
       ```
     - If SMS doesn’t arrive, try a voice call verification:
       ```bash
       signal-cli -a "+15551234567" register --voice [--captcha <CAPTCHA_TOKEN>]
       ```
  3) Verify once you receive the 6-digit code on that number:
     ```bash
     signal-cli -a "+15551234567" verify 123456
     ```
  4) (Optional) Set a profile name for this dedicated account:
     ```bash
     signal-cli -a "+15551234567" updateProfile --name "Wooster Bot"
     ```
  5) Configure Wooster environment variables for this dedicated account:
     ```
     SIGNAL_CLI_NUMBER=+15551234567           # the dedicated number you registered above
     SIGNAL_TO=+1555YOURPERSONALNUMBER        # optional: send to your main phone
     SIGNAL_GROUP_ID=                         # optional: or send to a group that includes your main phone
     ```
     - If neither `SIGNAL_TO` nor `SIGNAL_GROUP_ID` is set, messages go to this dedicated account’s Note-to-Self (which won’t notify your personal phone).
     - To receive notifications on your personal phone, set `SIGNAL_TO` to your personal number, or create a group that includes both accounts and set `SIGNAL_GROUP_ID`.
  6) Sanity-check from CLI:
     ```bash
     # Send to your personal phone from the dedicated account
     signal-cli -a "+15551234567" send -m "Hello from Wooster bot" +1555YOURPERSONALNUMBER

     # Or send to a group (first list and copy the id)
     signal-cli -a "+15551234567" listGroups
     signal-cli -a "+15551234567" send -g GROUP_ID -m "Deploy done"
     ```

Environment variables (.env)
```
# Path to signal-cli binary (Apple Silicon default)
SIGNAL_CLI_PATH=/opt/homebrew/bin/signal-cli
# Your Signal number (E.164), the linked account/device
SIGNAL_CLI_NUMBER=+15551234567
# Send to an individual (optional)
SIGNAL_TO=+15559876543
# Or send to a group id (output of: signal-cli -u <num> listGroups)
SIGNAL_GROUP_ID=
# Command timeout in milliseconds
SIGNAL_CLI_TIMEOUT_MS=20000
```

Enable the plugin
- If you gate plugins by env flags, set `PLUGIN_SIGNAL_ENABLED=true` (or ensure your loader enables it by default).
- The plugin class lives at `src/plugins/signal/index.ts` and registers the `signal_notify` tool.

Usage
- From the agent: call `signal_notify` (alias: `sendSignal`) with either:
  - a plain string: `"Build completed successfully."`
  - JSON: `{ "message": "Deploy finished on vice." }`
- You do NOT need to provide a phone number to the tool. It sends to `SIGNAL_GROUP_ID` if set, else `SIGNAL_TO` if set, else Note‑to‑Self on `SIGNAL_CLI_NUMBER`.

Examples (manual CLI sanity checks)
```
# Note to Self
signal-cli -a "+15551234567" send -m "Test from server" +15551234567

# To a contact
signal-cli -a "+15551234567" send -m "Hello!" +15559876543

# To a group
signal-cli -a "+15551234567" listGroups   # copy groupId
signal-cli -a "+15551234567" send -g GROUP_ID -m "Deploy done"
```

Design notes
- E2EE is provided by Signal; messages are encrypted to recipients’ devices.
- The server holds your linked device keys; protect access (Unix user, filesystem perms).
- Wooster shells out to `signal-cli` per message for simplicity/reliability; you can later migrate to a long-lived JSON-RPC/DBus mode if needed.

Troubleshooting
- “Unregistered”: for the dedicated-number path, make sure you completed `verify <code>` after `register`. For the linked-device path, ensure linking succeeded.
- “Untrusted identity”: confirm identity change on phone, then resend.
- Rate limiting: space out bursts; Signal may throttle rapid sends.
- Paths:
  - signal-cli typically: `/opt/homebrew/bin/signal-cli` (Apple Silicon).
  - Config: `~/Library/Application Support/signal-cli` (macOS).
- SMS not arriving: try `--voice` during `register`. If prompted for a CAPTCHA, obtain a token and pass `--captcha <token>`.

Security & Ops
- Treat `.env` and the server account as sensitive (messages can originate from your identity).
- Prefer sending to a 1-member group (e.g., “Wooster Announcements”) for flexible notification control.
- Log only high-level success/failure; avoid logging full message bodies if sensitive.

Future enhancements
- Structured message templates (title/body/severity tags).
- Attachment support (file sends) with size checks.
- Scheduling integration (send at a specific time/cron).
- Multi-recipient routing (aliases for different topics).


