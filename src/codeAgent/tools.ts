import { log, LogLevel } from '../logger';
import { queryKnowledgeBase } from '../agentExecutorService';
import { scheduleAgentTask } from '../schedulerTool';
import { TavilySearch } from '@langchain/tavily';
import { AppConfig, getConfig } from '../configLoader';
import { sendSignalMessage } from '../plugins/signal';

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + '... (truncated)';
}

const allowedUrlPatterns: RegExp[] = [
  /^https?:\/\/.*$/, // Basic http(s) pattern, can be made more restrictive
];

function isUrlAllowed(url: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(url));
}

// This will be expanded to bridge to actual tools.
export function createToolApi() {
  const config = getConfig();
  const maxOutputLength = config.codeAgent.maxOutputLength || 10000;
  let tavilySearch: TavilySearch | undefined;

  if (config.tavily?.apiKey) {
    tavilySearch = new TavilySearch({
      maxResults: 3,
      tavilyApiKey: config.tavily.apiKey,
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
        const results = await tavilySearch.invoke({ query });
        return truncate(JSON.stringify(results), maxOutputLength);
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] Error during web search', { error });
        return `Error during web search: ${error.message}`;
      }
    },
    fetchText: async (url: string) => {
      log(LogLevel.INFO, `[CodeAgent] fetchText called with: ${url}`);
      
      if (!isUrlAllowed(url, allowedUrlPatterns)) {
        log(LogLevel.WARN, `[CodeAgent] Denied access to disallowed URL: ${url}`);
        return `Error: Access to URL "${url}" is not allowed.`;
      }

      // Placeholder implementation
      try {
        const response = await fetch(url);
        if (!response.ok) {
          return `Error fetching URL: ${response.statusText}`;
        }
        const text = await response.text();
        return truncate(text, maxOutputLength);
      } catch (error: any) {
        return `Error fetching URL: ${error.message}`;
      }
    },
    queryRAG: async (query: string) => {
      log(LogLevel.INFO, `[CodeAgent] queryRAG called with: ${query}`);
      const result = await queryKnowledgeBase(query);
      return truncate(result, maxOutputLength);
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
      try {
        // This is a simplified bridge. A real implementation would need to
        // manage the SignalEnv more robustly.
        const signalEnv = {
          cliPath: process.env.SIGNAL_CLI_PATH || '/opt/homebrew/bin/signal-cli',
          number: process.env.SIGNAL_CLI_NUMBER,
          to: process.env.SIGNAL_TO,
          groupId: process.env.SIGNAL_GROUP_ID,
          timeoutMs: Number(process.env.SIGNAL_CLI_TIMEOUT_MS || '20000'),
        };
        return await sendSignalMessage(signalEnv, msg);
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] Error sending Signal message', { error });
        return `Error sending Signal message: ${error.message}`;
      }
    },
  };
}
