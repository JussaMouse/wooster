import { DynamicTool } from 'langchain/tools';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';
import {
  initUserProfileStore as initStore,
  addUserFactToProfileStore as addFactToStore,
  retrieveUserProfileContext as retrieveContext
} from './userProfileVectorStore';

interface RecallUserProfileArgs {
  topic: string;
}
interface SaveUserProfileArgs {
  fact: string;
}

class UserProfilePluginDefinition implements WoosterPlugin {
  static readonly pluginName = "userProfile";
  static readonly version = "1.0.2"; // Incremented version for refactor
  static readonly description = "Manages user profile information, allowing recall and storage of user facts and preferences. Uses a dedicated vector store.";

  readonly name = UserProfilePluginDefinition.pluginName;
  readonly version = UserProfilePluginDefinition.version;
  readonly description = UserProfilePluginDefinition.description;

  private coreServices: CoreServices | null = null;
  private userProfileStoreInstance: FaissStore | null = null;
  private recallUserProfileToolInstance!: DynamicTool;
  private saveUserProfileToolInstance!: DynamicTool;

  private logMsg(level: LogLevel, message: string, metadata?: object) {
    if (this.coreServices && this.coreServices.log) {
      this.coreServices.log(level, `[${UserProfilePluginDefinition.pluginName} Plugin v${UserProfilePluginDefinition.version}] ${message}`, metadata);
    } else {
      console.log(`[${level}][${UserProfilePluginDefinition.pluginName} Plugin v${UserProfilePluginDefinition.version}] ${message}`, metadata || '');
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

    // Initialize tools here to capture 'this' context correctly
    this.recallUserProfileToolInstance = new DynamicTool({
      name: "recall_user_profile",
      description: "Recalls stored user profile information, preferences, or facts based on a specific topic. Input should be a JSON object with a single key 'topic' (string).",
      func: async (jsonInput: string) => {
        this.logMsg(LogLevel.DEBUG, 'recall_user_profile tool executed.', { input: jsonInput });
        let args: RecallUserProfileArgs;
        try {
          args = JSON.parse(jsonInput) as RecallUserProfileArgs;
        } catch (e) {
          this.logMsg(LogLevel.WARN, "Invalid JSON input for recall_user_profile.", { input: jsonInput, error: (e as Error).message });
          return "Invalid JSON input for recall_user_profile. Expected { \"topic\": \"your_topic_here\" }.";
        }

        if (!this.userProfileStoreInstance) {
          this.logMsg(LogLevel.ERROR, "User Profile store not available for recall_user_profile tool.");
          return "User Profile store is not currently available.";
        }
        const { topic } = args;
        if (!topic || typeof topic !== 'string' || topic.trim() === '') {
          this.logMsg(LogLevel.WARN, "No topic provided for recall.", { args });
          return "No topic provided for user profile recall. Please specify a topic.";
        }
        try {
          const results = await retrieveContext(this.userProfileStoreInstance, topic, 2); 
          if (results.length === 0) {
            return `No specific profile data or context found for the topic: "${topic}".`;
          }
          return results.map(doc => doc.pageContent).join('\n---\n');
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, `Error recalling profile data for topic "${topic}":`, { error: error.message });
          return `Error occurred while trying to recall user profile data for topic: "${topic}".`;
        }
      }
    });

    this.saveUserProfileToolInstance = new DynamicTool({
      name: "save_user_profile",
      description: "Saves or updates a new piece of information, preference, or fact about the user to their profile. Input should be a JSON object with a single key 'fact' (string).",
      func: async (jsonInput: string) => {
        this.logMsg(LogLevel.DEBUG, 'save_user_profile tool executed.', { input: jsonInput });
        let args: SaveUserProfileArgs;
        try {
          args = JSON.parse(jsonInput) as SaveUserProfileArgs;
        } catch (e) {
          this.logMsg(LogLevel.WARN, "Invalid JSON input for save_user_profile.", { input: jsonInput, error: (e as Error).message });
          return "Invalid JSON input for save_user_profile. Expected { \"fact\": \"user_fact_here\" }.";
        }

        if (!this.userProfileStoreInstance) {
          this.logMsg(LogLevel.ERROR, "User Profile store not available for save_user_profile tool.");
          return "User Profile store is not currently available for saving.";
        }
        const { fact } = args;
        if (!fact || typeof fact !== 'string' || fact.trim() === '') {
          this.logMsg(LogLevel.WARN, "No fact provided for saving.", { args });
          return "No fact provided for user profile saving. Please specify a fact.";
        }
        try {
          await addFactToStore(fact, this.userProfileStoreInstance);
          return `Fact "${fact}" added/updated in user profile.`;
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, `Error saving profile data "${fact}":`, { error: error.message });
          return `Error occurred while trying to save user profile data: "${fact}".`;
        }
      }
    });
  }

  getAgentTools?(): DynamicTool[] {
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