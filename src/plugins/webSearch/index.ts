import { DynamicTool } from '@langchain/core/tools';
import { TavilySearch } from "@langchain/tavily";
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';

let core: CoreServices | null = null;
let tavilySearchToolInstance: TavilySearch | null = null;

// This function will be wrapped by the agent tool
async function performPluginWebSearch(query: string): Promise<string> {
  if (!tavilySearchToolInstance) {
    core?.log(LogLevel.WARN, "WebSearchPlugin: Search tool not initialized or API key missing. Cannot perform search.");
    return "Sorry, I am unable to perform a web search at this time as the tool is not configured or the API key is missing.";
  }
  try {
    core?.log(LogLevel.INFO, `WebSearchPlugin: Performing Tavily web search for: "${query}"`);
    // TavilySearch from @langchain/tavily expects an object with a query property for invoke
    const results = await tavilySearchToolInstance.invoke({ query: query }); 
    core?.log(LogLevel.DEBUG, "WebSearchPlugin: Tavily search raw results:", { results });
    
    if (typeof results === 'string') {
      return results || "No results found from web search.";
    } else if (typeof results === 'object' && results !== null) {
      return JSON.stringify(results);
    }
    return "No results found or unexpected result type from web search.";
  } catch (error: any) {
    core?.log(LogLevel.ERROR, `WebSearchPlugin: Error performing Tavily web search for query "${query}":`, { error: error.message, stack: error.stack });
    return `Sorry, I encountered an error while trying to search the web for: ${query}`;
  }
}

// Agent Tool Definition
const webSearchAgentTool = new DynamicTool({
  name: "web_search", // Consistent with existing tool name
  description: "Searches the web for current information, news, facts, or any topic that requires up-to-date knowledge beyond the AI's training data. Input should be a concise search query string.",
  func: async (input: string) => { // Langchain tools typically expect a single string input
    if (core) {
      core.log(LogLevel.DEBUG, "WebSearchPlugin: web_search agent tool called with input:", { input });
    }
    return performPluginWebSearch(input);
  },
});

class WebSearchPluginDefinition implements WoosterPlugin {
  readonly name = "webSearch"; // Matches config.plugins.webSearch
  readonly version = "1.0.0";
  readonly description = "Provides web search capabilities using the Tavily API.";

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    core.log(LogLevel.INFO, `WebSearchPlugin (v${this.version}): Initializing...`);

    // Initialize TavilySearch instance
    // The plugin's enablement is checked by pluginManager using config.plugins.webSearch
    // Here, we only care about the API key for the tool's functionality.
    if (config.tavily?.apiKey) {
      try {
        tavilySearchToolInstance = new TavilySearch({
          maxResults: 3, // Default from old tool
          tavilyApiKey: config.tavily.apiKey, // Use tavilyApiKey as suggested by linter
        });
        core.log(LogLevel.INFO, "WebSearchPlugin: Tavily Search Tool initialized and enabled. API key found.");
      } catch (error: any) {
        core.log(LogLevel.ERROR, "WebSearchPlugin: Failed to initialize Tavily Search tool:", { error: error.message, stack: error.stack });
        tavilySearchToolInstance = null;
      }
    } else {
      core.log(LogLevel.WARN, "WebSearchPlugin: Tavily API key not configured. Web search tool will not be functional.");
      tavilySearchToolInstance = null;
    }
  }

  getAgentTools?(): DynamicTool[] {
    // The pluginManager handles the general enablement via config.plugins[this.name]
    // This tool should only be returned if the underlying Tavily instance is functional
    if (tavilySearchToolInstance) {
        core?.log(LogLevel.DEBUG, 'WebSearchPlugin: Providing web_search tool because Tavily instance is available.');
        return [webSearchAgentTool];
    }
    core?.log(LogLevel.DEBUG, 'WebSearchPlugin: Not providing web_search tool because Tavily instance is not available (e.g., API key missing).');
    return [];
  }
}

export default new WebSearchPluginDefinition(); 