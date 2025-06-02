import { ExecutionPolicyType } from './schedulerCore';
// import { ScheduleItem } from '../scheduler/reminderRepository'; // For ExecutionPolicyType

/**
 * Options to define a single scheduled task provided by a plugin.
 */
export interface ScheduledTaskSetupOptions {
  taskKey: string; // Unique key for the task, e.g., "myPlugin.doSomethingDaily"
  description: string; // User-friendly description of the task
  defaultScheduleExpression: string; // Default cron string if no specific config is found
  configKeyForSchedule?: string; // Optional key to look up in AppConfig (e.g., "plugins.myPlugin.scheduleCron")
  functionToExecute: (payload: any) => Promise<void>; // The actual function to call
  executionPolicy: ExecutionPolicyType; // e.g., 'RUN_ONCE_PER_PERIOD_CATCH_UP'
  initialPayload?: Record<string, any>; // Optional: Initial payload for the task as a JSON object
}

/**
 * Interface for plugins that want to register one or more scheduled tasks.
 */
export interface ScheduledTaskPlugin {
  /**
   * Returns the setup configurations for scheduled tasks provided by this plugin.
   * Can be a single options object or an array for multiple tasks.
   */
  getScheduledTaskSetups(): ScheduledTaskSetupOptions | ScheduledTaskSetupOptions[];
} 