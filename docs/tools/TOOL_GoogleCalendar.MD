# Tools: Google Calendar (`create_calendar_event`, `get_calendar_events`)

This document details the Google Calendar interaction tools available to Wooster's agent, provided by the `GCalPlugin`.

## 1. Purpose

The `GCalPlugin` allows the agent to interact with the user's Google Calendar to create new events and list existing ones.

## 2. Plugin Provider

- **Plugin**: `GCalPlugin` (from `src/plugins/gcal/index.ts`)
- **Core Logic**: Implemented within `src/plugins/gcal/index.ts` using the `googleapis` library.

## 3. General Configuration

For these tools to be available and functional, the following conditions must be met:

- **Plugin Activation**: `PLUGIN_GCAL_ENABLED` must be `true` in `.env`. (Defaults to `false` if not set).
- **API Credentials**: The following must be correctly configured in `.env`:
    - `GOOGLE_CLIENT_ID`
    - `GOOGLE_CLIENT_SECRET`
    - `GOOGLE_CALENDAR_REFRESH_TOKEN`
- **Target Calendar**: `GOOGLE_CALENDAR_ID` (defaults to `primary` if not set) specifies which calendar to operate on.

For detailed instructions on setting these environment variables, including how to obtain the necessary Google OAuth credentials, please refer to the main Wooster configuration documentation.

If the plugin is not active or if the client fails to initialize (e.g., due to missing credentials), these tools will not be available to the agent.

--- 

## Tool 1: Create Calendar Event

### a. Tool Name

`create_calendar_event`

### b. Agent-Facing Description

```
Creates a new event in Google Calendar. Input must be a JSON string representing an object with 'summary' (string, event title), 'startDateTime' (string, ISO 8601 format, e.g., "2024-07-04T09:00:00-07:00"), and 'endDateTime' (string, ISO 8601 format). Optional fields: 'description' (string), 'timeZone' (string, e.g., "America/Los_Angeles"), 'attendees' (array of email strings), 'location' (string). Returns the created event data as a JSON string on success.
```

### c. Input Schema

- **Type**: JSON string. This string must parse into an object matching the `CreateEventOptions` interface (see `src/plugins/gcal/types.ts`).
- **Properties (of the parsed JSON object)**:
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
        - Description: The IANA time zone name for the event's start and end times (e.g., `America/Los_Angeles`, `Europe/London`). Defaults to the system's time zone if not provided by the GCalPlugin.
    - `attendees`:
        - Type: `array` of `string` (optional)
        - Description: A list of email addresses of attendees to invite to the event.
    - `location`:
        - Type: `string` (optional)
        - Description: The location of the event.
- **Example Agent Input JSON string**:
  ```json
  "{\"summary\": \"Team Meeting\", \"startDateTime\": \"2024-08-15T10:00:00-07:00\", \"endDateTime\": \"2024-08-15T11:00:00-07:00\", \"description\": \"Discuss project milestones.\", \"attendees\": [\"user1@example.com\", \"user2@example.com\"], \"location\": \"Conference Room 3\"}"
  ```

### d. Output Schema

- **Type**: `string`
- **Description**: 
    - On success: A JSON string representing the created Google Calendar event object (`GCalEventData` from `src/plugins/gcal/types.ts`).
    - On failure: An error message string detailing the issue.
- **Example Successful Output (JSON string of the event)**:
  ```json
  "{\"kind\":\"calendar#event\",\"etag\":\"\\\"example_etag\\\"\",\"id\":\"example_event_id\",\"status\":\"confirmed\",\"htmlLink\":\"https://www.google.com/calendar/event?eid=example_event_id\",\"created\":\"2024-08-01T12:30:00.000Z\",\"updated\":\"2024-08-01T12:30:00.500Z\",\"summary\":\"Team Meeting\",\"description\":\"Discuss project milestones.\",\"location\":\"Conference Room 3\",\"creator\":{\"email\":\"user@example.com\",\"self\":true},\"organizer\":{\"email\":\"user@example.com\",\"self\":true},\"start\":{\"dateTime\":\"2024-08-15T10:00:00-07:00\",\"timeZone\":\"America/Los_Angeles\"},\"end\":{\"dateTime\":\"2024-08-15T11:00:00-07:00\",\"timeZone\":\"America/Los_Angeles\"}, \"attendees\": [{\"email\":\"user1@example.com\", \"responseStatus\":\"needsAction\"},{\"email\":\"user2@example.com\", \"responseStatus\":\"needsAction\"}], \"iCalUID\":\"example_uid@google.com\",\"sequence\":0,\"reminders\":{\"useDefault\":true}}"
  ```

--- 

## Tool 2: Get Calendar Events

### a. Tool Name

`get_calendar_events`

### b. Agent-Facing Description

```
Lists events from Google Calendar. Input is an optional JSON string representing an object with fields: 'timeMin' (string, ISO 8601, defaults to now), 'timeMax' (string, ISO 8601), 'maxResults' (number, default 10), 'orderBy' (string, 'startTime' or 'updated'), 'singleEvents' (boolean, default true), 'q' (string, free text search). Returns a JSON string of the event array or an error string.
```

### c. Input Schema

- **Type**: JSON string (optional). This string must parse into an object matching the `ListEventsOptions` interface (see `src/plugins/gcal/types.ts`). If no input or an empty JSON string/object is provided, defaults will be used.
- **Properties (of the parsed JSON object)**:
    - `timeMin`:
        - Type: `string` (optional, ISO 8601 format)
        - Description: The start of the time range to query events. Defaults to the current time if not provided.
    - `timeMax`:
        - Type: `string` (optional, ISO 8601 format)
        - Description: The end of the time range. If not provided, the API might have its own default range.
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
- **Example Agent Input JSON string**:
  ```json
  "{\"timeMin\": \"2024-08-01T00:00:00Z\", \"timeMax\": \"2024-08-31T23:59:59Z\", \"q\": \"meeting\"}"
  ```

### d. Output Schema

- **Type**: `string`
- **Description**: 
    - On success: A JSON string representing an array of Google Calendar event objects (`GCalEventData[]`). This array might be empty if no events match.
    - On failure: An error message string detailing the issue.
- **Example Successful Output (JSON string of an array of events)**:
  ```json
  "[{\"id\":\"event_id_1\",\"summary\":\"Project Sync\",\"start\":{\"dateTime\":\"2024-08-15T10:00:00-07:00\"},\"end\":{\"dateTime\":\"2024-08-15T11:00:00-07:00\"}},{\"id\":\"event_id_2\",\"summary\":\"Another Meeting\",\"start\":{\"dateTime\":\"2024-08-16T14:00:00-07:00\"},\"end\":{\"dateTime\":\"2024-08-16T15:00:00-07:00\"}}]"
  ```

--- 

## 7. When to Use (Agent Guidance)

The agent should consider using these tools when:

- The user explicitly asks to create a calendar event, schedule something, or add an item to their calendar (`create_calendar_event`).
- The user asks about their schedule, what events they have, or asks to find specific events (`get_calendar_events`).
- The user asks to check their availability at a certain time (`get_calendar_events` could be used to see existing commitments).

## 8. When NOT to Use

- If the user is asking for general date/time information not related to their calendar (e.g., "What day is Christmas?"). Use `web_search` or direct knowledge.
- If any required configuration for Google Calendar is known to be missing or the client is not initialized (the tools will return errors). 