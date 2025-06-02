import schedule from 'node-schedule';
import { v4 as uuidv4 } from 'uuid';
import { Cron, CronOptions } from 'croner';
import {
  addScheduleItem as dbAddScheduleItem,
  getActiveScheduleItems as dbGetActiveScheduleItems,
  updateScheduleItem as dbUpdateScheduleItem,
  deactivateScheduleItem as dbDeactivateScheduleItem,
  deleteScheduleItem as dbDeleteScheduleItem,
  getScheduleItemById as dbGetScheduleItemById,
  getScheduleItemByKey as dbGetScheduleItemByKey,
  addExecutionLog as dbAddExecutionLog,
  getExecutionLogByPeriod as dbGetExecutionLogByPeriod,
} from './reminderRepository';
import { parseDateString } from './scheduleParser';
import { log, LogLevel } from '../logger';
import { getConfig } from '../configLoader';
import { AppConfig } from '../configLoader';
import { ScheduledTaskSetupOptions } from '../types/scheduler';
import type {
  NewScheduleItemPayload,
  UpdateScheduleItemArgs,
  TaskExecutionStatus,
  ScheduleItem // This should come from schedulerCore
} from '../types/schedulerCore'; // Corrected import path for ScheduleItem
import { CoreServices, WoosterPlugin } from '../types/plugin'; // WoosterPlugin for type hint

// In-memory store for active node-schedule jobs. Key is schedule ID.
const activeJobs = new Map<string, schedule.Job>();

// Callback for executing agent intents (AGENT_PROMPT tasks)
let agentExecutionCallback: ((taskPayload: string) => Promise<void>) | null = null;

// Registry for DIRECT_FUNCTION tasks
const directFunctionRegistry: Map<string, (payload: any) => Promise<void>> = new Map();

export function registerDirectScheduledFunction(taskKey: string, func: (payload: any) => Promise<void>) {
  if (directFunctionRegistry.has(taskKey)) {
    log(LogLevel.WARN, `SchedulerService: Task key "${taskKey}" is already registered in directFunctionRegistry. Overwriting.`);
  }
  directFunctionRegistry.set(taskKey, func);
  log(LogLevel.INFO, `SchedulerService: Direct function registered for task key: "${taskKey}". Registry size: ${directFunctionRegistry.size}`);
  // For debugging, log the name of the function if available
  if (func && func.name) {
    log(LogLevel.DEBUG, `SchedulerService: Function registered for "${taskKey}" is named "${func.name}"`);
  }
}

function getPeriodIdentifier(scheduleExpression: string, executionTime: Date): string {
  try {
    // Check if it's a cron expression first
    new Cron(scheduleExpression);
    // For cron, if it's finer than daily, use hour as part of the period.
    // Example: "0 * * * *" (hourly) or "0 9,17 * * *" (9am and 5pm)
    // A simple heuristic: if minute or hour spec is not '*', it's at least hourly specific.
    const parts = scheduleExpression.split(' ');
    if (parts.length >= 2 && (parts[0] !== '*' || parts[1] !== '*')) { // minute or hour is specified
        return `${executionTime.getFullYear()}-${(executionTime.getMonth() + 1).toString().padStart(2, '0')}-${executionTime.getDate().toString().padStart(2, '0')}-${executionTime.getHours().toString().padStart(2, '0')}`;
    }
    // Otherwise, for daily or less frequent cron, just the date.
    return `${executionTime.getFullYear()}-${(executionTime.getMonth() + 1).toString().padStart(2, '0')}-${executionTime.getDate().toString().padStart(2, '0')}`;
  } catch (e) {
    // Not a cron, assume it's a specific date/time, use daily period.
    // For one-off ISO dates, the period is simply the day it's scheduled for.
    const scheduledDate = new Date(scheduleExpression);
    if (!isNaN(scheduledDate.getTime())) {
        return `${scheduledDate.getFullYear()}-${(scheduledDate.getMonth() + 1).toString().padStart(2, '0')}-${scheduledDate.getDate().toString().padStart(2, '0')}`;
    }
    // Fallback for unexpected cases, use execution time's day
    return `${executionTime.getFullYear()}-${(executionTime.getMonth() + 1).toString().padStart(2, '0')}-${executionTime.getDate().toString().padStart(2, '0')}`;
  }
}

/**
 * The actual function that gets executed when a schedule fires.
 * @param item The ScheduleItem object from the database.
 */
async function executeScheduledItem(item: ScheduleItem): Promise<void> {
  log(LogLevel.INFO, `Executing scheduled item:`, { id: item.id, task_key: item.task_key, handler_type: item.task_handler_type });
  const { task_handler_type, task_key, payload, id, schedule_expression, execution_policy } = item;
  const executionTime = new Date();
  const currentPeriodId = getPeriodIdentifier(schedule_expression, executionTime);

  if (execution_policy === 'RUN_ONCE_PER_PERIOD_CATCH_UP') {
    const existingLog = await dbGetExecutionLogByPeriod(id, currentPeriodId);
    if (existingLog && existingLog.status === 'SUCCESS') {
      log(LogLevel.INFO, `Skipping execution for item ${id} (RUN_ONCE_PER_PERIOD_CATCH_UP). Already ran successfully in period ${currentPeriodId}. Job was triggered by node-schedule.`);
      dbAddExecutionLog({ 
        schedule_id: id, 
        period_identifier: currentPeriodId, 
        status: 'SKIPPED_DUPLICATE', 
        executed_at: executionTime.toISOString(), 
        notes: 'Skipped by node-schedule trigger; successful catch-up run already occurred in period.'
      });
      const jobInstance = activeJobs.get(id);
      if (jobInstance) {
          try {
              const nextInvocation = jobInstance.nextInvocation()?.toISOString() || null;
              dbUpdateScheduleItem(id, { next_run_time: nextInvocation, last_invocation: item.last_invocation || new Date(0).toISOString() });
          } catch(e) {
              log(LogLevel.DEBUG, `Could not get nextInvocation for job ${id} during skip, it might have completed or been cancelled.`);
              dbUpdateScheduleItem(id, { next_run_time: null, last_invocation: item.last_invocation || new Date(0).toISOString() });
          }
      }
      return;
    }
  }

  let success = false;
  let notes = "";

  try {
    if (task_handler_type === 'AGENT_PROMPT') {
      if (payload && agentExecutionCallback) {
        log(LogLevel.DEBUG, `Calling agentExecutionCallback for AGENT_PROMPT`, { itemId: id, payload });
        await agentExecutionCallback(payload);
        log(LogLevel.INFO, `AGENT_PROMPT processed for item.`, { itemId: id });
        success = true;
      } else {
        notes = 'Agent execution callback not set or payload missing for AGENT_PROMPT.';
        log(LogLevel.WARN, notes, { itemId: id });
      }
    } else if (task_handler_type === 'DIRECT_FUNCTION') {
      log(LogLevel.DEBUG, `SchedulerService: Attempting to execute DIRECT_FUNCTION for task_key: "${task_key}". Current registry keys: [${Array.from(directFunctionRegistry.keys()).join(', ')}]`);
      const func = directFunctionRegistry.get(task_key);
      if (func) {
        log(LogLevel.DEBUG, `SchedulerService: Executing direct function for task key "${task_key}"`, { itemId: id, payload });
        await func(payload ? JSON.parse(payload) : {}); // Assume payload is JSON or empty
        log(LogLevel.INFO, `DIRECT_FUNCTION processed for item.`, { itemId: id, task_key });
        success = true;
      } else {
        notes = `No direct function registered for task_key "${task_key}".`;
        log(LogLevel.ERROR, notes, { itemId: id });
      }
    } else {
      notes = `Unknown task_handler_type "${task_handler_type}" for item ID ${id}.`;
      log(LogLevel.WARN, notes, { itemId: id });
    }
  } catch (error: any) {
    console.error(`Error executing scheduled item ID ${id}:`, error);
    log(LogLevel.ERROR, `Error executing scheduled item.`, { itemId: id, task_key, error });
    notes = error.message || 'Unknown error during execution.';
    success = false;
  }

  dbAddExecutionLog({ 
    schedule_id: id, 
    period_identifier: currentPeriodId, 
    status: success ? 'SUCCESS' : 'FAILURE', 
    executed_at: executionTime.toISOString(), 
    notes 
  });

  let nextRunTimeForDb: string | null = null;
  const jobInstance = activeJobs.get(id);
  if (jobInstance) {
    try {
        nextRunTimeForDb = jobInstance.nextInvocation()?.toISOString() || null;
    } catch(e) {
        // job.nextInvocation() can throw if the job is completed or cancelled (e.g. one-off that just ran)
        log(LogLevel.DEBUG, `Could not get nextInvocation for job ${id}, it might have completed.`);
        nextRunTimeForDb = null; // Explicitly set to null if it can't be determined
    }
  }

  const updatePayload: {last_invocation: string, next_run_time?: string | null} = { 
    last_invocation: executionTime.toISOString()
  };
  // Only include next_run_time in the update if it was determined (it could be null if a one-off job finished)
  // This check ensures we don't accidentally send `undefined` if nextRunTimeForDb was not set.
  if (nextRunTimeForDb !== undefined) { 
    updatePayload.next_run_time = nextRunTimeForDb;
  }
  dbUpdateScheduleItem(id, updatePayload);

  // Deactivation logic for one-off tasks (ISO dates)
  let isOneOffDate = false;
  let isDefinitelyCron = false;
  try {
    // Attempt to parse as cron. If it succeeds, it's a cron.
    new Cron(schedule_expression);
    isDefinitelyCron = true;
  } catch (e) {
    // Not a cron. Now check if it's a valid ISO-like date.
    try {
        const d = new Date(schedule_expression);
        // Check if it's a valid date and contains typical ISO date characters.
        isOneOffDate = !isNaN(d.getTime()) && (schedule_expression.includes('-') || schedule_expression.includes(':'));
    } catch (dateErr) {
        // Not a date either, or failed to parse.
        isOneOffDate = false;
    }
  }
  
  // Only proceed with deactivation if it's determined to be a one-off date and NOT a cron.
  if (isOneOffDate && !isDefinitelyCron) { 
    if (execution_policy === 'DEFAULT_SKIP_MISSED' || execution_policy === 'RUN_ONCE_PER_PERIOD_CATCH_UP' || execution_policy === 'RUN_IMMEDIATELY_IF_MISSED') {
        log(LogLevel.INFO, `Deactivating one-off item (determined as ISO date) after execution (policy: ${execution_policy}).`, { itemId: id });
        if (jobInstance) jobInstance.cancel(); 
        activeJobs.delete(id);
        dbDeactivateScheduleItem(id);
    }
  }
  // For cron jobs (recurring), node-schedule handles rescheduling them automatically.
  // Their next_run_time was updated above.
}

function calculateNextRunTime(expression: string, fromDate: Date = new Date()): Date | null {
    try {
        // croner constructor throws if the expression is invalid.
        // .next() returns a Date or null if no future run (e.g. for a past specific date not in a cron pattern)
        const options: CronOptions = {};
        if (fromDate) {
            options.startAt = fromDate.toISOString(); 
        }
        const cronJob = new Cron(expression, options);
        return cronJob.nextRun(); 
    } catch (e) {
        // Not a valid cron expression, try to parse as ISO date
        try {
            const date = new Date(expression);
            const compareDate = fromDate || new Date();
            if (!isNaN(date.getTime()) && date.getTime() > compareDate.getTime()) {
                return date;
            }
            return null; // Invalid date or in the past relative to fromDate
        } catch (dateError) {
            return null; // Not a valid cron or date
        }
    }
}

/**
 * Schedules a single item using node-schedule.
 * @param item The ScheduleItem object to schedule.
 */
function scheduleJob(item: ScheduleItem): boolean {
  if (!item.is_active) {
    log(LogLevel.DEBUG, `Item ID ${item.id} is not active. Skipping scheduling.`);
    return false;
  }

  let job: schedule.Job | null = null;
  const jobFunction = () => {
    executeScheduledItem(item).catch(err => {
        log(LogLevel.ERROR, `Unhandled error in executeScheduledItem for job.`, { itemId: item.id, err });
    });
  };

  let scheduleValue: string | Date;
  let nextInvocationTime: Date | null = null;

  try {
    // Try as cron first using croner
    const cronPattern = new Cron(item.schedule_expression);
    nextInvocationTime = cronPattern.nextRun(); // Get next run from now
    if (!nextInvocationTime) { // If croner returns null (e.g. a very specific cron that won't run again)
        log(LogLevel.WARN, `Cron expression for item ${item.id} ("${item.description}") will not run again. Expression: ${item.schedule_expression}`);
        // Potentially deactivate if it makes sense for the policy, or just don't schedule.
        if(item.execution_policy === 'DEFAULT_SKIP_MISSED') dbDeactivateScheduleItem(item.id);
        return false;
    }
    scheduleValue = item.schedule_expression; // node-schedule can take a cron string
    log(LogLevel.DEBUG, `Item ${item.id} is a cron job. Next calculated run: ${nextInvocationTime.toISOString()}`);
  } catch (e) {
    // Not a cron, try as ISO date
    try {
      const date = new Date(item.schedule_expression);
      if (isNaN(date.getTime())) {
        log(LogLevel.ERROR, `Invalid date format in schedule_expression for item ${item.id}: ${item.schedule_expression}`);
        return false;
      }
      nextInvocationTime = date;
      scheduleValue = date; // node-schedule can take a Date object
      log(LogLevel.DEBUG, `Item ${item.id} is a one-off date job. Scheduled for: ${date.toISOString()}`);
    } catch (dateError) {
      log(LogLevel.ERROR, `Schedule expression for item ${item.id} ("${item.description}") is not a valid cron or ISO date: ${item.schedule_expression}`);
      return false;
    }
  }

  if (!nextInvocationTime) { 
      log(LogLevel.WARN, `Could not determine next invocation time for item ${item.id} ("${item.description}"). Expression: ${item.schedule_expression}. It will not be scheduled by node-schedule.`);
      // If we can't determine a next run time (e.g., past one-off date, or unparsable croner expression that somehow passed initial createSchedule checks)
      // and it's not already set for deactivation by executeScheduledItem's one-off logic,
      // consider deactivating it here if appropriate for its policy.
      // This is a fallback. executeScheduledItem should handle most one-off deactivations.
      // We don't want to deactivate recurring crons that croner just happens to say have no *next* run if they *should* run.
      // The calculateNextRunTime in createSchedule should be the primary gate for bad expressions.
      
      // If it's not a cron and nextInvocationTime is null, it implies a past or invalid date.
      let isDefinitelyCronCheck = false;
      try { new Cron(item.schedule_expression); isDefinitelyCronCheck = true; } catch(e){}
      if (!isDefinitelyCronCheck) {
          log(LogLevel.INFO, `Item ${item.id} appears to be a past/invalid one-off date and won't be scheduled by node-schedule. Deactivating.`);
          dbDeactivateScheduleItem(item.id);
      }
      return false;
  }

  if (nextInvocationTime.getTime() <= Date.now()) {
      let isOneOffByDate = false;
      try { isOneOffByDate = !isNaN(new Date(item.schedule_expression).getTime()); } catch(e){/*ignore*/}

      if (isOneOffByDate) { // Specific handling for one-off dates that are past due
          if (item.execution_policy === 'RUN_ONCE_PER_PERIOD_CATCH_UP' || item.execution_policy === 'RUN_IMMEDIATELY_IF_MISSED') {
              log(LogLevel.INFO, `Item ${item.id} (one-off, policy: ${item.execution_policy}) is past due. Will be handled by init/catch-up logic. Not scheduling here.`);
              return false; 
          } else if (item.execution_policy === 'DEFAULT_SKIP_MISSED') {
              log(LogLevel.INFO, `Item ID ${item.id} ("${item.description}") (one-off) was in the past. Deactivating (DEFAULT_SKIP_MISSED).`);
              dbDeactivateScheduleItem(item.id);
              return false; 
          }
          // If a one-off date is past and doesn't match above policies, it won't be scheduled by this function.
          log(LogLevel.WARN, `One-off past due item ${item.id} with policy ${item.execution_policy} not scheduled by scheduleJob.`);
          return false;
      } else {
          // For CRON expressions, node-schedule will find the NEXT valid future time.
          log(LogLevel.DEBUG, `Cron item ${item.id} next calculated time ${nextInvocationTime.toISOString()} is past/present. node-schedule will find the next future slot.`);
      }
  }

  try {
    job = schedule.scheduleJob(item.id, scheduleValue, jobFunction);
  } catch (scheduleError: any) {
    log(LogLevel.ERROR, `Error creating node-schedule job for item ${item.id}. Expression: "${String(scheduleValue)}"`, { error: scheduleError.message });
    return false;
  }

  if (job) {
    activeJobs.set(item.id, job);
    const actualNextRun = job.nextInvocation()?.toISOString();
    log(LogLevel.INFO, `Item scheduled by node-schedule.`, { itemId: item.id, description: item.description, task_key: item.task_key, nextInvocation: actualNextRun });
    if (item.next_run_time !== actualNextRun && actualNextRun) { 
        dbUpdateScheduleItem(item.id, { next_run_time: actualNextRun });
    }
    return true;
  } else {
    log(LogLevel.WARN, `Item ID ${item.id} ("${item.description}") could not be scheduled by node-schedule. This might indicate an issue with a past one-off date not handled by policies or an unexpected error from node-schedule.`);
    return false;
  }
}

/**
 * Initializes the SchedulerService:
 * - Registers agent execution callback.
 * - Loads all active schedules from the database.
 * - Schedules them with node-schedule.
 * - Handles past-due items based on policy (simplified for now).
 */
export async function initSchedulerService(
  callback?: (taskPayload: string) => Promise<void>
): Promise<void> {
  if (callback) {
    agentExecutionCallback = callback;
  }
  log(LogLevel.INFO, 'Initializing SchedulerService...');

  // Clear any existing jobs from a previous run (e.g. if service restarted)
  // This is important to prevent duplicate jobs if the service restarts without clearing the map.
  for (const [id, job] of activeJobs.entries()) {
    job.cancel();
    log(LogLevel.DEBUG, `Cancelled pre-existing job in activeJobs map during init: ${id}`);
  }
  activeJobs.clear();

  const items = dbGetActiveScheduleItems();
  log(LogLevel.INFO, `Found ${items.length} active schedule items to process.`);

  for (const item of items) {
    // scheduleJob will now just set up the future job with node-schedule
    // and update its next_run_time in the DB based on node-schedule's calculation.
    // It no longer executes anything immediately.
    scheduleJob(item);
  }

  log(LogLevel.INFO, 'SchedulerService initialized. Active jobs scheduled with node-schedule.');
  // Catch-up logic will be called separately after all initializations are done.
}

export async function processCatchUpTasks(): Promise<void> {
  log(LogLevel.INFO, 'SchedulerService: Starting to process catch-up tasks...');
  const now = new Date();
  const items = dbGetActiveScheduleItems(); // Get all active items

  for (const item of items) {
    const { id, schedule_expression, execution_policy, next_run_time, task_key, last_invocation } = item;

    // Ensure direct functions are registered before trying to execute them
    if (item.task_handler_type === 'DIRECT_FUNCTION' && !directFunctionRegistry.has(item.task_key)) {
        log(LogLevel.ERROR, `Catch-up: Direct function for task_key "${item.task_key}" not found in registry. Skipping item ${id}.`);
        continue;
    }
    
    // Ensure agent callback is registered for agent tasks
    if (item.task_handler_type === 'AGENT_PROMPT' && !agentExecutionCallback) {
        log(LogLevel.ERROR, `Catch-up: Agent execution callback not set. Skipping AGENT_PROMPT item ${id}.`);
        continue;
    }

    if (execution_policy === 'RUN_ONCE_PER_PERIOD_CATCH_UP') {
      const scheduledTimeForThisPeriod = calculateNextRunTime(schedule_expression, new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)); // Start of today for daily, or actual next for cron. More sophisticated needed for *true* period.
      
      if (!scheduledTimeForThisPeriod) {
        log(LogLevel.WARN, `Catch-up: Could not determine a valid scheduled time for ${id} (${task_key}) with expression ${schedule_expression}. Skipping catch-up.`);
        continue;
      }

      const currentPeriodId = getPeriodIdentifier(schedule_expression, scheduledTimeForThisPeriod); // Use scheduledTime to define period
      const existingLog = await dbGetExecutionLogByPeriod(id, currentPeriodId);

      if (existingLog && existingLog.status === 'SUCCESS') {
        log(LogLevel.INFO, `Catch-up: Item ${id} (${task_key}) already ran successfully in period ${currentPeriodId}. Skipping.`);
        continue;
      }

      // If it hasn't run successfully, and 'now' is past its scheduled time for this period.
      if (now >= scheduledTimeForThisPeriod) {
        log(LogLevel.INFO, `Catch-up: Executing item ${id} (${task_key}) for period ${currentPeriodId}. Scheduled: ${scheduledTimeForThisPeriod.toISOString()}, Now: ${now.toISOString()}`);
        await executeScheduledItem(item); // This will log its own execution (success/failure)
      } else {
        log(LogLevel.DEBUG, `Catch-up: Item ${id} (${task_key}) for period ${currentPeriodId} is not due yet for catch-up. Scheduled: ${scheduledTimeForThisPeriod.toISOString()}`);
      }
    } else if (execution_policy === 'RUN_IMMEDIATELY_IF_MISSED') {
      if (next_run_time) {
        const nextRunDate = new Date(next_run_time);
        if (now > nextRunDate) {
          // Check if it has a last_invocation and if that invocation was at or after the missed next_run_time.
          // This avoids re-running if the job actually did run but the service restarted before its next_run_time could be updated by node-schedule.
          let alreadyRanAroundMissedTime = false;
          if (last_invocation) {
            const lastRunDate = new Date(last_invocation);
            // If last run was very close to or after the missed nextRunDate, assume it ran.
            // This isn't perfect but helps prevent immediate re-runs on restart for tasks that just ran.
            if (lastRunDate >= nextRunDate || Math.abs(lastRunDate.getTime() - nextRunDate.getTime()) < 5000) { // 5s tolerance
              alreadyRanAroundMissedTime = true;
            }
          }

          if (!alreadyRanAroundMissedTime) {
            log(LogLevel.INFO, `Catch-up: Executing missed item ${id} (${task_key}) (RUN_IMMEDIATELY_IF_MISSED). Scheduled: ${next_run_time}, Now: ${now.toISOString()}`);
            await executeScheduledItem(item);
          } else {
            log(LogLevel.INFO, `Catch-up: Missed item ${id} (${task_key}) (RUN_IMMEDIATELY_IF_MISSED) appears to have run recently. Last: ${last_invocation}. Scheduled: ${next_run_time}. Skipping explicit catch-up.`);
            // Reschedule it normally to ensure it's in node-schedule's queue
            scheduleJob(item);
          }
        }
      }
    }
  }
  log(LogLevel.INFO, 'SchedulerService: Finished processing catch-up tasks.');
}

/**
 * Creates and schedules a new task.
 * Replaces createAgentTaskSchedule and createReminderFromText.
 * The 'id' for the ScheduleItem will be generated (uuidv4).
 * next_run_time will be calculated based on schedule_expression.
 */
export async function createSchedule(
  details: Omit<ScheduleItem, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'last_invocation' | 'next_run_time'>
): Promise<ScheduleItem | null> {
  const id = uuidv4();
  let initialNextRunTime: string | null = null;
  const calculatedNextDate = calculateNextRunTime(details.schedule_expression);
  if(calculatedNextDate) {
      initialNextRunTime = calculatedNextDate.toISOString();
  } else {
      log(LogLevel.WARN, `Could not calculate initial next run time for new schedule: "${details.description}". Expression: "${details.schedule_expression}". May be invalid or a past one-off not meeting catch-up criteria.`);
      let isOneOffByDate = false;
      try { isOneOffByDate = !isNaN(new Date(details.schedule_expression).getTime()); } catch(e){/*ignore*/}

      if (isOneOffByDate && details.execution_policy === 'DEFAULT_SKIP_MISSED') {
          log(LogLevel.ERROR, `Cannot create schedule for "${details.description}": past one-off date with DEFAULT_SKIP_MISSED policy.`);
          return null; 
      }
  }

  const newItem: ScheduleItem = {
    id,
    ...details,
    is_active: true,
    next_run_time: initialNextRunTime,
  };

  try {
    dbAddScheduleItem(id, {
        description: newItem.description,
        schedule_expression: newItem.schedule_expression,
        payload: newItem.payload,
        task_key: newItem.task_key,
        task_handler_type: newItem.task_handler_type,
        execution_policy: newItem.execution_policy,
    }, initialNextRunTime);
    
    if (scheduleJob(newItem)) {
      log(LogLevel.INFO, `New schedule created and job set.`, { id: newItem.id, task_key: newItem.task_key });
      return newItem;
    } else {
      log(LogLevel.WARN, `New schedule "${newItem.description}" (ID: ${newItem.id}) added to DB, but node-schedule job NOT set (e.g. past one-off not schedulable by policy). May run via catch-up if applicable.`);
      // Return the item as it is in DB. It might be picked up by catch-up logic if policy allows.
      return newItem; 
    }
  } catch (error: any) {
    log(LogLevel.ERROR, 'Error creating new schedule and adding to DB:', { error: error.message, details });
    return null;
  }
}

export function cancelScheduleById(id: string): boolean {
  const job = activeJobs.get(id);
  if (job) {
    job.cancel();
    activeJobs.delete(id);
    dbDeactivateScheduleItem(id); 
    log(LogLevel.INFO, `Schedule cancelled and deactivated.`, { id });
    return true;
  }
  log(LogLevel.WARN, `No active job found to cancel for schedule ID. Attempting DB deactivation.`, { id });
  const result = dbDeactivateScheduleItem(id);
  return result.changes > 0;
}

export function listActiveSchedules(): ScheduleItem[] {
  return dbGetActiveScheduleItems();
}

export function getScheduleStatus(): { id: string; description: string; task_key: string; nextRun: string | null; handler: string; policy: string, last_invocation: string | null }[] {
  const statusList: { id: string; description: string; task_key: string; nextRun: string | null; handler: string; policy: string, last_invocation: string | null }[] = [];
  const dbItems = dbGetActiveScheduleItems(); 

  for (const item of dbItems) {
    const job = activeJobs.get(item.id);
    statusList.push({
        id: item.id,
        description: item.description,
        task_key: item.task_key,
        nextRun: job?.nextInvocation()?.toISOString() || item.next_run_time || "(not scheduled/past)",
        handler: item.task_handler_type,
        policy: item.execution_policy,
        last_invocation: item.last_invocation || null,
    });
  }
   statusList.sort((a, b) => {
    const timeA = a.nextRun && !a.nextRun.startsWith("(") ? new Date(a.nextRun).getTime() : Infinity;
    const timeB = b.nextRun && !b.nextRun.startsWith("(") ? new Date(b.nextRun).getTime() : Infinity;
    if (timeA === Infinity && timeB === Infinity) return 0;
    return timeA - timeB;
  });
  return statusList;
}

export async function updateScheduleExpressionAndReschedule(itemId: string, newScheduleExpression: string): Promise<ScheduleItem | null> {
  log(LogLevel.INFO, `Attempting to update schedule expression for item ${itemId} to "${newScheduleExpression}"`);
  const existingItem = await dbGetScheduleItemById(itemId);
  if (!existingItem) {
    log(LogLevel.ERROR, `Cannot update schedule expression: Item with ID ${itemId} not found.`);
    return null;
  }

  // Update the schedule expression in the database
  // Also, critically, nullify next_run_time so scheduleJob can recalculate it.
  // last_invocation remains unchanged.
  dbUpdateScheduleItem(itemId, { 
    schedule_expression: newScheduleExpression, 
    next_run_time: null 
  });

  // Fetch the item again to get all fields including the updated expression
  const updatedItem = await dbGetScheduleItemById(itemId);
  if (!updatedItem) {
    log(LogLevel.ERROR, `Failed to retrieve item ${itemId} after attempting DB update for schedule expression.`);
    // This is a problematic state, the DB might be updated but we can't reschedule.
    return null;
  }

  // Cancel existing job if it's active
  const currentJob = activeJobs.get(itemId);
  if (currentJob) {
    currentJob.cancel();
    activeJobs.delete(itemId);
    log(LogLevel.DEBUG, `Cancelled existing node-schedule job for item ${itemId} before rescheduling.`);
  }

  // Reschedule with the updated item
  if (updatedItem.is_active) {
    if (scheduleJob(updatedItem)) {
      log(LogLevel.INFO, `Item ${itemId} successfully rescheduled with new expression "${newScheduleExpression}". Next run: ${updatedItem.next_run_time}`);
      return updatedItem;
    } else {
      log(LogLevel.WARN, `Item ${itemId} DB expression updated to "${newScheduleExpression}", but failed to set new node-schedule job. It may run via catch-up if applicable.`);
      // The item is in DB with new expression, but not actively scheduled by node-schedule.
      return updatedItem; // Return the item as it is in DB
    }
  } else {
    log(LogLevel.INFO, `Item ${itemId} schedule expression updated in DB, but item is not active. Not rescheduling.`);
    return updatedItem; // Return the item as it is in DB
  }
}

function gracefulShutdown() {
  log(LogLevel.INFO, 'SchedulerService V2 shutting down gracefully...');
  const jobsToCancel = Array.from(activeJobs.values());
  jobsToCancel.forEach(job => job.cancel(false)); 
  activeJobs.clear();
  log(LogLevel.INFO, `Cancelled ${jobsToCancel.length} active jobs. SchedulerService V2 shutdown complete.`);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Old functions to be removed or fully refactored:
// createAgentTaskSchedule -> Replaced by generic createSchedule, tools need to adapt.
// createReminderFromText -> This was for CLI reminders, likely needs a V2 equivalent if that feature is kept.
// listActiveReminders -> Replaced by listActiveSchedules
// getNextInvocations -> Replaced by getScheduleStatus or similar.
// cancelReminderById -> Replaced by cancelScheduleById
// deleteReminderById -> Use dbDeleteScheduleItem directly if needed for hard delete.
// getReminderById -> Use dbGetScheduleItemById.
// updateReminder -> Use dbUpdateScheduleItem.

// The `scheduleAgentTaskTool` in `src/tools/scheduler.ts` will need to be updated
// to use `createSchedule` and provide the new V2 parameters.

// Example of how a tool might call it:
// await createSchedule({
//   description: "Agent task: " + taskName,
//   schedule_expression: scheduleDate.toISOString(),
//   payload: taskPayload,
//   task_key: `agent.intent.${uuidv4()}`, // Or a more specific key
//   task_handler_type: 'AGENT_PROMPT',
//   execution_policy: 'DEFAULT_SKIP_MISSED', // Or as specified by user/tool
// });

// TODO: Adapt `createAgentTaskSchedule` for tools to use the new `createSchedule`
// This will require the calling tool (e.g. scheduleAgentTaskTool) to provide more V2 details like task_key, execution_policy.
// For now, let's provide a simplified bridge if needed by existing tools,
// or update the tools themselves (preferred).

// Example of how a tool might call it:
// await createSchedule({
//   description: "Agent task: " + taskName,
//   schedule_expression: scheduleDate.toISOString(),
//   payload: taskPayload,
//   task_key: `agent.intent.${uuidv4()}`, // Or a more specific key
//   task_handler_type: 'AGENT_PROMPT',
//   execution_policy: 'DEFAULT_SKIP_MISSED', // Or as specified by user/tool
// }); 

// Expose getScheduleItemByKey from the repository through the service
export async function getScheduleItemByKey(task_key: string): Promise<ScheduleItem | undefined> {
  return dbGetScheduleItemByKey(task_key);
}

export async function ensureScheduleIsManaged(options: ScheduledTaskSetupOptions, appConfig: AppConfig): Promise<void> {
  const { taskKey, description, defaultScheduleExpression, configKeyForSchedule, functionToExecute, executionPolicy, initialPayload } = options;

  log(LogLevel.INFO, `Ensuring schedule is managed for task: "${taskKey}" ("${description}")`);

  // 1. Determine the cron expression
  let cronExpression = defaultScheduleExpression;
  if (configKeyForSchedule) {
    // Helper to navigate a path like "tools.dailyReview.scheduleCronExpression" in appConfig
    const getConfigValueByPath = (obj: any, path: string): string | undefined => {
      const keys = path.split('.');
      let current = obj;
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          return undefined;
        }
      }
      return typeof current === 'string' ? current : undefined;
    };
    const configuredCron = getConfigValueByPath(appConfig, configKeyForSchedule);
    if (configuredCron) {
      cronExpression = configuredCron;
      log(LogLevel.DEBUG, `Using configured cron expression "${cronExpression}" for task "${taskKey}" from config key "${configKeyForSchedule}".`);
    } else {
      log(LogLevel.DEBUG, `Config key "${configKeyForSchedule}" not found or not a string for task "${taskKey}". Using default: "${defaultScheduleExpression}".`);
    }
  }

  // 2. Register the direct function (idempotent, but good to ensure)
  registerDirectScheduledFunction(taskKey, functionToExecute);

  // 3. Check if the job exists
  const existingJob = await getScheduleItemByKey(taskKey);

  if (!existingJob) {
    log(LogLevel.INFO, `Task "${taskKey}" not found in DB. Creating new schedule with expression "${cronExpression}".`);
    const newSchedule = await createSchedule({
      description,
      schedule_expression: cronExpression,
      payload: initialPayload ? JSON.stringify(initialPayload) : JSON.stringify({}),
      task_key: taskKey,
      task_handler_type: 'DIRECT_FUNCTION',
      execution_policy: executionPolicy,
    });
    if (newSchedule) {
      log(LogLevel.INFO, `Task "${taskKey}" created successfully.`, { id: newSchedule.id });
    } else {
      log(LogLevel.ERROR, `Failed to create schedule for task "${taskKey}".`);
    }
  } else {
    // Job exists, check if its schedule expression needs an update
    if (existingJob.schedule_expression !== cronExpression) {
      log(LogLevel.INFO, `Task "${taskKey}" (ID: ${existingJob.id}) exists, but its schedule ('${existingJob.schedule_expression}') differs from determined cron ('${cronExpression}'). Attempting update.`);
      const updatedJob = await updateScheduleExpressionAndReschedule(existingJob.id, cronExpression);
      if (updatedJob) {
        log(LogLevel.INFO, `Task "${taskKey}" (ID: ${updatedJob.id}) successfully updated to schedule '${updatedJob.schedule_expression}'. Next run: ${updatedJob.next_run_time}`);
      } else {
        log(LogLevel.ERROR, `Failed to update schedule for task "${taskKey}" (ID: ${existingJob.id}). It will continue with its old schedule '${existingJob.schedule_expression}'.`);
      }
    } else {
      log(LogLevel.INFO, `Task "${taskKey}" (ID: ${existingJob.id}) already exists and its schedule ("${existingJob.schedule_expression}") is up-to-date.`);
    }
  }
} 