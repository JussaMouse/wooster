import { DynamicTool } from "@langchain/core/tools";
import { AppConfig } from "./configLoader";

/**
 * Defines the interface for a Wooster plugin.
 * Plugins can extend Wooster's functionality by providing new tools, 
 * lifecycle hooks, or other custom behaviors.
 */
export interface WoosterPlugin {
  /** The unique name of the plugin (e.g., "GmailPlugin", "GoogleCalendarPlugin") */
  name: string;
  /** A brief description of what the plugin does. */
  description: string;
  /** The version of the plugin. */
  version: string;

  /**
   * Optional asynchronous initialization function for the plugin.
   * This is called once when the plugin is loaded.
   * @param config The global application configuration.
   */
  initialize?: (config: AppConfig) => Promise<void>;

  /**
   * Optional method to provide a list of agent tools (LangChain DynamicTool instances)
   * that this plugin makes available to the agent.
   * These tools will be aggregated by the PluginManager and made available to the AgentExecutorService.
   * @returns An array of DynamicTool instances, or undefined if the plugin provides no tools.
   */
  getAgentTools?: () => DynamicTool[];

  // Add other lifecycle methods here as needed, for example:
  // onUserMessage?: (message: string) => Promise<void>;
  // onAgentResponse?: (response: string) => Promise<void>;
  // onShutdown?: () => Promise<void>;
} 