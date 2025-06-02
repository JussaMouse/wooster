import { calendar_v3 } from 'googleapis';
// Import the actual event data type from GCal plugin's types or googleapis directly
// Assuming GCalEventData is calendar_v3.Schema$Event as defined in gcal/types.ts
import { GCalEventData, CreateEventOptions as GCalCreateEventOptions } from '../gcal/types'; 

// This is the type for the *response* of a successful GCal event creation
export type TimeManagementGCalCreateEventResponse = GCalEventData;

// This defines the input structure TimeManagementService's scheduleTimeBlock expects.
// It's slightly different from GCalCreateEventOptions as it handles natural language time and duration.
export interface TimeBlock {
  summary: string;
  startTime: string; // Natural language or ISO string, e.g., "tomorrow 2pm", "2024-08-15T14:00:00"
  endTime?: string;   // Natural language or ISO string
  duration?: string;  // e.g., "2 hours", "90 minutes"
  description?: string; // Optional description for the event
  location?: string;    // Optional location
  attendees?: string[]; // Optional attendees
  timeZone?: string;    // Optional specific timezone for the event
}

export interface TimeManagementService {
  /**
   * Schedules a time block in the user's calendar.
   * Parses natural language time/duration and uses GCalService.
   * @param blockDetails - The details of the time block to schedule.
   * @returns A promise that resolves to the created calendar event details or an error string on failure.
   */
  scheduleTimeBlock(blockDetails: TimeBlock): Promise<TimeManagementGCalCreateEventResponse | string | null>;

  // Future methods:
  // listScheduledBlocks(date: string): Promise<GCalEventData[] | null>; 
  // findFreeSlots(date: string, durationMinutes: number): Promise<any[] | null>; 
}

// Re-export GCalCreateEventOptions for internal use if needed, or TimeBlock can be directly mapped.
export { GCalCreateEventOptions }; 