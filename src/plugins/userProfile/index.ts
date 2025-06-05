import { StructuredTool } from 'langchain/tools';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { z } from 'zod';
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { UserProfileService, IUserProfileService } from './UserProfileService';
import path from 'path';

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

  private service: IUserProfileService;

  constructor(service: IUserProfileService) {
    super();
    this.service = service;
  }

  protected async _call(args: z.infer<typeof recallUserProfileSchema>, runManager?: CallbackManagerForToolRun): Promise<string> {
    const storeInstance = this.service.getStoreInstance();
    if (!storeInstance) {
      return "User Profile store is not currently available.";
    }
    const { topic } = args;
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      return "No topic provided for user profile recall. Please specify a topic.";
    }
    try {
      const results = await this.service.retrieveContext(topic, 2);
      if (results.length === 0) {
        return `No specific profile data or context found for the topic: \"${topic}\".`;
      }
      return results.map(doc => String(doc.pageContent)).join('\n---\n');
    } catch (error: any) {
      return `Error occurred while trying to recall user profile data for topic: \"${topic}\".`;
    }
  }
}

class SaveUserProfileTool extends StructuredTool<typeof saveUserProfileSchema> {
  name = "save_user_profile";
  description = "Saves or updates a new piece of information, preference, or fact about the user to their profile. Provide a category for the fact and the fact's value.";
  schema = saveUserProfileSchema;

  private service: IUserProfileService;

  constructor(service: IUserProfileService) {
    super();
    this.service = service;
  }

  protected async _call(args: z.infer<typeof saveUserProfileSchema>, runManager?: CallbackManagerForToolRun): Promise<string> {
    const storeInstance = this.service.getStoreInstance();
    if (!storeInstance) {
      return "User Profile store is not currently available for saving.";
    }
    
    const { fact_category, fact_value } = args;

    if (!fact_category || typeof fact_category !== 'string' || fact_category.trim() === '') {
      return "No fact_category provided for user profile saving. Please specify a category for the fact.";
    }
    if (!fact_value || typeof fact_value !== 'string' || fact_value.trim() === '') {
      return "No fact_value provided for user profile saving. Please specify the value of the fact.";
    }

    const combinedFact = `${fact_category}: ${fact_value}`;

    try {
      await this.service.addUserFact(combinedFact);
      return `Fact "${combinedFact}" added/updated in user profile.`;
    } catch (error: any) {
      return `Error occurred while trying to save user profile data: "${combinedFact}".`;
    }
  }
}

class UserProfilePluginDefinition implements WoosterPlugin {
  static readonly pluginName = "userProfile";
  static readonly version = "1.0.5";
  static readonly description = "Manages user profile information, allowing recall and storage of user facts and preferences. Uses a dedicated vector store and service.";

  readonly name = UserProfilePluginDefinition.pluginName;
  readonly version = UserProfilePluginDefinition.version;
  readonly description = UserProfilePluginDefinition.description;

  private coreServices!: CoreServices;
  private userProfileService: IUserProfileService | null = null;
  
  private recallUserProfileToolInstance!: RecallUserProfileTool;
  private saveUserProfileToolInstance!: SaveUserProfileTool;

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

    const appConfig = this.coreServices.getConfig();

    if (appConfig.userProfile?.enabled) {
      const storePath = appConfig.userProfile.storePath || path.join(process.cwd(), 'vector_data', 'user_profile_store');
      this.logMsg(LogLevel.INFO, `User profile store path configured to: ${storePath}`);

      this.userProfileService = new UserProfileService(storePath, this.coreServices);
      try {
        await this.userProfileService.initialize();
        this.logMsg(LogLevel.INFO, "UserProfileService initialized successfully.");

        if (this.coreServices.registerService) {
          this.coreServices.registerService('UserProfileService', this.userProfileService);
          this.logMsg(LogLevel.INFO, "UserProfileService registered.");
        } else {
          this.logMsg(LogLevel.WARN, "registerService method not available on coreServices. UserProfileService not registered.");
        }

      } catch (error: any) {
        this.logMsg(LogLevel.ERROR, "Failed to initialize UserProfileService:", { error: error.message });
        this.userProfileService = null;
      }
    } else {
      this.logMsg(LogLevel.INFO, "User profile system is disabled in configuration.");
      this.userProfileService = null;
    }

    if (this.userProfileService) {
        this.recallUserProfileToolInstance = new RecallUserProfileTool(this.userProfileService);
        this.saveUserProfileToolInstance = new SaveUserProfileTool(this.userProfileService);
    } else {
        this.logMsg(LogLevel.WARN, "UserProfileService is not available. Tools will not be created.");
    }
    
  }

  getAgentTools?(): Array<RecallUserProfileTool | SaveUserProfileTool> {
    const appConfig = this.coreServices.getConfig();
    if (appConfig?.plugins?.[this.name] === true && 
        appConfig?.userProfile?.enabled && 
        this.userProfileService && 
        this.userProfileService.getStoreInstance()) {
      this.logMsg(LogLevel.DEBUG, 'Providing recall_user_profile and save_user_profile tools.');
      if (this.recallUserProfileToolInstance && this.saveUserProfileToolInstance) {
          return [this.recallUserProfileToolInstance, this.saveUserProfileToolInstance];
      }
    }
    this.logMsg(LogLevel.DEBUG, 'Not providing UserProfile tools (plugin/feature disabled, service not initialized, or store not ready).');
    return [];
  }
}

export default UserProfilePluginDefinition; 