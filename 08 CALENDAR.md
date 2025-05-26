# 09 CALENDAR.MD: Google Calendar Integration

This document outlines the Google Calendar integration for Wooster, enabling it to interact with your Google Calendar.

## Purpose

The Google Calendar integration allows Wooster, through an agent tool, to:

*   Create new calendar events.
*   List existing calendar events for specified dates or ranges.
*   Find free time slots (conceptual).
*   Retrieve details of upcoming events (conceptual).

This enables Wooster to help you manage your schedule, set reminders by creating events, and answer questions about your availability.

## Setup and Configuration

To use the Google Calendar integration, you must configure several environment variables in your `.env` file.

1.  **Enable the Integration**:
    *   Set `GOOGLE_CALENDAR_ENABLED=true` in your `.env` file.

2.  **Provide Google Cloud Credentials**:
    *   `GOOGLE_CLIENT_ID`: Your Google Cloud OAuth 2.0 Client ID.
    *   `GOOGLE_CLIENT_SECRET`: Your Google Cloud OAuth 2.0 Client Secret.
    *   These are shared credentials for Google services and must be obtained from the [Google Cloud Console](https://console.cloud.google.com/).

3.  **Provide Calendar-Specific Authorization**:
    *   `GOOGLE_CALENDAR_REFRESH_TOKEN`: An OAuth 2.0 Refresh Token that grants Wooster ongoing access to your Google Calendar. You will need to go through an OAuth consent flow to obtain this token after setting up your OAuth client in the Google Cloud Console.
    *   `GOOGLE_CALENDAR_ID`: The ID of the calendar Wooster should interact with.
        *   For your primary calendar, this is usually `primary`.
        *   You can also use the specific ID of another calendar you have access to.
        *   **Default**: `primary`

For detailed instructions on setting these environment variables, please refer to **Section 5: Google Integration Configuration** and **Section 5a: Google Calendar Specific Configuration** in `06 CONFIG.MD`.

**Important Security Note**: The `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REFRESH_TOKEN` are sensitive credentials. Ensure your `.env` file is included in your `.gitignore` to prevent accidental exposure.

## How it Works

The Google Calendar integration is exposed to the Wooster agent as one or more tools (e.g., `create_calendar_event`, `list_calendar_events`). When you ask Wooster to perform a calendar-related task, the agent will determine the appropriate tool and parameters to use based on your instructions.

The underlying implementation uses the Google Calendar API, authenticated via OAuth 2.0 using the credentials you provide in the `.env` file.

## Available Agent Tools & Interactions (Conceptual)

While the specific tools and their exact parameters are subject to implementation, the following capabilities are envisioned:

*   **Create Event**:
    *   Tool: `create_calendar_event`
    *   Example: "Wooster, schedule a meeting with John tomorrow at 2 PM about the project."
    *   Parameters might include: summary, start time, end time (or duration), description, attendees, location.

*   **List Events**:
    *   Tool: `list_calendar_events`
    *   Example: "Wooster, what's on my calendar for today?" or "Show me my events for next Monday."
    *   Parameters might include: date range (start date, end date), specific date, maximum number of results.

*   **Find Free Time (Conceptual)**:
    *   Tool: `find_free_time_slots`
    *   Example: "Wooster, am I free next Tuesday morning?"
    *   Parameters might include: date range, duration of the desired free slot.

*   **Get Next Event (Conceptual)**:
    *   Tool: `get_next_calendar_event`
    *   Example: "Wooster, what's my next meeting?"

The agent will be trained to understand natural language requests and translate them into the appropriate tool calls.

## Future Enhancements (Conceptual)

*   Modifying and deleting existing events.
*   Interacting with shared calendars or multiple user-specified calendars.
*   Setting up recurring events.

This document will be updated as the Google Calendar integration is further developed and new functionalities are added. 