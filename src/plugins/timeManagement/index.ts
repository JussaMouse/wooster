import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { z } from 'zod';
import { DynamicTool } from 'langchain/tools';
import * as chrono from 'chrono-node';
import {
  TimeBlock,
  TimeManagementService,
  TimeManagementGCalCreateEventResponse,
  GCalCreateEventOptions
} from './types';
import { CreateCalendarEventService } from '../gcal/types'; // Actual service type

// Zod schema for the agent tool input (JSON string) - REINSTATED
const scheduleTimeBlockSchema = z.object({
  summary: z.string().min(1, "Summary for the time block is required."),
  startTime: z.string().min(1, "Start time is required."),
  endTime: z.string().optional(),
  duration: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
  timeZone: z.string().optional(),
}).refine(data => data.endTime || data.duration, {
  message: "Either endTime or duration must be provided for the time block.",
});

class TimeManagementPluginDefinition implements WoosterPlugin, TimeManagementService {
  static readonly pluginName = "timeManagement";
  static readonly version = "0.1.1"; 
  static readonly description = "Manages time blocks by interacting with Google Calendar service.";

  readonly name = TimeManagementPluginDefinition.pluginName;
  readonly version = TimeManagementPluginDefinition.version;
  readonly description = TimeManagementPluginDefinition.description;

  private coreServices!: CoreServices;
  private calendarService: ({ createEvent: CreateCalendarEventService }) | null = null;

  private logMsg(level: LogLevel, message: string, metadata?: object) {
    if (this.coreServices && this.coreServices.log) {
      this.coreServices.log(level, `[${TimeManagementPluginDefinition.pluginName} Plugin v${TimeManagementPluginDefinition.version}] ${message}`, metadata);
    } else {
      console.log(`[${level}][${TimeManagementPluginDefinition.pluginName} Plugin v${TimeManagementPluginDefinition.version}] ${message}`, metadata || '');
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.coreServices = services;
    this.logMsg(LogLevel.INFO, `Initializing...`);

    this.calendarService = this.coreServices.getService("CalendarService") as ({ createEvent: CreateCalendarEventService }) | null;
    if (!this.calendarService) {
      this.logMsg(LogLevel.WARN, "CalendarService (from GCalPlugin) not found. Scheduling features will be unavailable.");
    }
    
    services.registerService("TimeManagementService", this);
    this.logMsg(LogLevel.INFO, "TimeManagementService registered.");
  }

  async scheduleTimeBlock(blockDetails: TimeBlock): Promise<TimeManagementGCalCreateEventResponse | string | null> {
    this.logMsg(LogLevel.DEBUG, "scheduleTimeBlock called", { blockDetails });
    if (!this.calendarService || typeof this.calendarService.createEvent !== 'function') {
      this.logMsg(LogLevel.ERROR, "CalendarService or its createEvent method is not available.");
      return "Error: Calendar creation service is not available.";
    }

    // --- Date & Time Parsing Logic --- 
    let startDateTimeIso: string;
    let endDateTimeIso: string;

    try {
      const now = new Date();
      const parsedStartTime = chrono.parseDate(blockDetails.startTime, now, { forwardDate: true });
      if (!parsedStartTime) {
        return `Error: Could not understand the start time: "${blockDetails.startTime}"`;
      }
      startDateTimeIso = parsedStartTime.toISOString();

      if (blockDetails.endTime) {
        const parsedEndTime = chrono.parseDate(blockDetails.endTime, parsedStartTime, { forwardDate: true });
        if (!parsedEndTime) {
          return `Error: Could not understand the end time: "${blockDetails.endTime}"`;
        }
        if (parsedEndTime <= parsedStartTime) {
          return `Error: End time "${blockDetails.endTime}" must be after start time "${blockDetails.startTime}".`;
        }
        endDateTimeIso = parsedEndTime.toISOString();
      } else if (blockDetails.duration) {
        const durationRegex = /(\d+)\s*(hour|hr|h|minute|min|m)s?/i;
        const match = blockDetails.duration.match(durationRegex);
        if (!match) {
          return `Error: Could not understand duration: "${blockDetails.duration}". Try formats like '2 hours' or '90 minutes'.`;
        }
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        let durationMs = 0;
        if (unit.startsWith('h')) {
          durationMs = value * 60 * 60 * 1000;
        } else if (unit.startsWith('m')) {
          durationMs = value * 60 * 1000;
        }
        if (durationMs <= 0) {
            return `Error: Invalid duration specified: "${blockDetails.duration}". Must be a positive value.`;
        }
        endDateTimeIso = new Date(parsedStartTime.getTime() + durationMs).toISOString();
      } else {
        return "Error: Either endTime or duration must be provided.";
      }
    } catch (parseError: any) {
      this.logMsg(LogLevel.ERROR, "Error parsing date/time for time block.", { error: parseError.message, details: blockDetails });
      return `Error processing time information: ${parseError.message}`;
    }
    // --- End Date & Time Parsing Logic ---

    const eventOptions: GCalCreateEventOptions = {
      summary: blockDetails.summary,
      startDateTime: startDateTimeIso,
      endDateTime: endDateTimeIso,
      description: blockDetails.description,
      location: blockDetails.location,
      attendees: blockDetails.attendees,
      timeZone: blockDetails.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, 
    };

    try {
      this.logMsg(LogLevel.DEBUG, "Calling CalendarService.createEvent with:", { eventOptions });
      const result = await this.calendarService.createEvent(eventOptions);

      if (typeof result === 'string') { 
        this.logMsg(LogLevel.WARN, "CalendarService.createEvent returned an error string.", { error: result });
        return result;
      }
      if (result && result.id) { 
        this.logMsg(LogLevel.INFO, `Successfully scheduled time block via GCal. Event ID: ${result.id}`);
        return result; 
      } else {
        this.logMsg(LogLevel.ERROR, "CalendarService.createEvent returned unexpected result.", { result });
        return "Error: Failed to schedule time block, calendar service returned an unexpected result.";
      }
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, "Exception calling CalendarService.createEvent.", { error: error.message, stack: error.stack });
      return `Error: An unexpected error occurred while scheduling with calendar service: ${error.message}`;
    }
  }
 
  getAgentTools?(): DynamicTool[] {
    const tool = new DynamicTool({
      name: "scheduleTimeBlock",
      description: "Schedules a time block in your calendar. Input must be a JSON string with keys: 'summary' (string, required), 'startTime' (string, required, e.g., 'tomorrow 2pm'), and either 'endTime' (string, e.g., 'tomorrow 4pm') or 'duration' (string, e.g., '2 hours'). Optional keys: 'description', 'location', 'attendees' (array of emails), 'timeZone'. Example: { \"summary\": \"Work on report\", \"startTime\": \"tomorrow 2pm\", \"duration\": \"3 hours\" }",
      func: async (input: string): Promise<string> => {
        this.logMsg(LogLevel.DEBUG, 'AgentTool scheduleTimeBlock: called with JSON string input', { input });
        let parsedArgs: TimeBlock;
        try {
          const rawParsedArgs = JSON.parse(input);
          parsedArgs = scheduleTimeBlockSchema.parse(rawParsedArgs) as TimeBlock;
        } catch (e: any) {
          if (e instanceof z.ZodError) {
            this.logMsg(LogLevel.WARN, "AgentTool scheduleTimeBlock: Input JSON validation failed.", { errors: e.errors });
            return `Invalid input format: ${e.errors.map(err => err.message).join('. ')}`;
          }
          this.logMsg(LogLevel.WARN, "AgentTool scheduleTimeBlock: Invalid JSON input string.", { input, error: e.message });
          return "Invalid input: Please provide a valid JSON string as described in the tool description.";
        }

        const result = await this.scheduleTimeBlock(parsedArgs);
        
        if (result && typeof result === 'object' && result.id && result.summary) { 
          return `OK, I\'ve scheduled "${result.summary}". Event link: ${result.htmlLink || 'N/A'}`;
        } else if (typeof result === 'string') {
          return result; 
        }
        return "Sorry, I couldn\'t schedule the time block due to an unexpected error from the service.";
      },
    });
    return [tool];
  }
}

export default TimeManagementPluginDefinition; 