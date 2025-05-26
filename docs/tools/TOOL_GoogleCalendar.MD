# Tools: Google Calendar (`create_calendar_event`, `list_calendar_events`)

This document details the Google Calendar interaction tools available to Wooster's agent, provided by the `GoogleCalendarPlugin`.

## 1. Purpose

The `GoogleCalendarPlugin` allows the agent to interact with the user's Google Calendar to create new events and list existing ones.

## 2. Plugin Provider

- **Plugin**: `GoogleCalendarPlugin` (from `src/plugins/googleCalendarPlugin.ts`)
- **Core Logic**: `src/tools/googleCalendarClient.ts` (using `googleapis` library)

## 3. General Configuration

For these tools to be available and functional, the following conditions must be met:

- **Plugin Activation**: `PLUGIN_GOOGLECALENDARPLUGIN_ENABLED` must be `true` (or not set, thus defaulting to true) in `.env`.
- **Tool Enablement**: `TOOLS_GOOGLE_CALENDAR_ENABLED` must be `true` in `.env`.
- **API Credentials**: The following must be correctly configured in `.env` (see `06 CONFIG.MD` for details):
    - `GOOGLE_CLIENT_ID`
    - `GOOGLE_CLIENT_SECRET`
    - `GOOGLE_CALENDAR_REFRESH_TOKEN`
- **Target Calendar**: `GOOGLE_CALENDAR_ID` (defaults to `primary` if not set) specifies which calendar to operate on.

If the plugin is not active, or the tool is not enabled, or the client fails to initialize (e.g., due to missing credentials), these tools will not be available to the agent.

--- 

## Tool 1: Create Calendar Event

### a. Tool Name

`create_calendar_event`

### b. Agent-Facing Description

```
Creates a new event in Google Calendar. Input must be an object with 'summary' (string, event title), 'startDateTime' (string, ISO 8601 format, e.g., "2024-07-04T09:00:00-07:00"), and 'endDateTime' (string, ISO 8601 format). Optional fields: 'description' (string), 'timeZone' (string, e.g., "America/Los_Angeles"), 'attendees' (array of email strings), 'location' (string).
```

### c. Input Schema

- **Type**: `object` (or a JSON string that parses to this object)
- **Properties**:
    - `summary`: 
        - Type: `string`
        - Description: The title or summary of the event.
        - **Required**: Yes
    - `startDateTime`:
        - Type: `string`
        - Description: The start date and time of the event in ISO 8601 format (e.g., `YYYY-MM-DDTHH:MM:SSZ` or `YYYY-MM-DDTHH:MM:SS+/-HH:MM`).
        - **Required**: Yes
    - `endDateTime`:
        - Type: `string`
        - Description: The end date and time of the event in ISO 8601 format.
        - **Required**: Yes
    - `description`:
        - Type: `string` (optional)
        - Description: A more detailed description of the event.
    - `timeZone`:
        - Type: `string` (optional)
        - Description: The IANA time zone name for the event's start and end times (e.g., `America/Los_Angeles`, `Europe/London`). Defaults to the system's time zone if not provided.
    - `attendees`:
        - Type: `array` of `string` (optional)
        - Description: A list of email addresses of attendees to invite to the event.
    - `location`:
        - Type: `string` (optional)
        - Description: The location of the event.
- **Example Agent Input** (as an object):
  ```json
  {
    "summary": "Team Meeting",
    "startDateTime": "2024-08-15T10:00:00-07:00",
    "endDateTime": "2024-08-15T11:00:00-07:00",
    "description": "Discuss project milestones.",
    "attendees": ["user1@example.com", "user2@example.com"],
    "location": "Conference Room 3"
  }
  ```

### d. Output Schema

- **Type**: `string`
- **Description**: On success, a confirmation message like `"Event created successfully: Team Meeting (ID: event_id_string)"`. On failure, an error message string detailing the issue.

--- 

## Tool 2: List Calendar Events

### a. Tool Name

`list_calendar_events`

### b. Agent-Facing Description

```
Lists events from Google Calendar. Input is an optional object. Fields: 'timeMin' (string, ISO 8601, defaults to now), 'timeMax' (string, ISO 8601), 'maxResults' (number, default 10), 'orderBy' (string, 'startTime' or 'updated'), 'singleEvents' (boolean, default true), 'q' (string, free text search).
```

### c. Input Schema

- **Type**: `object` (optional, or a JSON string that parses to this object). If no input or an empty object is provided, defaults will be used.
- **Properties**:
    - `timeMin`:
        - Type: `string` (optional, ISO 8601 format)
        - Description: The start of the time range to query events. Defaults to the current time if not provided.
    - `timeMax`:
        - Type: `string` (optional, ISO 8601 format)
        - Description: The end of the time range. If not provided, the API might have its own default range or only show upcoming events.
    - `maxResults`:
        - Type: `number` (optional)
        - Description: The maximum number of events to return. Defaults to 10.
    - `orderBy`:
        - Type: `string` (optional)
        - Values: `startTime` or `updated`
        - Description: The order of the events returned. Defaults to `startTime`.
    - `singleEvents`:
        - Type: `boolean` (optional)
        - Description: Whether to expand recurring events into single instances. Defaults to `true`.
    - `q`:
        - Type: `string` (optional)
        - Description: Free-text search query to filter events.
- **Example Agent Input** (as an object):
  ```json
  {
    "timeMin": "2024-08-01T00:00:00Z",
    "timeMax": "2024-08-31T23:59:59Z",
    "q": "meeting"
  }
  ```

### d. Output Schema

- **Type**: `array` of `object` or `string`
- **Description**: 
    - On success with events found: An array of event objects, each containing `id`, `summary`, `start` (dateTime or date), `end` (dateTime or date), `location`, `description`, and `url`.
    - On success with no events found: A string message like `"No events found matching your criteria."´.
    - On failure: An error message string.
- **Example Successful Output (Array of Events)**:
  ```json
  [
    {
      "id": "event_id_1",
      "summary": "Project Sync",
      "start": "2024-08-15T10:00:00-07:00",
      "end": "2024-08-15T11:00:00-07:00",
      "location": "Online",
      "description": "Catch up on project status.",
      "url": "https://calendar.google.com/event?eid=example_event_id_1"
    },
    // ... more events
  ]
  ```

## 7. When to Use (Agent Guidance)

The agent should consider using these tools when:

- The user explicitly asks to create a calendar event, schedule something, or add an item to their calendar (`create_calendar_event`).
- The user asks about their schedule, what events they have, or asks to find specific events (`list_calendar_events`).
- The user asks to check their availability at a certain time (`list_calendar_events` could be used to see existing commitments).

## 8. When NOT to Use

- If the user is asking for general date/time information not related to their calendar (e.g., "What day is Christmas?"). Use `web_search` or direct knowledge.
- If any required configuration for Google Calendar is known to be missing or the client is not initialized (the tools will return errors, but ideally the agent avoids calling them if it can infer this, though this is hard to guarantee). 