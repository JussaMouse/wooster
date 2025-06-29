import { v4 as uuidv4 } from 'uuid';
import { Cron } from 'croner';
import { log, LogLevel } from '../logger';
import { SchedulerRepository } from './schedulerRepository';
import {
  ScheduleItem,
  NewScheduleItemPayload,
} from '../types/schedulerCore';
import { CoreServices } from '../types/plugin';

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
      if (coreServices?.agent && payload) {
        await coreServices.agent.call({ input: payload });
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
    for (const item of items) {
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
}

export function _resetForTesting(): void {
  repository = null;
  activeJobs.clear();
}