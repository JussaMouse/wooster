# Wooster Actions Cheat Sheet

A concise guide to interacting with Wooster.

## 💬 Chat Interface

| Action | Command / Query Example | Description |
| :--- | :--- | :--- |
| **Chat** | `Hello, how are you?` | Normal conversation with the AI. |
| **Exit** | `exit` | Closes Wooster. |
| **Rebuild Embeddings** | `rebuild embeddings` | Re-indexes the current project/library if models changed. |

## 🧠 Personal Library (Memory)

Wooster automatically indexes `notes/`, `projects/`, and `gtd/`.

| Action | Query Example | Description |
| :--- | :--- | :--- |
| **Search Library** | `Search library for "project alpha"` | Hybrid search (Text + Vector) of your files. |
| **Recall Info** | `What does "shmoodly" mean?` | Natural language query of your knowledge base. |
| **Contextual Ask** | `Based on my notes, what is...` | Explicitly asks to use library context. |
| **Create Note** | `Create a note about X` | Agent creates a new Markdown note in `notes/`. |

## 🌐 Web & Research

| Action | Query Example | Description |
| :--- | :--- | :--- |
| **Web Search** | `Search web for "latest AI news"` | Uses Tavily to search the internet. |
| **Read Page** | `Read https://example.com and summarize` | Fetches and summarizes a specific webpage. |

## 📅 Productivity & Tools

| Action | Query Example | Description |
| :--- | :--- | :--- |
| **Journaling** | `Log to journal: "Meeting went well"` | Appends text to your daily project journal. |
| **Capture** | `Capture "Buy milk"` | Saves item to your Inbox (GTD). |
| **Schedule Task** | `Remind me in 30 mins to "Check oven"` | Schedules a task/notification. |
| **List Scheduled** | `What tasks are scheduled?` | Lists all pending/recurring tasks. |
| **Calendar** | `List my events for today` | Checks Google Calendar (if configured). |
| **Email** | `Send email to bob@example.com...` | Sends an email via Gmail (if configured). |
| **Signal** | `Send Signal message to Mom...` | Sends a message via Signal CLI (if configured). |

## ⚙️ Configuration (`.env`)

| Variable | Effect |
| :--- | :--- |
| `OPENAI_ENABLED` | `false` = Use Local LLM only. |
| `ROUTING_LOCAL_ENABLED` | `true` = Enable Local LLM connection. |
| `MLX_EMBEDDINGS_ENABLED` | `true` = Use Local Embeddings for Library. |
| `TOOLS_LOGGING_CONSOLE_QUIET_MODE` | `true` = Hide debug logs in chat. |

