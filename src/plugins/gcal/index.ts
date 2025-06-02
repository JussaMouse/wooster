import { DynamicTool } from '@langchain/core/tools';
import { google, calendar_v3 } from 'googleapis';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';

export type GetCalendarEventsType = (options?: ListEventsOptions) => Promise<string | calendar_v3.Schema$Event[]>; // Adjusted for actual return type
export type CreateCalendarEventType = (options: CreateEventOptions) => Promise<string | calendar_v3.Schema$Event>;

let core: CoreServices | null = null;
let oauth2Client: any; // Consider a more specific type from googleapis
let calendarApi: calendar_v3.Calendar | null = null;
let defaultCalendarId: string = 'primary';

// Types from googleCalendarClient.ts (can be moved to a types.ts file within the plugin)
export interface CreateEventOptions {
  summary: string;
  description?: string;
  startDateTime: string; 
  endDateTime: string;   
  timeZone?: string;    
  attendees?: string[]; 
  location?: string;
}

export interface ListEventsOptions {
  timeMin?: string; 
  timeMax?: string; 
  maxResults?: number;
  orderBy?: 'startTime' | 'updated';
  singleEvents?: boolean; 
  q?: string; 
}

async function initializeInternalClient(config: AppConfig): Promise<boolean> {
  const calendarConfig = config.google?.calendar;
  if (!calendarConfig?.clientId || !calendarConfig?.clientSecret || !calendarConfig?.refreshToken) {
    core?.log(LogLevel.WARN, 'GCalPlugin: Missing clientId, clientSecret, or refreshToken in config.google.calendar. Calendar features will be disabled.');
    return false;
  }
  defaultCalendarId = calendarConfig.calendarId || 'primary';

  try {
    oauth2Client = new google.auth.OAuth2(
      calendarConfig.clientId,
      calendarConfig.clientSecret
    );
    oauth2Client.setCredentials({ refresh_token: calendarConfig.refreshToken });
    calendarApi = google.calendar({ version: 'v3', auth: oauth2Client });
    core?.log(LogLevel.INFO, 'GCalPlugin: Google Calendar client initialized successfully.');
    return true;
  } catch (error: any) {
    core?.log(LogLevel.ERROR, 'GCalPlugin: Failed to initialize Google Calendar client:', { error: error.message, stack: error.stack });
    calendarApi = null;
    return false;
  }
}

async function listEventsInternal(options: ListEventsOptions = {}): Promise<string | calendar_v3.Schema$Event[]> {
  if (!calendarApi) {
    return 'GCalPlugin: Calendar client not initialized.';
  }
  try {
    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId: defaultCalendarId,
      timeMin: options.timeMin || (new Date()).toISOString(),
      timeMax: options.timeMax,
      maxResults: options.maxResults || 10,
      singleEvents: options.singleEvents === undefined ? true : options.singleEvents,
      orderBy: options.orderBy || 'startTime',
      q: options.q,
    };
    core?.log(LogLevel.DEBUG, 'GCalPlugin: Listing Google Calendar events:', { calendarId: defaultCalendarId, options });
    const response = await calendarApi.events.list(params);
    core?.log(LogLevel.INFO, `GCalPlugin: Found ${response.data.items?.length || 0} Google Calendar events.`);
    return response.data.items || [];
  } catch (error: any) {
    core?.log(LogLevel.ERROR, 'GCalPlugin: Failed to list Google Calendar events:', { error: error.message, stack: error.stack });
    return `Failed to list events: ${error.message || 'Unknown error'}`;
  }
}

async function createEventInternal(options: CreateEventOptions): Promise<string | calendar_v3.Schema$Event> {
  if (!calendarApi) {
    return 'GCalPlugin: Calendar client not initialized.';
  }
   try {
    const event: calendar_v3.Params$Resource$Events$Insert = {
      calendarId: defaultCalendarId,
      requestBody: {
        summary: options.summary,
        description: options.description,
        start: {
          dateTime: options.startDateTime,
          timeZone: options.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, 
        },
        end: {
          dateTime: options.endDateTime,
          timeZone: options.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        attendees: options.attendees?.map(email => ({ email })),
        location: options.location,
      },
    };
    core?.log(LogLevel.DEBUG, 'GCalPlugin: Creating Google Calendar event:', { summary: options.summary });
    const response = await calendarApi.events.insert(event);
    if (response.status >= 200 && response.status < 300 && response.data && response.data.id) {
      core?.log(LogLevel.INFO, 'GCalPlugin: Google Calendar event created successfully.', { eventId: response.data.id });
      return response.data;
    } else {
      core?.log(LogLevel.ERROR, 'GCalPlugin: Event creation API call did not return success.', { status: response.status });
      return `Failed to create event: API returned status ${response.status}.`;
    }
  } catch (error: any) {
    core?.log(LogLevel.ERROR, 'GCalPlugin: Failed to create Google Calendar event:', { error: error.message, stack: error.stack });
    return `Failed to create event: ${error.message || 'Unknown error'}`;
  }
}

// Service function for DailyReview and other plugins
const getCalendarEventsFunction: GetCalendarEventsType = async (options?: ListEventsOptions) => {
    const events = await listEventsInternal(options || {});
    if (typeof events === 'string') return events; // Error string
    if (events.length === 0) return "No upcoming events found.";
    return events.map(event => {
        const start = event.start?.dateTime || event.start?.date;
        return `- ${start ? new Date(start).toLocaleString() : 'Date N/A'}: ${event.summary}`;
    }).join('\n');
};

// Agent Tools
const getCalendarEventsTool = new DynamicTool({
  name: "get_calendar_events",
  description: "Provides a summary of today's (or a specified range of) calendar events. Optional input: JSON string with ListEventsOptions (timeMin, timeMax, maxResults, q, etc.).",
  func: async (jsonInput?: string) => {
    core?.log(LogLevel.DEBUG, "GCalPlugin: get_calendar_events tool called.", { jsonInput });
    let options: ListEventsOptions = {};
    if (jsonInput) {
        try { options = JSON.parse(jsonInput); } 
        catch (e) { return "Invalid JSON input for get_calendar_events tool."; }
    }
    const eventsResult = await listEventsInternal(options);
    if (typeof eventsResult === 'string') return eventsResult; // Error string
    return JSON.stringify(eventsResult); 
  },
});

const createCalendarEventTool = new DynamicTool({
    name: "create_calendar_event",
    description: "Creates a new event in Google Calendar. Input must be a JSON string with CreateEventOptions (summary, startDateTime, endDateTime are required).",
    func: async (jsonInput: string) => {
        core?.log(LogLevel.DEBUG, "GCalPlugin: create_calendar_event tool called.", { jsonInput });
        try {
            const options = JSON.parse(jsonInput) as CreateEventOptions;
            if (!options.summary || !options.startDateTime || !options.endDateTime) {
                return "Invalid input for create_calendar_event: summary, startDateTime, and endDateTime are required.";
            }
            const result = await createEventInternal(options);
            if (typeof result === 'string') return result; // Error string
            return JSON.stringify(result);
        } catch (e) {
            return "Invalid JSON input for create_calendar_event tool.";
        }
    }
});

class GCalPluginDefinition implements WoosterPlugin {
  readonly name = "gcal";
  readonly version = "1.1.0"; // Updated version
  readonly description = "Provides Google Calendar event listing and creation.";

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    core.log(LogLevel.INFO, `GCalPlugin (v${this.version}): Initializing...`);
    const initialized = await initializeInternalClient(config);
    if (initialized) {
        services.registerService("getCalendarEventsFunction", getCalendarEventsFunction);
        // services.registerService("createCalendarEventFunction", createEventInternal); // If needed by other plugins directly
        core.log(LogLevel.INFO, 'GCalPlugin: Calendar functions registered as services.');
    } else {
        core.log(LogLevel.WARN, 'GCalPlugin: Client not initialized. Services not registered.');
    }
  }

  getAgentTools?(): DynamicTool[] {
    const appConfig = core?.getConfig();
    if (appConfig && appConfig.plugins[this.name] === true && calendarApi) {
        core?.log(LogLevel.DEBUG, 'GCalPlugin: Providing Google Calendar tools because plugin is enabled and client initialized.');
        return [getCalendarEventsTool, createCalendarEventTool];
    }
    core?.log(LogLevel.DEBUG, 'GCalPlugin: Not providing Google Calendar tools (plugin disabled or client not initialized).');
    return [];
  }
}

export default new GCalPluginDefinition(); 