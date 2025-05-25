import schedule from 'node-schedule';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs for reminders
import {
  addReminder as dbAddReminder,
  getActiveReminders as dbGetActiveReminders,
  updateReminder as dbUpdateReminder,
  deactivateReminder as dbDeactivateReminder,
  deleteReminder as dbDeleteReminder,
  getReminderById as dbGetReminderById,
  Reminder,
} from './reminderRepository';
import { parseReminderTextAndDate, ParsedReminder, parseDateString } from './scheduleParser';
import { log, LogLevel } from '../logger'; // Import logger

// In-memory store for active node-schedule jobs. Key is reminder ID.
const activeJobs = new Map<string, schedule.Job>();

// Callback for executing agent intents
let agentExecutionCallback: ((taskPayload: string) => Promise<void>) | null = null;

/**
 * The actual function that gets executed when a reminder fires.
 * @param reminder The reminder object from the database.
 */
async function executeReminder(reminder: Reminder): Promise<void> {
  console.log(`Executing reminder ID: ${reminder.id}, Type: ${reminder.task_type}`);
  log(LogLevel.INFO, `Executing reminder:`, { id: reminder.id, type: reminder.task_type, message: reminder.message });

  if (reminder.task_type === 'agentIntent' && reminder.task_payload && agentExecutionCallback) {
    console.log(`Executing agent intent for reminder ID ${reminder.id}. Payload: ${reminder.task_payload}`);
    log(LogLevel.DEBUG, `Calling agentExecutionCallback for agentIntent`, { reminderId: reminder.id, payload: reminder.task_payload });
    try {
      await agentExecutionCallback(reminder.task_payload);
      console.log(`Agent intent for reminder ID ${reminder.id} processed.`);
      log(LogLevel.INFO, `Agent intent processed for reminder.`, { reminderId: reminder.id });
    } catch (error) {
      console.error(`Error executing agent intent for reminder ID ${reminder.id}:`, error);
      log(LogLevel.ERROR, `Error executing agent intent for reminder.`, { reminderId: reminder.id, error });
      // Optionally, update reminder status to 'error' or retry logic here
    }
  } else if (reminder.task_type === 'logMessage') {
    console.log(`
--------------------------------------------------
🔔 REMINDER: ${reminder.message} (ID: ${reminder.id})
--------------------------------------------------
`);
  } else {
    console.warn(`Unknown task_type "${reminder.task_type}" for reminder ID ${reminder.id}. Defaulting to log.`);
    console.log(`
--------------------------------------------------
🔔 REMINDER: ${reminder.message} (ID: ${reminder.id}) - Type: ${reminder.task_type}
Payload: ${reminder.task_payload || 'N/A'}
--------------------------------------------------
`);
  }

  if (reminder.schedule_type === 'one-off') {
    dbDeactivateReminder(reminder.id);
    activeJobs.delete(reminder.id);
    console.log(`One-off reminder ID ${reminder.id} processed and deactivated.`);
    log(LogLevel.INFO, `One-off reminder processed and deactivated.`, { reminderId: reminder.id });
  }
  // For cron jobs, they will continue to run based on their schedule
}

/**
 * Schedules a single reminder job using node-schedule.
 * @param reminder The reminder object to schedule.
 */
function scheduleJob(reminder: Reminder): boolean {
  if (!reminder.is_active) {
    console.log(`Reminder ID ${reminder.id} is not active. Skipping scheduling.`);
    log(LogLevel.DEBUG, `Skipping scheduling for non-active reminder.`, { reminderId: reminder.id });
    return false;
  }

  let job: schedule.Job | null = null;
  // Ensure executeReminder is called correctly, it's now async
  const jobFunction = () => {
    executeReminder(reminder).catch(err => {
        console.error(`Unhandled error in executeReminder for job ${reminder.id}:`, err);
        log(LogLevel.ERROR, `Unhandled error in executeReminder for job.`, { reminderId: reminder.id, err });
    });
  };

  if (reminder.schedule_type === 'one-off' && reminder.when_date) {
    const scheduleDate = new Date(reminder.when_date);
    if (scheduleDate.getTime() > Date.now()) {
      job = schedule.scheduleJob(reminder.id, scheduleDate, jobFunction);
    }
  } else if (reminder.schedule_type === 'cron' && reminder.cron_spec) {
    job = schedule.scheduleJob(reminder.id, reminder.cron_spec, jobFunction);
  }

  if (job) {
    activeJobs.set(reminder.id, job);
    console.log(`Reminder ID ${reminder.id} ("${reminder.message || 'Agent Task'}") of type "${reminder.task_type}" scheduled for ${job.nextInvocation()?.toISOString() || 'N/A'}`);
    log(LogLevel.INFO, `Reminder scheduled.`, { reminderId: reminder.id, message: reminder.message, type: reminder.task_type, nextInvocation: job.nextInvocation()?.toISOString() });
    const nextRun = job.nextInvocation()?.toISOString();
    if (nextRun && reminder.next_run_time !== nextRun) {
        dbUpdateReminder(reminder.id, { next_run_time: nextRun });
    }
    return true;
  } else {
    if (reminder.schedule_type === 'one-off' && new Date(reminder.when_date!).getTime() <= Date.now()) { // Added null assertion for when_date
        console.log(`Reminder ID ${reminder.id} ("${reminder.message || 'Agent Task'}") was in the past. Deactivating.`);
        dbDeactivateReminder(reminder.id);
        log(LogLevel.INFO, `Deactivated past-due one-off reminder during scheduleJob.`, { reminderId: reminder.id });
    } else {
        console.log(`Reminder ID ${reminder.id} ("${reminder.message || 'Agent Task'}") could not be scheduled (possibly invalid cron or other issue).`);
        log(LogLevel.WARN, `Reminder could not be scheduled.`, { reminderId: reminder.id, message: reminder.message, type: reminder.task_type });
        // If it's a one-off that somehow wasn't caught by past check, but still didn't schedule, maybe deactivate.
        if (reminder.schedule_type === 'one-off') {
            dbDeactivateReminder(reminder.id);
            log(LogLevel.INFO, `Deactivated unschedulable one-off reminder.`, { reminderId: reminder.id });
        }
    }
    return false;
  }
}

/**
 * Initializes the SchedulerService:
 * - Stores the agent execution callback.
 * - Loads all active reminders from the database.
 * - Schedules them with node-schedule.
 * - Deactivates any one-off reminders that are in the past.
 */
export async function initSchedulerService(
  callback?: (taskPayload: string) => Promise<void> // Optional for now to avoid breaking existing calls immediately
): Promise<void> {
  console.log('Initializing SchedulerService...');
  log(LogLevel.INFO, 'Initializing SchedulerService...');
  if (callback) {
    agentExecutionCallback = callback;
    console.log('Agent execution callback registered with SchedulerService.');
    log(LogLevel.INFO, 'Agent execution callback registered with SchedulerService.');
  } else {
    console.warn('SchedulerService initialized without an agent execution callback. Agent intents will only be logged.');
    log(LogLevel.WARN, 'SchedulerService initialized without an agent execution callback.');
  }

  const activeReminders = dbGetActiveReminders();
  let rescheduledCount = 0;
  let pastDueDeactivatedCount = 0;

  for (const reminder of activeReminders) {
    if (reminder.schedule_type === 'one-off' && reminder.when_date) {
      const scheduleDate = new Date(reminder.when_date);
      if (scheduleDate.getTime() <= Date.now()) {
        dbDeactivateReminder(reminder.id);
        pastDueDeactivatedCount++;
        console.log(`Deactivated past-due one-off reminder ID ${reminder.id}: ${reminder.message || 'Agent Task'}`);
        log(LogLevel.INFO, `Deactivated past-due one-off reminder during init.`, { reminderId: reminder.id, message: reminder.message });
        continue; 
      }
    }
    if (scheduleJob(reminder)) {
        rescheduledCount++;
    }
  }
  console.log(`SchedulerService initialized: ${rescheduledCount} reminders rescheduled, ${pastDueDeactivatedCount} past-due one-off reminders deactivated.`);
  log(LogLevel.INFO, `SchedulerService initialized.`, { rescheduledCount, pastDueDeactivatedCount });
}

/**
 * Creates and schedules a new reminder for an agent task.
 * @param taskName A human-readable name or description for the task.
 * @param scheduleDate The date/time when the task should be executed.
 * @param taskPayload The payload (e.g., original user query) for the agent to process.
 * @returns A promise that resolves to the created Reminder object or null if an error occurs.
 */
export async function createAgentTaskSchedule(
  taskName: string,
  scheduleDate: Date,
  taskPayload: string
): Promise<Reminder | null> {
  if (scheduleDate.getTime() <= Date.now()) {
    console.warn('Attempted to schedule an agent task in the past.');
    log(LogLevel.WARN, 'Attempted to schedule an agent task in the past.', { taskName, scheduleDate: scheduleDate.toISOString(), taskPayload });
    // Optionally throw an error or return a specific message
    return null; 
  }

  const newAgentReminder: Reminder = { // Ensure this matches the Reminder interface and dbAddReminder expectations
    id: uuidv4(),
    message: taskName, // Human-readable name for the task
    schedule_type: 'one-off', // Agent tasks are typically one-off executions of an intent
    when_date: scheduleDate.toISOString(),
    next_run_time: scheduleDate.toISOString(),
    task_type: 'agentIntent',
    task_payload: taskPayload,
    is_active: true, // New tasks are active by default
    // cron_spec, created_at are optional or handled by DB
  };

  try {
    // dbAddReminder expects certain fields. The Reminder interface from reminderRepository.ts should be the guide.
    // The `dbAddReminder` function in `reminderRepository.ts` takes an object that includes:
    // id, message, schedule_type, when_date, cron_spec, next_run_time, task_type, task_payload
    // The `newAgentReminder` object above should satisfy this.
    dbAddReminder({
        id: newAgentReminder.id,
        message: newAgentReminder.message,
        schedule_type: newAgentReminder.schedule_type,
        when_date: newAgentReminder.when_date,
        cron_spec: newAgentReminder.cron_spec, // Will be null/undefined for one-off
        next_run_time: newAgentReminder.next_run_time!, // Not null for one-off here
        task_type: newAgentReminder.task_type,
        task_payload: newAgentReminder.task_payload
    });
    
    // scheduleJob expects a Reminder object. Our newAgentReminder should be suitable.
    const scheduled = scheduleJob(newAgentReminder);

    if (scheduled) {
      console.log(`Agent task "${taskName}" scheduled for ${scheduleDate.toLocaleString()}. ID: ${newAgentReminder.id}`);
      log(LogLevel.INFO, `Agent task scheduled.`, { taskName, scheduleDate: scheduleDate.toLocaleString(), id: newAgentReminder.id });
      return newAgentReminder; // Return the full reminder object
    } else {
      // This might happen if scheduleJob itself fails for other reasons post past-check
      console.error(`Failed to schedule agent task ID ${newAgentReminder.id} even after past-time check.`);
      log(LogLevel.ERROR, `Failed to schedule agent task even after past-time check.`, { id: newAgentReminder.id });
      // Deactivate if it was added to DB but not scheduled
      dbDeactivateReminder(newAgentReminder.id); 
      return null;
    }
  } catch (error: any) {
    console.error('Error creating agent task schedule:', error);
    log(LogLevel.ERROR, 'Error creating agent task schedule:', { error: error.message, taskName });
    return null;
  }
}

/**
 * Processes a natural language request to create and schedule a new LOG reminder.
 * @param fullText The full text of the reminder request (e.g., "remind me to call mom tomorrow at 5pm").
 * @returns A promise that resolves to a confirmation message or an error message.
 */
export async function createReminderFromText(fullText: string): Promise<string> {
  const parsed = parseReminderTextAndDate(fullText);

  if (!parsed) {
    return 'Could not understand the time or reminder details. Please try a different phrasing, like "remind me to [task] [time/date]".';
  }

  const { date: scheduleDate, reminderText } = parsed;

  if (scheduleDate.getTime() <= Date.now()) {
    log(LogLevel.WARN, 'Attempted to schedule a log reminder in the past.', { reminderText, scheduleDate: scheduleDate.toISOString() });
    return 'The specified time is in the past. Please provide a future time for the reminder.';
  }

  const newLogReminder: Reminder = {
    id: uuidv4(),
    message: reminderText,
    schedule_type: 'one-off',
    when_date: scheduleDate.toISOString(),
    next_run_time: scheduleDate.toISOString(),
    task_type: 'logMessage',
    task_payload: null,
    is_active: true,
  };

  try {
    dbAddReminder({
        id: newLogReminder.id,
        message: newLogReminder.message,
        schedule_type: newLogReminder.schedule_type,
        when_date: newLogReminder.when_date,
        next_run_time: newLogReminder.next_run_time!,
        task_type: newLogReminder.task_type,
        task_payload: newLogReminder.task_payload
    });
    
    const scheduled = scheduleJob(newLogReminder);

    if (scheduled) {
      log(LogLevel.INFO, `Log reminder scheduled: "${reminderText}"`, { id: newLogReminder.id, time: scheduleDate.toLocaleString() });
      return `Reminder set: "${reminderText}" for ${scheduleDate.toLocaleString()}. (ID: ${newLogReminder.id})`;
    } else {
      log(LogLevel.ERROR, `Log reminder "${reminderText}" failed to schedule (post-parse).`, { id: newLogReminder.id });
      // Deactivate if it was added to DB but not scheduled
      dbDeactivateReminder(newLogReminder.id); 
      return 'Failed to schedule reminder even after parsing. Please try again.';
    }
  } catch (error: any) {
    log(LogLevel.ERROR, `Error creating log reminder from text: "${fullText}"`, { error: error.message });
    return `Error creating reminder: ${error.message}`;
  }
}

/**
 * Cancels an active reminder by its ID.
 * @param reminderId The ID of the reminder to cancel.
 * @returns A boolean indicating if the cancellation was successful.
 */
export function cancelReminderById(reminderId: string): boolean {
  log(LogLevel.INFO, `Attempting to cancel reminder by ID: ${reminderId}`);
  const job = activeJobs.get(reminderId);
  if (job) {
    job.cancel();
    activeJobs.delete(reminderId);
    dbDeactivateReminder(reminderId);
    log(LogLevel.INFO, `Reminder ID ${reminderId} cancelled and deactivated successfully.`);
    return true;
  }
  // If job not in activeJobs, it might be already inactive or past.
  // Still try to deactivate in DB just in case.
  const dbResult = dbDeactivateReminder(reminderId);
  if (dbResult) {
    log(LogLevel.INFO, `Reminder ID ${reminderId} was not in active jobs map, but deactivated in DB.`);
    return true; // Considered success if DB deactivation happened
  }
  log(LogLevel.WARN, `Reminder ID ${reminderId} not found for cancellation or already inactive.`);
  return false;
}

/**
 * Gets a list of currently scheduled (active) reminders.
 */
export function listActiveReminders(): Reminder[] {
    return dbGetActiveReminders();
}

/**
 * Gets details of the next invocation for all active jobs.
 * Returns an array of objects with id and nextRun time.
 */
export function getNextInvocations(): { id: string; message: string; nextRun: string | null }[] {
    const invocations: { id: string; message: string; nextRun: string | null }[] = [];
    activeJobs.forEach((job, id) => {
        const reminder = dbGetReminderById(id); // Fetch message from DB
        invocations.push({
            id,
            message: reminder?.message || 'N/A',
            nextRun: job.nextInvocation()?.toISOString() || 'N/A',
        });
    });
    return invocations.sort((a, b) => {
        if (a.nextRun === null) return 1;
        if (b.nextRun === null) return -1;
        return new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime();
    });
}

// Gracefully shut down scheduled jobs on exit
function gracefulShutdown() {
  log(LogLevel.INFO, 'SchedulerService shutting down gracefully...');
  const jobsToCancel = Array.from(activeJobs.values());
  jobsToCancel.forEach(job => job.cancel(false)); // false = don't execute on cancel
  activeJobs.clear();
  log(LogLevel.INFO, `Cancelled ${jobsToCancel.length} active jobs. SchedulerService shutdown complete.`);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown); 