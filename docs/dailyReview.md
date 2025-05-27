# Wooster Daily Review Feature: Design Notes

This document outlines the concepts for a "Daily Review" or "Morning Report" feature in Wooster, combining project-specific to-do lists, calendar events, local weather, and recently active projects.

## 1. Core Project Structure & Concepts (Recap)

- **Project Definition:**
    - Primarily directories within `projects/` (e.g., `projects/my_research`).
    - Can be defined in `projects.json` for external paths/globs.
    - Default `projects/home/` on startup.
- **Active Project Context:**
    - Wooster operates within one active project.
    - Managed by REPL commands (`create project`, `load project`, `quit project`).
    - Loading a project builds an in-memory `FaissStore` for its content (for RAG), not saved to disk per project.
- **Project-Specific RAG:** Agent's `queryKnowledgeBase` tool uses the active project's vector store.

## 2. Special Files Within Each Project Directory

Located in: `projects/project_name/`

These files are flexible resources. Their maintenance and use can be driven by either the user or Wooster, or a combination of both, depending on evolving workflows.

### a. `[projectName].md` (e.g., `my_project_name.md`)
- **Purpose:** Project diary, typically auto-updated by Wooster with conversation logs and actions, but can also be manually edited by the user.
- **Creation:** Auto-created if non-existent on project load.
- **Auto-logged Content (Examples):**
    - `## Conversation Log & Key Decisions`: Truncated interactions.
    - `## Wooster Actions`: Tool execution logs.
- **Manual/Future Content:** Overview, Ingested Docs, Tasks & TODOs.
- **Timestamp Significance:** "Last modified" timestamp indicates recent project activity, useful for identifying recently worked-on projects.

### b. `prompt.txt` (Potential Future Feature)
- **Purpose:** Project-specific instructions appended to the agent's main system prompt.
- **Location:** `projects/project_name/prompt.txt`.
- **Behavior:** If found, content appended to the system prompt when the project is active.

### c. `actions.txt` (New Proposed Feature for Daily Review)
- **Purpose:** Project-specific list of "next actions" or to-do items that are not tied to a specific calendar time. Each line in the file represents a single action.
- **Location:** `projects/project_name/actions.txt`.
- **Format:** Simple text file, one action per line. (e.g., `Review chapter 1 draft` or `Call John about specs`).
- **Behavior:** Intended for user or Wooster to manage. The Daily Review feature will aggregate these from recently active projects.

## 3. Daily Review / Morning Report Feature Components

The report aims to provide a consolidated daily briefing, consisting of:

### a. Today's Calendar Events
- **Source:** Existing Google Calendar integration and tools (`list_calendar_events`).
- **Scope:** Events scheduled for the current day.

### b. Next Actions from Recent Projects
- **Source:** Aggregated content from `actions.txt` files, sourced *only* from the 3 most recently active projects.
- **Process:**
    1.  Identify the 3 most recently active projects by checking the "last modified" timestamp of their respective `[projectName].md` files.
    2.  For each of these 3 projects, check for an `actions.txt` file in its root directory.
    3.  If `actions.txt` exists, read each line (each representing an action).
    4.  Compile all collected actions into a single list, prefixing each action with its project name for context (e.g., `[project_alpha] Draft initial proposal`).

### c. Local Weather Forecast
- **Purpose:** Provides a brief weather update.
- **Source:** Requires a new tool/function to fetch data from a weather API.
- **Configuration:** A `WEATHER_CITY` variable in the `.env` file will specify the location (e.g., `WEATHER_CITY="New York"`).
- **Output Example:** "Weather for [City]: [Temperature], [Condition]."

## 4. Triggering the Daily Review

To be determined, options include:
- **REPL Command:** E.g., `> daily_review` or `> morning_report`.
- **Agent Request:** E.g., "Wooster, what's my morning report?" (Would require new tools for the agent to gather this info: one for calendar, one for recent project actions, one for weather).
- **Scheduled Task:** E.g., User schedules "morning report" for 8 AM daily via the scheduler tool.

This feature would provide a valuable daily overview, helping the user prioritize and stay organized across different contexts and commitments. 