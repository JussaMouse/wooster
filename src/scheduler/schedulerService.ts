import { v4 as uuidv4 } from 'uuid';
import { Cron } from 'croner';
import { log, LogLevel } from '../logger';
import { SchedulerRepository } from './schedulerRepository';
import {
  ScheduleItem,
  NewScheduleItemPayload,
} from '../types/schedulerCore';
import { CoreServices } from '../types/plugin';
import { ScheduledTaskSetupOptions } from '../types/scheduler';
import { AppConfig } from '../configLoader';

const activeJobs = new Map<string, Cron>();
let repository: SchedulerRepository | null = null;
let coreServices: CoreServices | null = null;

async function getRepo(): Promise<SchedulerRepository> {
  if (!repository) {
    repository = await SchedulerRepository.create();
  }
  return repository;
}

export function setCoreServices(services: CoreServices): void {
  coreServices = services;
}

const directFunctionRegistry = new Map<string, (payload: any) => Promise<void>>();
export function registerDirectScheduledFunction(
  taskKey: string,
  func: (payload: any) => Promise<void>
) {
  log(LogLevel.INFO, `Registering direct scheduled function: "${taskKey}"`);
  directFunctionRegistry.set(taskKey, func);
}

async function executeTask(item: ScheduleItem): Promise<void> {
  log(LogLevel.INFO, `Executing task: "${item.description}"`, { id: item.id });
  const { task_handler_type, task_key, payload } = item;

  try {
    if (task_handler_type === 'AGENT_PROMPT') {
      if (coreServices?.executeAgent && payload) {
        await coreServices.executeAgent(payload, []);
      } else if (coreServices?.agent && payload) {
        const agent = coreServices.agent as any;
        if (typeof agent.invoke === 'function') {
             await agent.invoke({ input: payload });
        } else if (typeof agent.call === 'function') {
             await agent.call({ input: payload });
        } else {
            log(LogLevel.ERROR, `Agent execution failed: coreServices.agent has no invoke or call method.`);
        }
      }
    } else if (task_handler_type === 'DIRECT_FUNCTION') {
      const func = directFunctionRegistry.get(task_key);
      if (func) {
        await func(payload ? JSON.parse(payload) : {});
      }
    }
  } catch (error) {
    log(LogLevel.ERROR, `Error executing task: "${item.description}"`, { id: item.id, error });
  }
}

function scheduleTask(item: ScheduleItem): void {
  if (!item.is_active) return;
  activeJobs.get(item.id)?.stop();
  try {
    const job = new Cron(item.schedule_expression, () => executeTask(item));
    activeJobs.set(item.id, job);
  } catch (error) {
    log(LogLevel.ERROR, `Failed to schedule task: "${item.description}"`, { id: item.id, error });
  }
}

export class SchedulerService {
  public static async start(): Promise<void> {
    const repo = await getRepo();
    const items = repo.getAllActiveScheduleItems();
    
    log(LogLevel.INFO, `SchedulerService checking ${items.length} active items for scheduling...`);

    const now = new Date();

    for (const item of items) {
      // Missed Job Handling ("Catch Up")
      // Check if it's a one-off timestamp that is in the past
      const isISO = !item.schedule_expression.includes(' ') && !item.schedule_expression.includes('*'); // Basic heuristic for ISO date vs Cron
      if (isISO) {
        const scheduleTime = new Date(item.schedule_expression);
        if (!isNaN(scheduleTime.getTime()) && scheduleTime < now) {
            log(LogLevel.WARN, `Task "${item.description}" was scheduled for ${item.schedule_expression} (past). Executing immediately as 'Catch Up'.`);
            await executeTask(item);
            
            // Disable/Delete the one-off task so it doesn't try to run again (though Cron wouldn't run it anyway)
            // Actually, let's delete it to keep DB clean.
            await SchedulerService.delete(item.id);
            continue; // Skip scheduling with Croner
        }
      }

      scheduleTask(item);
    }
    log(LogLevel.INFO, `SchedulerService started with ${activeJobs.size} jobs.`);
  }

  public static async create(item: NewScheduleItemPayload): Promise<ScheduleItem> {
    const repo = await getRepo();
    const id = uuidv4();
    repo.addScheduleItem(id, item);
    const newScheduleItem = repo.getScheduleItemById(id);
    if (!newScheduleItem) throw new Error('Failed to create schedule item.');
    scheduleTask(newScheduleItem);
    return newScheduleItem;
  }

  public static async delete(id: string): Promise<boolean> {
    activeJobs.get(id)?.stop();
    activeJobs.delete(id);
    const repo = await getRepo();
    return repo.deleteScheduleItem(id);
  }

  public static stopAll(): void {
    for (const job of activeJobs.values()) job.stop();
    activeJobs.clear();
  }

  public static async getByKey(task_key: string): Promise<ScheduleItem | undefined> {
    const repo = await getRepo();
    return repo.getScheduleItemByKey(task_key);
  }

  public static async getAllScheduledTasks(): Promise<ScheduleItem[]> {
    const repo = await getRepo();
    return repo.getAllActiveScheduleItems();
  }
}

export async function ensureScheduleIsManaged(setup: ScheduledTaskSetupOptions, config: AppConfig, pluginName: string): Promise<void> {
  const existing = await SchedulerService.getByKey(setup.taskKey);
  if (!existing) {
    log(LogLevel.INFO, `Scheduler: No schedule found for task key "${setup.taskKey}". Seeding new schedule.`);
    
    // Allow plugin-specific config to override the default cron expression
    const scheduleExpression = 
      (config.plugins?.[pluginName] as any)?.scheduleCronExpression || 
      setup.defaultScheduleExpression;

    await SchedulerService.create({
      description: setup.description,
      schedule_expression: scheduleExpression,
      task_key: setup.taskKey,
      task_handler_type: 'DIRECT_FUNCTION',
      execution_policy: setup.executionPolicy,
      payload: setup.initialPayload ? JSON.stringify(setup.initialPayload) : undefined,
    });
    
    registerDirectScheduledFunction(setup.taskKey, setup.functionToExecute);

  } else {
    log(LogLevel.INFO, `Scheduler: Found existing schedule for task key "${setup.taskKey}". No action needed.`);
    // Ensure function is registered even if DB record exists
    registerDirectScheduledFunction(setup.taskKey, setup.functionToExecute);
  }
}

export function _resetForTesting(): void {
  repository = null;
  activeJobs.clear();
}
