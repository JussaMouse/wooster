# Wooster Operational Modes

Wooster can switch between multiple specialized modes to tackle different domains and workflows. Each mode has its own commands, data stores, and plugins.

## 1. Default / Help Mode
- No project or domain context loaded.
- Responds to built-in commands: `help`, `list projects`, `list modes`, `load project <name>`, `load mode <mode>`, `unload all`, etc.
- Acts as a general-purpose CLI assistant (lookup, quick answers, simple scripts).

## 2. Project Mode
- Contextualizes RAG over a selected code/docs subset.
- Commands: `load project <name>`, `unload project`, `list projects`, `where is <symbol>`.

## 3. Reminder Mode
- Schedule, list, and cancel periodic or one-off reminders.
- Integrates with system cron or background scheduler.
- Commands: `remind me to <task> at <time>`, `list reminders`, `cancel reminder <id>`.

## 4. Calendar Mode
- Manage events, availability, and invites (Google/Azure/Outlook integration).
- Commands: `show calendar for <date>`, `add event <title> on <date> at <time>`, `find free slot`, `invite <email>`.

## 5. Contacts Mode
- CRUD operations on personal/contact address book.
- Commands: `add contact <name> <email>`, `find contact <name>`, `list contacts`, `update contact <id>`.

## 6. Communication Mode
- Send and track emails, SMS, or chat messages via plugins.
- Commands: `send email to <name> with <message>`, `show inbox`, `send sms to <phone> <text>`.

## 7. Finance Mode
- Track expenses, budgets, and income. Integrate with CSV/banking APIs.
- Commands: `log expense <amount> for <category>`, `show balance`, `monthly report`, `set budget <category> <amount>`.

## 8. Task Management Mode
- Kanban-style or list-based task tracking.
- Commands: `create task <title>`, `list tasks [status]`, `complete task <id>`, `assign task <id> to <name>`.

## 9. Note-taking / Journal Mode
- Capture freeform notes, journal entries, or meeting minutes.
- Commands: `new note <title>`, `show notes`, `search notes for <keyword>`.

## 10. Shell / DevOps Mode
- Execute shell commands, manage processes, deploy scripts.
- Commands: `run <shell command>`, `status <service>`, `deploy <branch>`.

## 11. Knowledge / FAQ Mode
- Maintain an internal FAQ or knowledge base separate from project docs.
- Commands: `add faq <question> → <answer>`, `ask faq <question>`.

## 12. Custom / Plugin Mode
- Enable or disable feature-specific plugins on demand.
- Commands: `load plugin <name>`, `unload plugin <name>`, `list plugins`.

---

**Next Steps:**
1. Define each mode's command set and data store (JSON, SQLite, etc.).
2. Scaffold a `modePlugin.ts` to handle `load mode <name>` and switch behavior.
3. Abstract RAG or specialized services per mode (e.g. calendar API vs. project docs).
4. Update `index.ts` to dispatch user input based on active mode. 