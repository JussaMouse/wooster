import { DynamicTool } from "@langchain/core/tools";
import { AppConfig as Configuration } from "../configLoader"; // Assuming AppConfig is aliased as Configuration here
import { ScheduledTaskSetupOptions as SchedulerOptions } from './scheduler'; // Alias to avoid conflict if any local declaration
import { LogLevel } from '../logger'; // For the log function type
import type { GmailPluginEmailArgs, GmailPluginSendEmailResult } from '../plugins/gmail/types'; // Corrected import names
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import type { NextActionsService as NextActionsServiceType } from '../plugins/nextActions/types'; // Import the specific type

// Re-export LogLevel so it's available to plugins
export { LogLevel };

// Export AppConfig (which is an alias for Configuration from configLoader)
export type AppConfig = Configuration & {
  plugins: {
    [key: string]: any; // Allow other plugins
    frontend?: {
      enabled: boolean;
      port: number;
    };
  };
};

/**
 * Interface for a basic Email sending service that plugins can provide or consume.
 */
export interface EmailService {
  send: (args: GmailPluginEmailArgs) => Promise<GmailPluginSendEmailResult>;
  // We could add more methods later, e.g., readEmails, etc.
}

/**
 * A collection of core services that can be passed to plugins during initialization.
 * This can be expanded as needed.
 */
export interface CoreServices {
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

  // Specific, commonly used services can be explicitly typed for convenience
  emailService?: EmailService; // This will be populated by pluginManager if an email service is registered

  // Access to the main project vector store, if needed by plugins
  getProjectVectorStore?: () => FaissStore | null;

  // Add other core services as needed
  // webBrowser?: WebBrowser; // Removed for now
  // Potentially: NextActionsService, once defined and ready to be consumed by other plugins
  NextActionsService?: NextActionsServiceType; // Use the imported type

  // Add other optional methods as needed
  getCoreServices?: () => Partial<CoreServices>; // For plugins that provide core services
}

/**
 * Defines the contract for a Wooster plugin.
 * Each plugin should export a default object that implements this interface.
 */
export interface WoosterPlugin {
  /** A unique name for the plugin (e.g., "dailyReview", "emailService"). */
  readonly name: string;
  /** The version of the plugin (e.g., "1.0.0"). */
  readonly version: string;
  /** A brief description of what the plugin does. */
  readonly description: string;

  /**
   * An optional asynchronous function called once when the plugin is loaded.
   * Useful for one-time setup, initializing internal state, or registering with core services.
   * @param config The global application configuration.
   * @param services A collection of core services provided by Wooster.
   */
  initialize: (config: AppConfig, services: CoreServices) => Promise<void>;

  /**
   * An optional function that returns an array of LangChain DynamicTool instances
   * provided by this plugin. These tools will be made available to the agent.
   */
  getAgentTools?: () => DynamicTool[] | any[]; // Allow any[] for mixed tool types temporarily

  /**
   * An optional function that returns setup configurations for scheduled tasks
   * provided by this plugin. These tasks will be managed by the core scheduler.
   * Can return a single options object or an array for multiple tasks.
   */
  getScheduledTaskSetups?: () => SchedulerOptions | SchedulerOptions[] | undefined;

  /**
   * An optional asynchronous function called when Wooster is shutting down.
   * Useful for graceful cleanup.
   */
  shutdown?: () => Promise<void>;

  // Future potential extensions:
  // getApiRoutes?(): any; // For plugins that expose HTTP endpoints

  // Optional method to provide services to other plugins or core.
  // Example: EmailPlugin could provide an 'EmailService'
  getServices?(): { [serviceName: string]: any };

  // Add other optional methods as needed
  getCoreServices?: () => Partial<CoreServices>; // For plugins that provide core services
}

// Re-export aliased ScheduledTaskSetupOptions if needed by other parts of the app directly via this file
export type ScheduledTaskSetupOptions = SchedulerOptions;

// Ensure all necessary types are exported
export { Configuration as AppConfigType }; // If Configuration is the main AppConfig type

// Note: No need for a separate `export { CoreServices, WoosterPlugin, EmailService };` block
// The interface declarations themselves handle the export. 