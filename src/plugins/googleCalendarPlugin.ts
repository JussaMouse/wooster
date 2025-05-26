import { DynamicTool } from "@langchain/core/tools";
import { z } from 'zod';
import { AppConfig } from "../configLoader";
import { WoosterPlugin } from "../pluginTypes";
import { log, LogLevel } from "../logger";
import {
  initializeGoogleCalendarClient,
  createCalendarEvent as createCalendarEventClient,
  listCalendarEvents as listCalendarEventsClient,
  createCalendar as createCalendarClient,
  CreateEventOptions,
  ListEventsOptions,
  CreateCalendarOptions,
} from "../tools/googleCalendarClient";
import { calendar_v3 } from 'googleapis';
import { parseDateString } from "../scheduler/scheduleParser";

let isClientInitialized = false;
let globalAppConfig: AppConfig;

// Zod Schemas for Calendar Tools
const createEventSchema = z.object({
  summary: z.string().describe("The title or summary of the event."),
  startDateTime: z.string().describe("The start date and time of the event in natural language (e.g., 'tomorrow at 2pm', 'next Monday 9am')."),
  endDateTime: z.string().describe("The end date and time of the event in natural language (e.g., 'tomorrow at 3pm', 'next Monday 10am')."),
  description: z.string().optional().describe("A more detailed description of the event."),
  timeZone: z.string().optional().describe("The IANA timezone name (e.g., 'America/Los_Angeles'). If not provided, times are assumed local and converted to UTC."),
  attendees: z.array(z.string().email({ message: "Invalid email format in attendees list." })).optional().describe("An array of email addresses for attendees."),
  location: z.string().optional().describe("The location of the event."),
});

const listEventsSchema = z.object({
  timeMin: z.string().optional().describe("The minimum start time for events to list, in natural language or ISO 8601 format (e.g., 'today', 'next Monday', '2024-07-01T00:00:00Z'). Defaults to now if not provided."),
  timeMax: z.string().optional().describe("The maximum end time for events to list, in natural language or ISO 8601 format (e.g., 'end of today', 'next Friday', '2024-07-07T23:59:59Z')."),
  maxResults: z.number().int().positive().optional().describe("The maximum number of events to return."),
  orderBy: z.enum(['startTime', 'updated']).optional().describe("The order of the events returned in the result. 'startTime' (default) or 'updated'."),
  singleEvents: z.boolean().optional().describe("Whether to expand recurring events into instances. Default is true."),
  q: z.string().optional().describe("Free text search terms to filter events by."),
});

// Zod Schema for Create Calendar Tool
const createCalendarSchema = z.object({
  summary: z.string().describe("The title or summary of the new calendar."),
  timeZone: z.string().optional().describe("The IANA timezone name (e.g., 'America/Los_Angeles'). If not provided, the system's current timezone will be used."),
});

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
      description: "Creates a new event in Google Calendar. Expects a single JSON string argument. The JSON string should parse into an object with required keys: 'summary' (string), 'startDateTime' (natural language date/time, e.g., 'tomorrow at 2pm'), and 'endDateTime' (natural language date/time, e.g., 'next Monday 10am'). Optional keys in the JSON object: 'description' (string), 'timeZone' (string, e.g., 'America/Los_Angeles'), 'attendees' (array of email strings), 'location' (string). Example JSON string: '{\"summary\":\"Team Meeting\",\"startDateTime\":\"next Tuesday 10am\",\"endDateTime\":\"next Tuesday 11am\",\"attendees\":[\"user@example.com\"]}'",
      // schema: createEventSchema, // Schema is not used here; parsing is manual.
      func: async (toolInput: string) => {
        log(LogLevel.DEBUG, "create_calendar_event plugin func: Received toolInput (string expected):", typeof toolInput, toolInput);

        let argsObject: any;
        try {
          if (typeof toolInput !== 'string') {
            throw new Error(`Expected a string input, but received type ${typeof toolInput}. Value: ${JSON.stringify(toolInput)}`);
          }
          argsObject = JSON.parse(toolInput);
        } catch (e: any) {
          log(LogLevel.ERROR, "create_calendar_event: Failed to parse input string to JSON", { input: toolInput, error: e.message });
          return `Error: Invalid input. Expected a single JSON string. ${e.message}`;
        }

        // At this point, argsObject should be the parsed object from the JSON string.
        // No need to check for a nested 'input' key if the LLM follows the new description.

        let parsedArgs: z.infer<typeof createEventSchema>;
        try {
          parsedArgs = createEventSchema.parse(argsObject);
        } catch (e: any) {
          log(LogLevel.ERROR, "create_calendar_event: Zod validation failed for parsed arguments", { args: argsObject, error: e.errors });
          const errorMessages = e.errors.map((err: any) => `${err.path.join('.')} - ${err.message}`).join(', ');
          return `Error: Invalid arguments in JSON. ${errorMessages}. Please ensure summary, startDateTime, and endDateTime are provided correctly.`;
        }
        
        try {
          const startDate = parseDateString(parsedArgs.startDateTime);
          if (!startDate) {
            return `Invalid startDateTime in JSON: Could not parse "${parsedArgs.startDateTime}". Please use a clear natural language date/time.`;
          }

          const endDate = parseDateString(parsedArgs.endDateTime);
          if (!endDate) {
            return `Invalid endDateTime in JSON: Could not parse "${parsedArgs.endDateTime}". Please use a clear natural language date/time.`;
          }

          if (endDate <= startDate) {
            return `End time "${parsedArgs.endDateTime}" (parsed as ${endDate.toISOString()}) must be after start time "${parsedArgs.startDateTime}" (parsed as ${startDate.toISOString()}).`;
          }
          
          const finalOptions: CreateEventOptions = {
            summary: parsedArgs.summary,
            startDateTime: startDate.toISOString(),
            endDateTime: endDate.toISOString(),
            description: parsedArgs.description,
            timeZone: parsedArgs.timeZone,
            attendees: parsedArgs.attendees,
            location: parsedArgs.location,
          };

          const calendarIdToUse = globalAppConfig.tools.googleCalendar.calendarId || 'primary';
          const result = await createCalendarEventClient(finalOptions, calendarIdToUse);
          log(LogLevel.DEBUG, "create_calendar_event: Google Calendar API call result:", result);
          if (typeof result === 'string') { // Error string from createCalendarEventClient
            return result;
          }
          // Assuming result is calendar_v3.Schema$Event if not a string error
          return `Event created successfully: ${result.summary} (ID: ${result.id}) from ${startDate.toLocaleString()} to ${endDate.toLocaleString()}`;

        } catch (e: any) {
          log(LogLevel.ERROR, "Error in create_calendar_event tool logic after Zod parsing:", { error: e.message, stack: e.stack, parsedArgs });
          return `Error processing create_calendar_event: ${e.message}.`;
        }
      },
    });
    tools.push(createEventTool);

    const listEventsTool = new DynamicTool({
      name: "list_calendar_events",
      description: "Lists events from Google Calendar. Optional filter arguments: 'timeMin' (natural language or ISO 8601, e.g., 'today'), 'timeMax' (natural language or ISO 8601, e.g., 'end of next week'), 'maxResults' (number), 'orderBy' ('startTime' or 'updated'), 'singleEvents' (boolean), 'q' (string search query).",
      schema: listEventsSchema,
      func: async (toolInput: string) => {
        log(LogLevel.DEBUG, "list_calendar_events plugin func: Received toolInput (string expected):", typeof toolInput, toolInput);

        let rawArgs: Record<string, any> | z.infer<typeof listEventsSchema> | undefined;
        try {
          if (toolInput.trim() === "") {
            rawArgs = {};
          } else {
            rawArgs = JSON.parse(toolInput);
          }
        } catch (e: any) {
          log(LogLevel.ERROR, "list_calendar_events: Failed to parse input string to JSON", { input: toolInput, error: e.message });
          return `Error: Invalid input. Expected a JSON string or empty for defaults. ${e.message}`;
        }

        if (rawArgs === undefined || rawArgs === null) {
          log(LogLevel.ERROR, "list_calendar_events plugin func: Received undefined or null arguments.");
          return "Error: Tool received no arguments. Please provide event listing criteria.";
        }

        const args = ('input' in rawArgs && typeof rawArgs.input === 'object' && rawArgs.input !== null)
          ? rawArgs.input as z.infer<typeof listEventsSchema>
          : rawArgs as z.infer<typeof listEventsSchema>;

        try {
          const finalOptions: ListEventsOptions = { 
            timeMin: args.timeMin,
            timeMax: args.timeMax,
            maxResults: args.maxResults,
            orderBy: args.orderBy,
            singleEvents: args.singleEvents,
            q: args.q,
          };

          if (args.timeMin) {
            const parsedTimeMin = parseDateString(args.timeMin);
            if (!parsedTimeMin) return `Invalid timeMin: Could not parse "${args.timeMin}".`;
            finalOptions.timeMin = parsedTimeMin.toISOString();
          }
          if (args.timeMax) {
            const parsedTimeMax = parseDateString(args.timeMax);
            if (!parsedTimeMax) return `Invalid timeMax: Could not parse "${args.timeMax}".`;
            finalOptions.timeMax = parsedTimeMax.toISOString();
          }

          (Object.keys(listEventsSchema.shape) as Array<keyof z.infer<typeof listEventsSchema>>).forEach(key => {
            if (args[key] !== undefined && key !== 'timeMin' && key !== 'timeMax') {
              (finalOptions as any)[key] = args[key];
            }
          });

          if (finalOptions.timeMin && finalOptions.timeMax) {
            const dMin = new Date(finalOptions.timeMin);
            const dMax = new Date(finalOptions.timeMax);
            if (dMax <= dMin) {
              return `Error: timeMax (${args.timeMax} / ${finalOptions.timeMax}) must be after timeMin (${args.timeMin} / ${finalOptions.timeMin}).`;
            }
          }

          const calendarIdToUse = globalAppConfig.tools.googleCalendar.calendarId || 'primary';
          const result = await listCalendarEventsClient(finalOptions, calendarIdToUse);

          if (typeof result === 'string') return result;
          if (result.length === 0) return "No events found matching your criteria.";
          
          return result.map((event: calendar_v3.Schema$Event) => ({
            id: event.id,
            summary: event.summary,
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            location: event.location,
            description: event.description,
            url: event.htmlLink
          }));
        } catch (e: any) {
          log(LogLevel.ERROR, "Error in list_calendar_events tool func:", { error: e, input: args });
          return `Error processing list_calendar_events: ${e.message}.`;
        }
      },
    });
    tools.push(listEventsTool);

    // Create Calendar Tool
    const createCalendarTool = new DynamicTool({
      name: "create_calendar",
      description: 'Creates a new secondary Google Calendar. Expects a single JSON string argument. The JSON string should parse into an object with a required key: \'summary\' (string, the title of the new calendar). Optional key: \'timeZone\' (string, e.g., \'America/Los_Angeles\'). Example JSON string: \'{"summary":"My New Calendar", "timeZone":"Europe/Berlin"}\'',
      func: async (toolInput: string) => {
        log(LogLevel.DEBUG, "create_calendar plugin func: Received toolInput (string expected):", typeof toolInput, toolInput);

        let argsObject: any;
        try {
          if (typeof toolInput !== 'string') {
            throw new Error(`Expected a string input, but received type ${typeof toolInput}. Value: ${JSON.stringify(toolInput)}`);
          }
          argsObject = JSON.parse(toolInput);
        } catch (e: any) {
          log(LogLevel.ERROR, "create_calendar: Failed to parse input string to JSON", { input: toolInput, error: e.message });
          return `Error: Invalid input. Expected a single JSON string. ${e.message}`;
        }

        let parsedArgs: z.infer<typeof createCalendarSchema>;
        try {
          parsedArgs = createCalendarSchema.parse(argsObject);
        } catch (e: any) {
          log(LogLevel.ERROR, "create_calendar: Zod validation failed for parsed arguments", { args: argsObject, error: e.errors });
          const errorMessages = e.errors.map((err: any) => `${err.path.join('.')} - ${err.message}`).join(', ');
          return `Error: Invalid arguments in JSON. ${errorMessages}. Please ensure summary is provided correctly.`;
        }

        try {
          const finalOptions: CreateCalendarOptions = {
            summary: parsedArgs.summary,
            timeZone: parsedArgs.timeZone,
          };

          const result = await createCalendarClient(finalOptions);
          log(LogLevel.DEBUG, "create_calendar: Google Calendar API call result:", result);

          if (typeof result === 'string') { // Error string from createCalendarClient
            return result;
          }
          // Assuming result is calendar_v3.Schema$Calendar if not a string error
          return `Calendar created successfully: ${result.summary} (ID: ${result.id})`;

        } catch (e: any) {
          log(LogLevel.ERROR, "Error in create_calendar tool logic after Zod parsing:", { error: e.message, stack: e.stack, parsedArgs });
          return `Error processing create_calendar: ${e.message}.`;
        }
      },
    });
    tools.push(createCalendarTool);

    log(LogLevel.INFO, `GoogleCalendarPlugin providing ${tools.length} tools.`);
    return tools;
  }
};

export default GoogleCalendarPlugin; 