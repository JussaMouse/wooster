import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { z } from 'zod';
import { DynamicTool } from '@langchain/core/tools';
import * as chrono from 'chrono-node';
import {
  TimeBlock,
  TimeManagementService,
  TimeManagementGCalCreateEventResponse,
  GCalCreateEventOptions
} from './types';
import { CreateCalendarEventService } from '../gcal/types'; // Actual service type

let core: CoreServices;

// Zod schema for the agent tool input (JSON string)
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
  readonly name = "timeManagement";
  readonly version = "0.1.1"; // Incremented version
  readonly description = "Manages time blocks by interacting with Google Calendar service.";

  private createEventService: CreateCalendarEventService | null = null;

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    core.log(LogLevel.INFO, `TimeManagementPlugin (v${this.version}): Initializing...`);

    this.createEventService = core.getService("CreateCalendarEventService") as CreateCalendarEventService | null;
    if (!this.createEventService) {
      core.log(LogLevel.WARN, "TimeManagementPlugin: CreateCalendarEventService (from GCalPlugin) not found. Scheduling features will be unavailable.");
    }
    
    services.registerService("TimeManagementService", this);
    core.log(LogLevel.INFO, "TimeManagementPlugin: TimeManagementService registered.");
  }

  async scheduleTimeBlock(blockDetails: TimeBlock): Promise<TimeManagementGCalCreateEventResponse | string | null> {
    core.log(LogLevel.DEBUG, "TimeManagementService: scheduleTimeBlock called", { blockDetails });
    if (!this.createEventService) {
      core.log(LogLevel.ERROR, "TimeManagementService: CreateCalendarEventService is not available.");
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
        // Parse duration (e.g., "2 hours", "90 minutes")
        // This is a simplified duration parser. A more robust one might be needed.
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
        // This case should be prevented by Zod schema on the tool, but good to have defense here too.
        return "Error: Either endTime or duration must be provided.";
      }
    } catch (parseError: any) {
      core.log(LogLevel.ERROR, "TimeManagementService: Error parsing date/time for time block.", { error: parseError.message, details: blockDetails });
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
      timeZone: blockDetails.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, // Default to system timezone
    };

    try {
      core.log(LogLevel.DEBUG, "TimeManagementService: Calling CreateCalendarEventService with:", { eventOptions });
      const result = await this.createEventService(eventOptions);

      if (typeof result === 'string') { // GCal service returned an error string
        core.log(LogLevel.WARN, "TimeManagementService: CreateCalendarEventService returned an error string.", { error: result });
        return result;
      }
      // Assuming result is GCalEventData (calendar_v3.Schema$Event)
      if (result && result.id) { 
        core.log(LogLevel.INFO, `TimeManagementService: Successfully scheduled time block via GCal. Event ID: ${result.id}`);
        return result; // This is TimeManagementGCalCreateEventResponse
      } else {
        core.log(LogLevel.ERROR, "TimeManagementService: CreateCalendarEventService returned unexpected result.", { result });
        return "Error: Failed to schedule time block, calendar service returned an unexpected result.";
      }
    } catch (error: any) {
      core.log(LogLevel.ERROR, "TimeManagementService: Exception calling CreateCalendarEventService.", { error: error.message, stack: error.stack });
      return `Error: An unexpected error occurred while scheduling with calendar service: ${error.message}`;
    }
  }
 
  getAgentTools?(): DynamicTool[] {
    const tool = new DynamicTool({
      name: "scheduleTimeBlock",
      description: "Schedules a time block in your calendar. Input must be a JSON string with keys: 'summary' (string, required), 'startTime' (string, required, e.g., 'tomorrow 2pm'), and either 'endTime' (string, e.g., 'tomorrow 4pm') or 'duration' (string, e.g., '2 hours'). Optional keys: 'description', 'location', 'attendees' (array of emails), 'timeZone'. Example: { \"summary\": \"Work on report\", \"startTime\": \"tomorrow 2pm\", \"duration\": \"3 hours\" }",
      func: async (input: string): Promise<string> => {
        core.log(LogLevel.DEBUG, 'AgentTool scheduleTimeBlock: called with JSON string input', { input });
        let parsedArgs: TimeBlock;
        try {
          const rawParsedArgs = JSON.parse(input);
          // Validate with the more detailed Zod schema that includes optional fields
          parsedArgs = scheduleTimeBlockSchema.parse(rawParsedArgs) as TimeBlock;
        } catch (e: any) {
          if (e instanceof z.ZodError) {
            core.log(LogLevel.WARN, "AgentTool scheduleTimeBlock: Input JSON validation failed.", { errors: e.errors });
            return `Invalid input format: ${e.errors.map(err => err.message).join('. ')}`;
          }
          core.log(LogLevel.WARN, "AgentTool scheduleTimeBlock: Invalid JSON input string.", { input, error: e.message });
          return "Invalid input: Please provide a valid JSON string as described in the tool description.";
        }

        const result = await this.scheduleTimeBlock(parsedArgs);
        
        if (result && typeof result === 'object' && result.id && result.summary) { // result is GCalEventData
          return `OK, I\'ve scheduled "${result.summary}". Event link: ${result.htmlLink || 'N/A'}`;
        } else if (typeof result === 'string') {
          return result; // This will be the error message from scheduleTimeBlock or GCalService
        }
        return "Sorry, I couldn\'t schedule the time block due to an unexpected error from the service.";
      },
    });
    return [tool];
  }
}

export default new TimeManagementPluginDefinition(); 