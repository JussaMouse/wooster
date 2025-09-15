import { log, LogLevel } from '../logger';
import { queryKnowledgeBase, getCurrentActiveProjectName, getCurrentActiveProjectPath } from '../agentExecutorService';
import { scheduleAgentTask } from '../schedulerTool';
import { TavilySearch } from '@langchain/tavily';
import { AppConfig, getConfig } from '../configLoader';
import * as fs from 'fs/promises';
import * as path from 'path';

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + '... (truncated)';
}

const allowedUrlPatterns: RegExp[] = [
  /^https?:\/\/.*$/,
];

function isUrlAllowed(url: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(url));
}

function normalizeWebResults(raw: any, maxLen: number): { results: Array<{ title: string; url: string; snippet: string }> } {
  const pick = (v: any, keys: string[]): string => {
    for (const k of keys) {
      if (v && typeof v[k] === 'string' && v[k]) return v[k] as string;
    }
    return '';
  };

  let items: Array<{ title: string; url: string; snippet: string }> = [];
  try {
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); } catch { data = { results: [{ title: 'Result', url: '', snippet: truncate(raw, maxLen) }] }; }
    }
    if (Array.isArray(data)) {
      items = data.map((v: any) => ({
        title: truncate(pick(v, ['title']), 200) || 'Untitled',
        url: pick(v, ['url', 'link']) || '',
        snippet: truncate(pick(v, ['snippet', 'content', 'text']), maxLen)
      }));
    } else if (data && Array.isArray(data.results)) {
      items = data.results.map((v: any) => ({
        title: truncate(pick(v, ['title']), 200) || 'Untitled',
        url: pick(v, ['url', 'link']) || '',
        snippet: truncate(pick(v, ['snippet', 'content', 'text']), maxLen)
      }));
    } else if (data && typeof data === 'object') {
      items = [{ title: 'Result', url: pick(data, ['url', 'link']) || '', snippet: truncate(JSON.stringify(data), maxLen) }];
    }
  } catch {
    items = [{ title: 'Result', url: '', snippet: truncate(String(raw), maxLen) }];
  }
  return { results: items };
}

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
        return { results: [] };
      }
      try {
        const results = await tavilySearch.invoke({ query });
        return normalizeWebResults(results, maxOutputLength);
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] Error during web search', { error });
        return { results: [] };
      }
    },
    fetchText: async (url: string) => {
      log(LogLevel.INFO, `[CodeAgent] fetchText called with: ${url}`);
      
      if (!isUrlAllowed(url, allowedUrlPatterns)) {
        log(LogLevel.WARN, `[CodeAgent] Denied access to disallowed URL: ${url}`);
        return `Error: Access to URL "${url}" is not allowed.`;
      }

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
      try {
        const projectName = getCurrentActiveProjectName() || 'home';
        const projectPath = getCurrentActiveProjectPath() || path.join(process.cwd(), 'projects', projectName);
        const journalPath = path.join(projectPath, `${projectName}.md`);

        // Ensure project directory exists
        try { await fs.mkdir(projectPath, { recursive: true }); } catch {}

        // Ensure journal exists with a minimal header
        try { await fs.access(journalPath); }
        catch { await fs.writeFile(journalPath, `# ${projectName} Journal\n\n`); }

        const now = new Date();
        const isoLocal = new Date(now.getTime() - now.getTimezoneOffset()*60000)
          .toISOString().replace('T', ' ').slice(0, 16);
        const entry = `## ${isoLocal}\n\n${text.trim()}\n\n`;
        await fs.appendFile(journalPath, entry, { encoding: 'utf8' });
        return `Note appended to ${path.relative(process.cwd(), journalPath)}`;
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] writeNote failed', { error });
        return `Error writing note: ${error?.message || String(error)}`;
      }
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
        const signalEnv = {
          cliPath: process.env.SIGNAL_CLI_PATH || '/opt/homebrew/bin/signal-cli',
          number: process.env.SIGNAL_CLI_NUMBER,
          to: process.env.SIGNAL_TO,
          groupId: process.env.SIGNAL_GROUP_ID,
          timeoutMs: Number(process.env.SIGNAL_CLI_TIMEOUT_MS || '20000'),
        } as any;
        const { sendSignalMessage } = await import('../plugins/signal');
        return await (sendSignalMessage as any)(signalEnv, msg);
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] Error sending Signal message', { error });
        return `Error sending Signal message: ${error.message}`;
      }
    },
  };
}
