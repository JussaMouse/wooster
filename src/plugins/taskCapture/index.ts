import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { z } from 'zod';
import { DynamicTool } from '@langchain/core/tools';
import { initializeTaskCaptureDb, addTaskToDb } from './db';
import { Task, TaskCaptureService } from './types';

// Express and http imports are no longer needed here
// import express, { Request, Response, Application, NextFunction } from 'express';
// import http from 'http';

let core: CoreServices;
// taskCaptureConfig related to API (port, apiKey, etc.) is no longer needed here.
// let taskCaptureConfig: AppConfig['taskCaptureApi'] | undefined;
// let httpServer: http.Server | null = null; 

// Zod schema for validating the task description string itself
const taskDescriptionSchema = z.string().min(1, { message: "Task description cannot be empty." });

class TaskCapturePluginDefinition implements WoosterPlugin, TaskCaptureService {
  readonly name = "taskCapture";
  readonly version = "0.2.0"; // Version increment due to significant refactor
  readonly description = "Captures tasks to a local SQLite database and provides a service for it.";

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    core.log(LogLevel.INFO, `TaskCapturePlugin (v${this.version}): Initializing...`);
    
    initializeTaskCaptureDb(core.log);
    // taskCaptureConfig = config.taskCaptureApi; // No longer needed for API server here

    services.registerService("TaskCaptureService", this);
    core.log(LogLevel.INFO, "TaskCapturePlugin: TaskCaptureService registered.");

    // API Server starting logic is removed from here
    // if (taskCaptureConfig && taskCaptureConfig.enabled) { ... }
  }

  async shutdown(): Promise<void> {
    // HTTP server shutdown logic is removed
    // if (httpServer) { ... }
    core.log(LogLevel.INFO, "TaskCapturePlugin: Shutdown (no server to stop).");
    return Promise.resolve();
  }

  captureTask(description: string): Task | null {
    core.log(LogLevel.DEBUG, `TaskCaptureService: captureTask called with description: "${description}"`);
    try {
      taskDescriptionSchema.parse(description);
    } catch (e) {
      if (e instanceof z.ZodError) {
        core.log(LogLevel.WARN, "TaskCaptureService: Invalid task description.", { description, errors: e.errors });
      }
      return null; // Or throw an error that the ApiPlugin can catch and format as a 400
    }

    try {
      const newTask = addTaskToDb(description.trim());
      if (newTask) {
        core.log(LogLevel.INFO, `TaskCaptureService: Task captured successfully. ID: ${newTask.id}`);
      }
      return newTask;
    } catch (error) {
      core.log(LogLevel.ERROR, "TaskCaptureService: Error capturing task.", { error });
      // Consider throwing a specific error here for ApiPlugin to handle as 500
      return null;
    }
  }

  // startApiServer method is removed
  // private startApiServer(currentApiConfig: NonNullable<AppConfig['taskCaptureApi']>) { ... }
 
  getAgentTools?(): DynamicTool[] {
    const captureTool = new DynamicTool({
      name: "captureTask",
      description: "Captures a new task or note to your task list. The input should be the task description as a single string.",
      func: async (input: string): Promise<string> => {
        core.log(LogLevel.DEBUG, 'AgentTool captureTask: called with input string', { input });
        const task = this.captureTask(input);
        if (task) {
          return `OK, I\'ve captured: "${task.description}" (ID: ${task.id})`;
        }
        // The service method now returns null on validation error or DB error.
        // The agent tool can provide a more generic failure message or reflect the null.
        return "Sorry, I couldn't capture that task. It might be an invalid description or a system error.";
      },
    });
    return [captureTool];
  }
}

export default new TaskCapturePluginDefinition(); 