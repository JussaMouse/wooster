import { StructuredTool } from 'langchain/tools';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { z } from 'zod';
import {
  initUserProfileStore as initStore,
  addUserFactToProfileStore as addFactToStore,
  retrieveUserProfileContext as retrieveContext
} from './userProfileVectorStore';
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

const recallUserProfileSchema = z.object({
  topic: z.string().describe("The topic or subject to recall information about from the user profile."),
});

const saveUserProfileSchema = z.object({
  fact_category: z.string().describe("The category or type of the fact being saved (e.g., 'email address', 'preferred city')."),
  fact_value: z.string().describe("The actual piece of information or preference to save (e.g., 'user@example.com', 'New York')."),
});

class RecallUserProfileTool extends StructuredTool<typeof recallUserProfileSchema> {
  name = "recall_user_profile";
  description = "Recalls stored user profile information, preferences, or facts based on a specific topic.";
  schema = recallUserProfileSchema;

  private plugin: UserProfilePluginDefinition;

  constructor(plugin: UserProfilePluginDefinition) {
    super();
    this.plugin = plugin;
  }

  protected async _call(args: z.infer<typeof recallUserProfileSchema>, runManager?: CallbackManagerForToolRun): Promise<string> {
    this.plugin.logForTool(LogLevel.DEBUG, 'recall_user_profile tool executed.', { args });

    const storeInstance = this.plugin.getUserProfileStoreInstance();
    if (!storeInstance) {
      this.plugin.logForTool(LogLevel.ERROR, "User Profile store not available for recall_user_profile tool.");
      return "User Profile store is not currently available.";
    }
    const { topic } = args;
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      this.plugin.logForTool(LogLevel.WARN, "No topic provided for recall.", { args });
      return "No topic provided for user profile recall. Please specify a topic.";
    }
    try {
      const results = await retrieveContext(storeInstance, topic, 2);
      if (results.length === 0) {
        return `No specific profile data or context found for the topic: \"${topic}\".`;
      }
      return results.map(doc => String(doc.pageContent)).join('\n---\n');
    } catch (error: any) {
      this.plugin.logForTool(LogLevel.ERROR, `Error recalling profile data for topic \"${topic}\":`, { error: error.message });
      return `Error occurred while trying to recall user profile data for topic: \"${topic}\".`;
    }
  }
}

// Define a concrete class extending StructuredTool
class SaveUserProfileTool extends StructuredTool<typeof saveUserProfileSchema> {
  name = "save_user_profile";
  description = "Saves or updates a new piece of information, preference, or fact about the user to their profile. Provide a category for the fact and the fact's value.";
  schema = saveUserProfileSchema;

  // Store reference to plugin instance for context
  private plugin: UserProfilePluginDefinition;

  constructor(plugin: UserProfilePluginDefinition) {
    super();
    this.plugin = plugin;
  }

  protected async _call(args: z.infer<typeof saveUserProfileSchema>, runManager?: CallbackManagerForToolRun): Promise<string> {
    this.plugin.logForTool(LogLevel.DEBUG, 'save_user_profile tool executed.', { args });

    if (!this.plugin.getUserProfileStoreInstance()) {
      this.plugin.logForTool(LogLevel.ERROR, "User Profile store not available for save_user_profile tool.");
      return "User Profile store is not currently available for saving.";
    }
    
    const { fact_category, fact_value } = args;

    if (!fact_category || typeof fact_category !== 'string' || fact_category.trim() === '') {
      this.plugin.logForTool(LogLevel.WARN, "No fact_category provided for saving.", { args });
      return "No fact_category provided for user profile saving. Please specify a category for the fact.";
    }
    if (!fact_value || typeof fact_value !== 'string' || fact_value.trim() === '') {
      this.plugin.logForTool(LogLevel.WARN, "No fact_value provided for saving.", { args });
      return "No fact_value provided for user profile saving. Please specify the value of the fact.";
    }

    const combinedFact = `${fact_category}: ${fact_value}`;

    try {
      await addFactToStore(combinedFact, this.plugin.getUserProfileStoreInstance()!);
      return `Fact "${combinedFact}" added/updated in user profile.`;
    } catch (error: any) {
      this.plugin.logForTool(LogLevel.ERROR, `Error saving profile data "${combinedFact}":`, { error: error.message });
      return `Error occurred while trying to save user profile data: "${combinedFact}".`;
    }
  }
}

class UserProfilePluginDefinition implements WoosterPlugin {
  static readonly pluginName = "userProfile";
  static readonly version = "1.0.4"; // Incremented version for tool refactor
  static readonly description = "Manages user profile information, allowing recall and storage of user facts and preferences. Uses a dedicated vector store.";

  readonly name = UserProfilePluginDefinition.pluginName;
  readonly version = UserProfilePluginDefinition.version;
  readonly description = UserProfilePluginDefinition.description;

  private coreServices: CoreServices | null = null;
  private userProfileStoreInstance: FaissStore | null = null;
  private recallUserProfileToolInstance!: RecallUserProfileTool;
  private saveUserProfileToolInstance!: SaveUserProfileTool;

  // Public getter for the store instance, needed by the tool
  public getUserProfileStoreInstance(): FaissStore | null {
    return this.userProfileStoreInstance;
  }

  // Public log method for the tool
  public logForTool(level: LogLevel, message: string, metadata?: object) {
    this.logMsg(level, message, metadata);
  }

  private logMsg(level: LogLevel, message: string, metadata?: object) {
    if (this.coreServices && this.coreServices.log) {
      this.coreServices.log(level, `[${UserProfilePluginDefinition.pluginName} Plugin v${this.version}] ${message}`, metadata);
    } else {
      console.log(`[${level}][${UserProfilePluginDefinition.pluginName} Plugin v${this.version}] ${message}`, metadata || '');
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.coreServices = services;
    this.logMsg(LogLevel.INFO, `Initializing...`);

    if (config.userProfile?.enabled) {
      try {
        this.userProfileStoreInstance = await initStore(); 
        this.logMsg(LogLevel.INFO, "User profile store initialized successfully.");
      } catch (error: any) {
        this.logMsg(LogLevel.ERROR, "Failed to initialize user profile store:", { error: error.message });
        this.userProfileStoreInstance = null; 
      }
    } else {
      this.logMsg(LogLevel.INFO, "User profile system is disabled in configuration.");
    }

    // Instantiate the new RecallUserProfileTool class
    this.recallUserProfileToolInstance = new RecallUserProfileTool(this);

    // Instantiate the new SaveUserProfileTool class
    this.saveUserProfileToolInstance = new SaveUserProfileTool(this);
  }

  getAgentTools?(): Array<RecallUserProfileTool | SaveUserProfileTool> {
    const appConfig = this.coreServices?.getConfig();
    if (appConfig?.plugins?.[this.name] === true && appConfig?.userProfile?.enabled && this.userProfileStoreInstance) {
      this.logMsg(LogLevel.DEBUG, 'Providing recall_user_profile and save_user_profile tools.');
      return [this.recallUserProfileToolInstance, this.saveUserProfileToolInstance];
    }
    this.logMsg(LogLevel.DEBUG, 'Not providing tools (plugin disabled, userProfile.enabled is false, or store not initialized).');
    return [];
  }
}

export default UserProfilePluginDefinition; 