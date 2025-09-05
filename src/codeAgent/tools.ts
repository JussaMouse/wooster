import { log, LogLevel } from '../logger';
import { queryKnowledgeBase } from '../agentExecutorService';
import { scheduleAgentTask } from '../schedulerTool';
import { TavilySearch } from '@langchain/tavily';
import { AppConfig, getConfig } from '../configLoader';

// This will be expanded to bridge to actual tools.
export function createToolApi() {
  const config = getConfig();
  let tavilySearch: TavilySearch | undefined;

  if (config.tavily?.apiKey) {
    tavilySearch = new TavilySearch({
      maxResults: 3,
      apiKey: config.tavily.apiKey,
    });
  } else {
    log(LogLevel.WARN, '[CodeAgent] Tavily API key not configured. webSearch will be a no-op.');
  }

  return {
    webSearch: async (query: string) => {
      log(LogLevel.INFO, `[CodeAgent] webSearch called with: ${query}`);
      if (!tavilySearch) {
        return 'Web search is not configured.';
      }
      try {
        const results = await tavilySearch.invoke(query);
        return results;
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] Error during web search', { error });
        return `Error during web search: ${error.message}`;
      }
    },
    fetchText: async (url: string) => {
      log(LogLevel.INFO, `[CodeAgent] fetchText called with: ${url}`);
      // Placeholder implementation
      try {
        const response = await fetch(url);
        if (!response.ok) {
          return `Error fetching URL: ${response.statusText}`;
        }
        return await response.text();
      } catch (error: any) {
        return `Error fetching URL: ${error.message}`;
      }
    },
    queryRAG: async (query: string) => {
      log(LogLevel.INFO, `[CodeAgent] queryRAG called with: ${query}`);
      return queryKnowledgeBase(query);
    },
    writeNote: async (text: string) => {
      log(LogLevel.INFO, `[CodeAgent] writeNote called with: ${text}`);
      // Placeholder implementation - will require access to project context
    },
    schedule: async (whenISO: string, text: string) => {
      log(LogLevel.INFO, `[CodeAgent] schedule called for "${text}" at ${whenISO}`);
      return scheduleAgentTask({
        taskPayload: text,
        timeExpression: whenISO,
        humanReadableDescription: text,
      });
    },
    discordNotify: async (msg: string) => {
      log(LogLevel.INFO, `[CodeAgent] discordNotify called with: ${msg}`);
      // Placeholder implementation
    },
    signalNotify: async (msg: string) => {
      log(LogLevel.INFO, `[CodeAgent] signalNotify called with: ${msg}`);
      // Placeholder implementation
    },
  };
}
