import { DynamicTool } from '@langchain/core/tools';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { AppConfig } from '../../configLoader'; // Adjusted path
import { WoosterPlugin, CoreServices } from '../../types/plugin'; // Adjusted path
import { LogLevel } from '../../logger'; // Adjusted path
import {
  initUserProfileStore as initStore,
  addUserFactToProfileStore as addFactToStore,
  retrieveUserProfileContext as retrieveContext
} from './userProfileVectorStore'; // Adjusted path to new local file

let core: CoreServices | null = null;
let userProfileStoreInstance: FaissStore | null = null;

// ... (rest of the file remains the same, as args interfaces and tool functions are self-contained or use the imported functions whose signatures match)
interface RecallUserProfileArgs {
  topic: string;
}
interface SaveUserProfileArgs {
  fact: string;
}

async function recallUserProfileFunc(args: RecallUserProfileArgs): Promise<string> {
  core?.log(LogLevel.INFO, 'UserProfilePlugin: recallUserProfileFunc called', { args });
  if (!userProfileStoreInstance) {
    core?.log(LogLevel.ERROR, "UserProfilePlugin: User Profile store not available.");
    return "User Profile store is not currently available.";
  }
  const { topic } = args;
  if (!topic || typeof topic !== 'string' || topic.trim() === '') {
    core?.log(LogLevel.WARN, "UserProfilePlugin: No topic provided for recall.", { args });
    return "No topic provided for user profile recall. Please specify a topic.";
  }
  try {
    // retrieveContext now correctly points to retrieveUserProfileContext from userProfileVectorStore.ts
    const results = await retrieveContext(userProfileStoreInstance, topic, 2); 
    if (results.length === 0) {
      return `No specific profile data or context found for the topic: "${topic}".`;
    }
    return results.map(doc => doc.pageContent).join('\n---\n');
  } catch (error: any) {
    core?.log(LogLevel.ERROR, `UserProfilePlugin: Error recalling profile data for topic "${topic}":`, { error: error.message });
    return `Error occurred while trying to recall user profile data for topic: "${topic}".`;
  }
}

async function saveUserProfileFunc(args: SaveUserProfileArgs): Promise<string> {
  core?.log(LogLevel.INFO, 'UserProfilePlugin: saveUserProfileFunc called', { args });
  if (!userProfileStoreInstance) {
    core?.log(LogLevel.ERROR, "UserProfilePlugin: User Profile store not available.");
    return "User Profile store is not currently available for saving.";
  }
  const { fact } = args;
  if (!fact || typeof fact !== 'string' || fact.trim() === '') {
    core?.log(LogLevel.WARN, "UserProfilePlugin: No fact provided for saving.", { args });
    return "No fact provided for user profile saving. Please specify a fact.";
  }
  try {
    // addFactToStore now correctly points to addUserFactToProfileStore from userProfileVectorStore.ts
    await addFactToStore(fact, userProfileStoreInstance);
    return `Fact "${fact}" added/updated in user profile.`;
  } catch (error: any) {
    core?.log(LogLevel.ERROR, `UserProfilePlugin: Error saving profile data "${fact}":`, { error: error.message });
    return `Error occurred while trying to save user profile data: "${fact}".`;
  }
}

const recallUserProfileTool = new DynamicTool({
  name: "recall_user_profile",
  description: "Recalls stored user profile information, preferences, or facts based on a specific topic. Input should be a JSON object with a single key 'topic' (string).",
  func: async (jsonInput: string) => {
    try {
      const args = JSON.parse(jsonInput) as RecallUserProfileArgs;
      return recallUserProfileFunc(args);
    } catch (e) {
      return "Invalid JSON input for recall_user_profile. Expected { \"topic\": \"your_topic_here\" }.";
    }
  }
});

const saveUserProfileTool = new DynamicTool({
  name: "save_user_profile",
  description: "Saves or updates a new piece of information, preference, or fact about the user to their profile. Input should be a JSON object with a single key 'fact' (string).",
  func: async (jsonInput: string) => {
    try {
      const args = JSON.parse(jsonInput) as SaveUserProfileArgs;
      return saveUserProfileFunc(args);
    } catch (e) {
      return "Invalid JSON input for save_user_profile. Expected { \"fact\": \"user_fact_here\" }.";
    }
  }
});

class UserProfilePluginDefinition implements WoosterPlugin {
  readonly name = "userProfile";
  readonly version = "1.0.1"; // Increment version due to refactor
  readonly description = "Manages user profile information, allowing recall and storage of user facts and preferences. Uses a dedicated vector store.";

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    core.log(LogLevel.INFO, `UserProfilePlugin (v${this.version}): Initializing...`);

    if (config.userProfile?.enabled) {
      try {
        // initStore now correctly points to initUserProfileStore from userProfileVectorStore.ts
        userProfileStoreInstance = await initStore(); 
        core.log(LogLevel.INFO, "UserProfilePlugin: User profile store initialized successfully.");
      } catch (error: any) {
        core.log(LogLevel.ERROR, "UserProfilePlugin: Failed to initialize user profile store:", { error: error.message });
        userProfileStoreInstance = null; 
      }
    } else {
      core.log(LogLevel.INFO, "UserProfilePlugin: User profile system is disabled in configuration.");
    }
  }

  getAgentTools?(): DynamicTool[] {
    const appConfig = core?.getConfig();
    // Ensure plugin is enabled in config.plugins AND userProfile specific config from appConfig is enabled AND store is initialized.
    if (appConfig?.plugins?.[this.name] === true && appConfig?.userProfile?.enabled && userProfileStoreInstance) {
      core?.log(LogLevel.DEBUG, 'UserProfilePlugin: Providing recall_user_profile and save_user_profile tools.');
      return [recallUserProfileTool, saveUserProfileTool];
    }
    core?.log(LogLevel.DEBUG, 'UserProfilePlugin: Not providing tools (plugin disabled in general, or userProfile.enabled is false, or store not initialized).');
    return [];
  }
}

export default new UserProfilePluginDefinition(); 