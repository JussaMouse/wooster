import { calendar_v3 } from 'googleapis';

// Options for creating a calendar event
export interface CreateEventOptions {
  summary: string;
  description?: string;
  startDateTime: string; // ISO 8601 format
  endDateTime: string;   // ISO 8601 format
  timeZone?: string;    // e.g., 'America/New_York'
  attendees?: string[]; // Array of email addresses
  location?: string;
}

// Options for listing calendar events
export interface ListEventsOptions {
  timeMin?: string; // ISO 8601 format
  timeMax?: string; // ISO 8601 format
  maxResults?: number;
  orderBy?: 'startTime' | 'updated';
  singleEvents?: boolean; 
  q?: string; // Free-text query
}

// Type for a Google Calendar event object from the API
export type GCalEventData = calendar_v3.Schema$Event;

// Type for the function that creates a calendar event, to be registered as a service
export type CreateCalendarEventService = (options: CreateEventOptions) => Promise<string | GCalEventData>;

// Type for the function that lists calendar events, to be registered as a service
export type ListCalendarEventsService = (options?: ListEventsOptions) => Promise<string | GCalEventData[]>; 