# Plugin: Time Management

**Version:** 0.1.1
**Author:** Wooster AI Assistant
**Description:** Helps users manage their time effectively using time blocking principles, integrating with their calendar.

## Features

*   **Schedule Time Blocks:** Allows users to create time-blocked events in their calendar via an agent tool.
*   (Future) View daily schedule.
*   (Future) Find available time slots.
*   (Future) Assistance with rescheduling and reallocating time.

## Configuration

This plugin relies on the `GCalPlugin` for calendar interactions. Ensure `GCalPlugin` is configured and enabled.

*   **Environment Variable:** `PLUGIN_TIMEMANAGEMENT_ENABLED`
    *   **Description:** Controls whether the Time Management plugin is active.
    *   **Default:** `false` (Plugin is disabled if this variable is not explicitly set to `true`).
    *   **Values:** `true` or `false`.
    *   **Example:** `PLUGIN_TIMEMANAGEMENT_ENABLED=true`

## Dependencies

*   **`GCalPlugin`**: Required for all calendar operations. The Time Management plugin uses the `CreateCalendarEventService` provided by `GCalPlugin`.

## Agent Tools

### 1. `scheduleTimeBlock`

*   **Description:** Creates a new event in the user's Google Calendar to represent a time block. The tool parses natural language for dates, times, and durations.
*   **Invocation:** Natural language, which the LLM should convert into a JSON string input for the tool. E.g., "Wooster, schedule 'Write project proposal' from 10 AM to 12 PM tomorrow."
*   **Input (JSON string provided by LLM to the tool):**
    *   `summary` (string, required): The name or description of the time block (e.g., "Write project proposal").
    *   `startTime` (string, required): The start date and time (e.g., "tomorrow 10 AM", "2024-07-28T14:00:00").
    *   `endTime` (string, optional): The end date and time (e.g., "tomorrow 12 PM"). Provide either `endTime` or `duration`.
    *   `duration` (string, optional): The duration of the block (e.g., "2 hours", "90 minutes"). Provide either `endTime` or `duration`.
    *   `description` (string, optional): A more detailed description for the calendar event.
    *   `location` (string, optional): The location for the event.
    *   `attendees` (array of email strings, optional): A list of attendees to invite.
    *   `timeZone` (string, optional): The timezone for the event (e.g., "America/New_York"). Defaults to the system's timezone if not provided.
    *   **Example JSON input:** `{ "summary": "Work on report", "startTime": "tomorrow 2pm", "duration": "3 hours", "description": "Finalize Q3 report" }`
*   **Output:**
    *   Success: `OK, I've scheduled "[summary]". Event link: [URL_to_event_or_N/A]`
    *   Failure: An error message string, e.g., "Error: Could not understand the start time: ...", or "Error: Calendar creation service is not available."

## Future Ideas

*   Tool to list all time blocks for a given day.
*   Tool to find the next available slot for a given duration.
*   Integration with `DailyReviewPlugin` to summarize upcoming time blocks.
*   Smart suggestions for scheduling based on task priority (if integrated with `TaskCapturePlugin`). 