import { TavilySearch } from "@langchain/tavily";
import { AppConfig } from "../configLoader";
import { log, LogLevel } from "../logger";

let tavilySearchToolInstance: TavilySearch | null = null;

export function initializeWebSearchTool(config: AppConfig): void {
  // Check if the API key is available in the config (which means it was set in the environment)
  if (config.tavilyApiKey) { 
    try {
      // TavilySearch from @langchain/tavily typically picks up TAVILY_API_KEY from env automatically.
      // Constructor options are for things like maxResults, etc.
      tavilySearchToolInstance = new TavilySearch({
        // apiKey: config.tavilyApiKey, // Removed: It should use TAVILY_API_KEY from env
        maxResults: 3, // Example: set max results
        // searchDepth: "basic", 
      });
      log(LogLevel.INFO, "Tavily web search tool initialized (using @langchain/tavily).");
    } catch (error) {
      log(LogLevel.ERROR, "Failed to initialize Tavily web search tool (@langchain/tavily):", error);
      tavilySearchToolInstance = null;
    }
  } else {
    log(LogLevel.WARN, "Tavily API key not provided (or not loaded into config). Web search tool will not be available.");
    tavilySearchToolInstance = null;
  }
}

export async function performWebSearch(query: string): Promise<string> {
  if (!tavilySearchToolInstance) {
    log(LogLevel.WARN, "Web search tool not initialized or API key missing. Cannot perform search.");
    return "Sorry, I am unable to perform a web search at this time as the tool is not configured.";
  }
  try {
    log(LogLevel.INFO, `Performing Tavily web search for: "${query}"`);
    // TavilySearch from @langchain/tavily expects an object with a query property for invoke
    const results = await tavilySearchToolInstance.invoke({ query: query }); 
    log(LogLevel.DEBUG, "Tavily search raw results:", { results });
    return results || "No results found from web search.";
  } catch (error) {
    log(LogLevel.ERROR, `Error performing Tavily web search for query "${query}":`, error);
    return `Sorry, I encountered an error while trying to search the web for: ${query}`;
  }
} 