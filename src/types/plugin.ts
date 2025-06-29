import { DynamicTool } from "@langchain/core/tools";
import { AppConfig as Configuration } from "../configLoader";
import { ScheduledTaskSetupOptions as SchedulerOptions } from './scheduler';
import { LogLevel } from '../logger';
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import type { GmailPluginEmailArgs, GmailPluginSendEmailResult } from '../plugins/gmail/types';
import type { NextActionsService as NextActionsServiceType } from '../plugins/nextActions/types';
import { AgentExecutor } from "langchain/agents";

export { LogLevel };

// Use the AppConfig directly from the refactored configLoader
export type AppConfig = Configuration;

/**
 * Interface for a basic Email sending service that plugins can provide or consume.
 */
export interface EmailService {
  send: (args: GmailPluginEmailArgs) => Promise<GmailPluginSendEmailResult>;
}

/**
 * A collection of core services that can be passed to plugins during initialization.
 */
export interface CoreServices {
  agent?: AgentExecutor;
  /** Provides access to the global application configuration. */
  getConfig(): AppConfig;
  /** Provides a logging function. */
  log: (level: LogLevel, message: string, metadata?: object) => void;
  /** Allows a plugin to register a named service that other plugins can consume. */
  registerService: (serviceName: string, serviceInstance: any) => void;
  /** Allows a plugin to retrieve a named service registered by another plugin. */
  getService: (serviceName: string) => any | undefined;
  /** Allows a plugin or the core to set the active project context. */
  setActiveProject: (projectName: string) => Promise<void>;
  getActiveProjectPath: () => string | null;
  getActiveProjectName: () => string | null;
  getProjectVectorStore?: () => MemoryVectorStore | null;

  // Specific, commonly used services can be explicitly typed for convenience
  emailService?: EmailService;
  NextActionsService?: NextActionsServiceType;
}

/**
 * Defines the contract for a Wooster plugin.
 */
export interface WoosterPlugin {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  initialize: (config: AppConfig, services: CoreServices) => Promise<void>;
  getAgentTools?: () => DynamicTool[] | any[];
  getScheduledTaskSetups?: () => SchedulerOptions | SchedulerOptions[] | undefined;
  shutdown?: () => Promise<void>;
  getServices?(): { [serviceName: string]: any };
} 