import { StructuredTool } from 'langchain/tools';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { z } from 'zod';
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { UserProfileService, IUserProfileService } from './UserProfileService';

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

  protected async _call({ topic }: z.infer<typeof recallUserProfileSchema>, runManager?: CallbackManagerForToolRun): Promise<string> {
    if (!this.service.getStoreInstance()) {
      return "User Profile store is not currently available.";
    }
    try {
      const results = await this.service.query(topic, 2);
      if (results.length === 0) {
        return `No specific profile data or context found for the topic: \"${topic}\".`;
      }
      return results.map((doc: { pageContent: string }) => doc.pageContent).join('\n---\n');
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

  protected async _call({ fact_category, fact_value }: z.infer<typeof saveUserProfileSchema>, runManager?: CallbackManagerForToolRun): Promise<string> {
    if (!this.service.getStoreInstance()) {
      return "User Profile store is not currently available for saving.";
    }
    const combinedFact = `${fact_category}: ${fact_value}`;
    try {
      await this.service.add(combinedFact, { category: fact_category });
      return `Fact "${combinedFact}" added/updated in user profile.`;
    } catch (error: any) {
      return `Error occurred while trying to save user profile data: "${combinedFact}".`;
    }
  }
}

class UserProfilePluginDefinition implements WoosterPlugin {
  static readonly pluginName = "userProfile";
  static readonly version = "1.1.0";
  static readonly description = "Manages user profile information, allowing recall and storage of user facts and preferences.";
  readonly name = UserProfilePluginDefinition.pluginName;
  readonly version = UserProfilePluginDefinition.version;
  readonly description = UserProfilePluginDefinition.description;
  private coreServices!: CoreServices;
  private userProfileService: IUserProfileService | null = null;
  private recallTool: RecallUserProfileTool | null = null;
  private saveTool: SaveUserProfileTool | null = null;

  private log(level: LogLevel, message: string, metadata?: object) {
    if (this.coreServices?.log) {
      this.coreServices.log(level, `[${this.name} Plugin v${this.version}] ${message}`, metadata);
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.coreServices = services;
    this.log(LogLevel.INFO, `Initializing...`);

    if (config.userProfile?.enabled) {
      try {
        const serviceInstance = UserProfileService.getInstance(config);
        await serviceInstance.initialize();
        this.userProfileService = serviceInstance;

        this.log(LogLevel.INFO, "UserProfileService initialized and registered.");
        
        services.registerService('UserProfileService', this.userProfileService);

        this.recallTool = new RecallUserProfileTool(this.userProfileService);
        this.saveTool = new SaveUserProfileTool(this.userProfileService);
        
      } catch (error: any) {
        this.log(LogLevel.ERROR, "Failed to initialize UserProfileService.", { error: error.message });
      }
    } else {
      this.log(LogLevel.INFO, "User profile system is disabled in configuration.");
    }
  }

  getAgentTools?(): Array<RecallUserProfileTool | SaveUserProfileTool> {
    const tools: Array<RecallUserProfileTool | SaveUserProfileTool> = [];
    if (this.recallTool && this.saveTool) {
      tools.push(this.recallTool, this.saveTool);
      this.log(LogLevel.DEBUG, 'Providing user profile tools.');
    }
    return tools;
  }
}

export default UserProfilePluginDefinition; 