import { DynamicTool } from "@langchain/core/tools";
import { AppConfig } from "../configLoader";
import { WoosterPlugin } from "../pluginTypes";
import { log, LogLevel } from "../logger";
import {
  initializeGoogleCalendarClient,
  createCalendarEvent,
  listCalendarEvents,
  CreateEventOptions,
  ListEventsOptions,
} from "../tools/googleCalendarClient";
import { calendar_v3 } from 'googleapis';

let isClientInitialized = false;
let globalAppConfig: AppConfig;

const GoogleCalendarPlugin: WoosterPlugin = {
  name: "GoogleCalendarPlugin",
  version: "0.1.0",
  description: "A plugin that provides tools for interacting with Google Calendar, such as creating and listing events.",

  initialize: async (config: AppConfig) => {
    globalAppConfig = config;
    if (config.tools.googleCalendar.enabled) {
      isClientInitialized = initializeGoogleCalendarClient(config.tools.googleCalendar);
      if (isClientInitialized) {
        log(LogLevel.INFO, "GoogleCalendarPlugin initialized successfully and GCal client is ready.");
      } else {
        log(LogLevel.WARN, "GoogleCalendarPlugin: Google Calendar client failed to initialize. Calendar tools will not be available.");
      }
    } else {
      log(LogLevel.INFO, "GoogleCalendarPlugin: Google Calendar integration is disabled in configuration.");
    }
  },

  getAgentTools: () => {
    if (!globalAppConfig || !globalAppConfig.tools.googleCalendar.enabled || !isClientInitialized) {
      log(LogLevel.DEBUG, "GoogleCalendarPlugin: Conditions not met to provide tools (plugin not initialized, GCal disabled, or client init failed).");
      return [];
    }

    const tools: DynamicTool[] = [];

    const createEventTool = new DynamicTool({
      name: "create_calendar_event",
      description: "Creates a new event in Google Calendar. Input must be an object with 'summary' (string, event title), 'startDateTime' (string, ISO 8601 format, e.g., \"2024-07-04T09:00:00-07:00\"), and 'endDateTime' (string, ISO 8601 format). Optional fields: 'description' (string), 'timeZone' (string, e.g., \"America/Los_Angeles\"), 'attendees' (array of email strings), 'location' (string).",
      func: async (input: string | Record<string, any>) => {
        let args: CreateEventOptions;
        try {
          if (typeof input === 'string') args = JSON.parse(input) as CreateEventOptions;
          else if (typeof input === 'object' && input !== null) args = input as CreateEventOptions;
          else return "Invalid input type for create_calendar_event. Expected JSON string or object.";

          if (!args.summary || !args.startDateTime || !args.endDateTime) {
            return "Invalid input for create_calendar_event: Missing required fields 'summary', 'startDateTime', or 'endDateTime'.";
          }
          // Basic ISO 8601 validation (does not cover all cases but catches common errors)
          const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
          if (!iso8601Regex.test(args.startDateTime) || !iso8601Regex.test(args.endDateTime)) {
            return "Invalid date format for startDateTime or endDateTime. Please use full ISO 8601 format (e.g., YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DDTHH:MM:SS+/-HH:MM).";
          }

        } catch (e: any) {
          return `Invalid input for create_calendar_event: ${e.message}. Ensure it's a valid JSON object with summary, startDateTime, and endDateTime.`;
        }
        
        const calendarIdToUse = globalAppConfig.tools.googleCalendar.calendarId || 'primary';
        const result = await createCalendarEvent(args, calendarIdToUse);
        if (typeof result === 'string') return result; // Error message
        return `Event created successfully: ${result.summary} (ID: ${result.id})`; // Success message with event details
      },
    });
    tools.push(createEventTool);

    const listEventsTool = new DynamicTool({
      name: "list_calendar_events",
      description: "Lists events from Google Calendar. Input is an optional object. Fields: 'timeMin' (string, ISO 8601, defaults to now), 'timeMax' (string, ISO 8601), 'maxResults' (number, default 10), 'orderBy' (string, 'startTime' or 'updated'), 'singleEvents' (boolean, default true), 'q' (string, free text search).",
      func: async (input: string | Record<string, any> | undefined) => {
        let args: ListEventsOptions = {};
        try {
          if (typeof input === 'string') args = JSON.parse(input) as ListEventsOptions;
          else if (typeof input === 'object' && input !== null) args = input as ListEventsOptions;
          // Allow undefined input for default listing
        } catch (e: any) {
          return `Invalid input for list_calendar_events: ${e.message}. Ensure it's a valid JSON object or undefined for defaults.`;
        }

        const calendarIdToUse = globalAppConfig.tools.googleCalendar.calendarId || 'primary';
        const result = await listCalendarEvents(args, calendarIdToUse);
        if (typeof result === 'string') return result; // Error message
        if (result.length === 0) return "No events found matching your criteria.";
        
        return result.map((event: calendar_v3.Schema$Event) => ({
          id: event.id,
          summary: event.summary,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          location: event.location,
          description: event.description,
          url: event.htmlLink
        })); // Return a structured list of event details
      },
    });
    tools.push(listEventsTool);

    log(LogLevel.INFO, `GoogleCalendarPlugin providing ${tools.length} tools.`);
    return tools;
  }
};

export default GoogleCalendarPlugin; 