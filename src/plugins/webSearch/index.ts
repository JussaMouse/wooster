import { DynamicTool } from 'langchain/tools';
import { TavilySearch } from "@langchain/tavily";
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';

class WebSearchPluginDefinition implements WoosterPlugin {
  static readonly pluginName = "webSearch";
  static readonly version = "1.0.1";
  static readonly description = "Provides web search capabilities using the Tavily API.";

  readonly name = WebSearchPluginDefinition.pluginName;
  readonly version = WebSearchPluginDefinition.version;
  readonly description = WebSearchPluginDefinition.description;

  private core: CoreServices | null = null;
  private tavilySearchToolInstance: TavilySearch | null = null;
  private webSearchTool!: DynamicTool;

  private logMsg(level: LogLevel, message: string, details?: object) {
    this.core?.log(level, `[${this.name} Plugin v${this.version}] ${message}`, details);
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.core = services;
    this.logMsg(LogLevel.INFO, 'Initializing...');

    if (config.tavily?.apiKey) {
      try {
        this.tavilySearchToolInstance = new TavilySearch({
          maxResults: 3,
          tavilyApiKey: config.tavily.apiKey,
        });
        this.logMsg(LogLevel.INFO, "Tavily Search Tool initialized and enabled. API key found.");
      } catch (error: any) {
        this.logMsg(LogLevel.ERROR, "Failed to initialize Tavily Search tool:", { error: error.message, stack: error.stack });
        this.tavilySearchToolInstance = null;
      }
    } else {
      this.logMsg(LogLevel.WARN, "Tavily API key not configured. Web search tool will not be functional.");
      this.tavilySearchToolInstance = null;
    }

    this.webSearchTool = new DynamicTool({
      name: "web_search",
      description: "Searches the web for current information, news, facts, or any topic that requires up-to-date knowledge beyond the AI's training data. Input should be a concise search query string.",
      func: async (input: string) => {
        this.logMsg(LogLevel.DEBUG, "web_search agent tool called with input:", { input });
        return this._performPluginWebSearch(input);
      },
    });
  }

  private async _performPluginWebSearch(query: string): Promise<string> {
    if (!this.tavilySearchToolInstance) {
      this.logMsg(LogLevel.WARN, "Search tool not initialized or API key missing. Cannot perform search.");
      return "Sorry, I am unable to perform a web search at this time as the tool is not configured or the API key is missing.";
    }
    try {
      this.logMsg(LogLevel.INFO, `Performing Tavily web search for: "${query}"`);
      const results = await this.tavilySearchToolInstance.invoke({ query: query }); 
      this.logMsg(LogLevel.DEBUG, "Tavily search raw results:", { results });
      
      if (typeof results === 'string') {
        return results || "No results found from web search.";
      } else if (typeof results === 'object' && results !== null) {
        return JSON.stringify(results);
      }
      return "No results found or unexpected result type from web search.";
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, `Error performing Tavily web search for query "${query}":`, { error: error.message, stack: error.stack });
      return `Sorry, I encountered an error while trying to search the web for: ${query}`;
    }
  }

  getAgentTools?(): DynamicTool[] {
    if (this.tavilySearchToolInstance) {
        this.logMsg(LogLevel.DEBUG, 'Providing web_search tool because Tavily instance is available.');
        return [this.webSearchTool];
    }
    this.logMsg(LogLevel.DEBUG, 'Not providing web_search tool because Tavily instance is not available (e.g., API key missing).');
    return [];
  }
}

export default WebSearchPluginDefinition; 