import { google, calendar_v3 } from 'googleapis';
import { AppConfig, GoogleCalendarConfig } from '../configLoader';
import { log, LogLevel } from '../logger';

let oauth2Client: any; // Consider a more specific type from googleapis
let calendarApi: calendar_v3.Calendar;

/**
 * Initializes the Google Calendar client with OAuth2 credentials from the config.
 * This should be called once, typically during plugin initialization.
 * @param config The application configuration containing Google Calendar settings.
 */
export function initializeGoogleCalendarClient(config: GoogleCalendarConfig): boolean {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    log(LogLevel.WARN, 'Google Calendar client: Missing clientId, clientSecret, or refreshToken. Calendar features will be disabled.');
    return false;
  }

  try {
    oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret
    );
    oauth2Client.setCredentials({ refresh_token: config.refreshToken });

    calendarApi = google.calendar({ version: 'v3', auth: oauth2Client });
    log(LogLevel.INFO, 'Google Calendar client initialized successfully.');
    return true;
  } catch (error: any) {
    log(LogLevel.ERROR, 'Failed to initialize Google Calendar client:', { error });
    return false;
  }
}

export interface CreateEventOptions {
  summary: string;
  description?: string;
  startDateTime: string; // ISO 8601 format (e.g., "2024-07-04T09:00:00-07:00")
  endDateTime: string;   // ISO 8601 format
  timeZone?: string;    // e.g., "America/Los_Angeles"
  attendees?: string[]; // Array of email addresses
  location?: string;
}

/**
 * Creates a new event in the Google Calendar.
 * @param options The event details.
 * @param calendarId The ID of the calendar to add the event to (e.g., "primary").
 * @returns The created event details or an error message.
 */
export async function createCalendarEvent(options: CreateEventOptions, calendarId: string = 'primary'): Promise<calendar_v3.Schema$Event | string> {
  if (!calendarApi) {
    return 'Google Calendar client is not initialized. Cannot create event.';
  }
  if (!calendarId) {
    return 'Calendar ID must be provided to create an event.';
  }

  try {
    const event: calendar_v3.Params$Resource$Events$Insert = {
      calendarId: calendarId,
      requestBody: {
        summary: options.summary,
        description: options.description,
        start: {
          dateTime: options.startDateTime,
          timeZone: options.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, // Default to system timezone
        },
        end: {
          dateTime: options.endDateTime,
          timeZone: options.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        attendees: options.attendees?.map(email => ({ email })),
        location: options.location,
      },
    };

    log(LogLevel.DEBUG, 'Attempting to create Google Calendar event:', { summary: options.summary, start: options.startDateTime, calendarId });
    const response = await calendarApi.events.insert(event);
    log(LogLevel.INFO, 'Google Calendar event created successfully:', { eventId: response.data.id, summary: response.data.summary });
    return response.data;
  } catch (error: any) {
    log(LogLevel.ERROR, 'Failed to create Google Calendar event:', { error, summary: options.summary });
    return `Failed to create event: ${error.message || 'Unknown error'}`;
  }
}

export interface ListEventsOptions {
  timeMin?: string; // ISO 8601 format (e.g., "2024-07-01T00:00:00Z"). Defaults to now.
  timeMax?: string; // ISO 8601 format. If not provided, might list ongoing/future events based on API defaults.
  maxResults?: number;
  orderBy?: 'startTime' | 'updated';
  singleEvents?: boolean; // Whether to expand recurring events.
  q?: string; // Free text search.
}

/**
 * Lists events from the Google Calendar.
 * @param options Filtering options for listing events.
 * @param calendarId The ID of the calendar to list events from (e.g., "primary").
 * @returns A list of events or an error message.
 */
export async function listCalendarEvents(options: ListEventsOptions = {}, calendarId: string = 'primary'): Promise<calendar_v3.Schema$Event[] | string> {
  if (!calendarApi) {
    return 'Google Calendar client is not initialized. Cannot list events.';
  }
   if (!calendarId) {
    return 'Calendar ID must be provided to list events.';
  }

  try {
    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId: calendarId,
      timeMin: options.timeMin || (new Date()).toISOString(),
      timeMax: options.timeMax,
      maxResults: options.maxResults || 10,
      singleEvents: options.singleEvents === undefined ? true : options.singleEvents,
      orderBy: options.orderBy || 'startTime',
      q: options.q,
    };
    log(LogLevel.DEBUG, 'Attempting to list Google Calendar events:', { calendarId, options });
    const response = await calendarApi.events.list(params);
    log(LogLevel.INFO, `Found ${response.data.items?.length || 0} Google Calendar events.`);
    return response.data.items || [];
  } catch (error: any) {
    log(LogLevel.ERROR, 'Failed to list Google Calendar events:', { error, calendarId });
    return `Failed to list events: ${error.message || 'Unknown error'}`;
  }
} 