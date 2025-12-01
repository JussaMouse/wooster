import { log, LogLevel } from '../logger';
import { queryKnowledgeBase, getCurrentActiveProjectName, getCurrentActiveProjectPath } from '../agentExecutorService';
import { scheduleAgentTask } from '../schedulerTool';
import { SchedulerService } from '../scheduler/schedulerService';
import { TavilySearch } from '@langchain/tavily';
import { AppConfig, getConfig } from '../configLoader';
import { getRegisteredService } from '../pluginManager';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';

import { KnowledgeBaseService } from '../services/knowledgeBase/KnowledgeBaseService';
import { IngestionService } from '../services/ingestion/IngestionService';
import { v4 as uuidv4 } from 'uuid';
import slugify from 'slugify';

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

  const normalizeSignalMessageInput = (msg: any): string => {
    try {
      if (typeof msg === 'string') {
        // Try to parse JSON string with { message: "..." }
        const maybeObj = JSON.parse(msg);
        if (maybeObj && typeof maybeObj === 'object' && typeof maybeObj.message === 'string') {
          return maybeObj.message;
        }
        return msg;
      }
      if (msg && typeof msg === 'object' && typeof msg.message === 'string') {
        return msg.message;
      }
      return String(msg ?? '');
    } catch {
      return String(msg ?? '');
    }
  };

  const mask = (v?: string) => {
    if (!v) return '';
    const s = String(v);
    if (s.length <= 4) return '****';
    return s.slice(0, 2) + '***' + s.slice(-2);
  };

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
        
        // Simple HTML cleanup
        let clean = text
          .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
          .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
          .replace(/<head\b[^>]*>([\s\S]*?)<\/head>/gim, "") // Remove head content
          .replace(/<[^>]+>/g, ' ') // Strip tags
          .replace(/\s+/g, ' ') // Collapse whitespace
          .trim();

        return truncate(clean, maxOutputLength);
      } catch (error: any) {
        return `Error fetching URL: ${error.message}`;
      }
    },
    queryRAG: async (query: string) => {
      log(LogLevel.INFO, `[CodeAgent] queryRAG called with: ${query}`);
      // Deprecated but supported via KB
      const kb = KnowledgeBaseService.getInstance();
      try {
         const res = await kb.queryHybrid({ query, topK: 5 });
         const text = res.contexts.map(c => `[${c.metadata.title}] ${c.text}`).join('\n\n');
         return truncate(text, maxOutputLength);
      } catch (e) {
         log(LogLevel.ERROR, `KB Fallback Error`, {error: e});
         // Fallback to old RAG if KB fails? Or just error.
         const result = await queryKnowledgeBase(query);
         return truncate(result, maxOutputLength);
      }
    },
    kb_query: async (query: string, scope?: any) => {
      log(LogLevel.INFO, `[CodeAgent] kb_query called with: ${query}`);
      try {
        const kb = KnowledgeBaseService.getInstance();
        
        // Normalize scope: if string and not a standard namespace, treat as null (global search)
        let normalizedScope = scope;
        if (typeof scope === 'string') {
            const validNamespaces = ['notes', 'user_profile', 'books'];
            if (validNamespaces.includes(scope)) {
                normalizedScope = { namespace: scope };
            } else {
                // If scope is a random string (e.g. 'definition'), ignore it to avoid empty results.
                // Or we could treat it as a filter tag? For now, safer to ignore.
                normalizedScope = undefined;
            }
        }

        const res = await kb.queryHybrid({ 
            query, 
            topK: 5, 
            scope: normalizedScope
        });
        
        if (res.contexts.length === 0) return "No results found.";

        return JSON.stringify(res.contexts.map(c => ({
            id: c.docId,
            title: c.metadata.title,
            text: truncate(c.text, 500),
            score: c.score,
            path: c.metadata.path
        })), null, 2);
      } catch (e: any) {
        log(LogLevel.ERROR, `kb_query failed`, {error: e});
        return `Error: ${e.message}`;
      }
    },
    read_note: async (name: string) => {
        log(LogLevel.INFO, `[CodeAgent] read_note called with: ${name}`);
        try {
            const kb = KnowledgeBaseService.getInstance();
            const content = await kb.readDocument(name);
            if (content) {
                return content; // Return full content
            }
            return `Error: Could not find a note matching "${name}". Try kb_query to search for keywords.`;
        } catch (e: any) {
            return `Error reading note: ${e.message}`;
        }
    },
    zk_create: async (title: string, body: string, tags: string[] = []) => {
        log(LogLevel.INFO, `[CodeAgent] zk_create called: ${title}`);
        try {
            const slug = slugify(title, { lower: true, strict: true });
            // Default location: notes/
            const notesDir = 'notes';
            if (!fs.existsSync(notesDir)) await fsPromises.mkdir(notesDir, { recursive: true }); 
            
            const filename = `${slug}.md`;
            const filePath = path.join(notesDir, filename);
            
            if (await fsPromises.stat(filePath).then(()=>true).catch(()=>false)) {
                return `Error: File ${filename} already exists.`;
            }

            const id = uuidv4();
            const frontmatter = `---
id: ${id}
title: ${title}
created: ${Date.now()}
tags: ${JSON.stringify(tags)}
---
`;
            const content = `${frontmatter}\n${body}`;
            await fsPromises.writeFile(filePath, content);
            
            // Trigger ingest immediately
            IngestionService.getInstance().queueFile(filePath); // Need to expose queueFile public
            
            return `Created note: ${filePath} (ID: ${id})`;
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    },
    writeNote: async (text: string) => {
      log(LogLevel.INFO, `[CodeAgent] writeNote called with: ${text}`);
      try {
        const projectName = getCurrentActiveProjectName() || 'home';
        const projectPath = getCurrentActiveProjectPath() || path.join(process.cwd(), 'projects', projectName);
        const journalPath = path.join(projectPath, `${projectName}.md`);

        // Ensure project directory exists
        try { await fsPromises.mkdir(projectPath, { recursive: true }); } catch {}

        // Ensure journal exists with a minimal header
        try { await fsPromises.access(journalPath); }
        catch { await fsPromises.writeFile(journalPath, `# ${projectName} Journal\n\n`); }

        const now = new Date();
        const isoLocal = new Date(now.getTime() - now.getTimezoneOffset()*60000)
          .toISOString().replace('T', ' ').slice(0, 16);
        const entry = `## ${isoLocal}\n\n${text.trim()}\n\n`;
        await fsPromises.appendFile(journalPath, entry, { encoding: 'utf8' });
        return `Note appended to ${path.relative(process.cwd(), journalPath)}`;
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] writeNote failed', { error });
        return `Error writing note: ${error?.message || String(error)}`;
      }
    },
    capture: async (text: string) => {
      log(LogLevel.INFO, `[CodeAgent] capture called with: ${text}`);
      try {
        const svc = getRegisteredService<any>('CaptureService');
        if (!svc || typeof svc.captureItem !== 'function') {
          return 'Error: CaptureService not available.';
        }
        const item = svc.captureItem(String(text || ''));
        if (item && item.text) {
          return `Captured: ${item.text}`;
        }
        return 'Error: Failed to capture item.';
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] capture failed', { error });
        return `Error: ${error?.message || String(error)}`;
      }
    },
    calendarList: async (options?: any) => {
      log(LogLevel.INFO, `[CodeAgent] calendarList called.`);
      try {
        const listSvc = getRegisteredService<any>('ListCalendarEventsService');
        if (typeof listSvc === 'function') {
          let opts: any = undefined;
          if (options === undefined || options === null || options === '') {
            opts = undefined;
          } else if (typeof options === 'string') {
            try { opts = JSON.parse(options); } catch { opts = undefined; }
          } else if (typeof options === 'object') {
            opts = options;
          }
          const res = await listSvc(opts);
          return typeof res === 'string' ? res : JSON.stringify(res);
        }
        return 'Error: Calendar list service not available.';
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] calendarList failed', { error });
        return `Error: ${error?.message || String(error)}`;
      }
    },
    calendarCreate: async (eventJson: string) => {
      log(LogLevel.INFO, `[CodeAgent] calendarCreate called.`);
      try {
        const svc = getRegisteredService<any>('CalendarService');
        if (!svc || typeof svc.createEvent !== 'function') {
          return 'Error: CalendarService not available.';
        }
        const event = JSON.parse(String(eventJson || '{}'));
        const res = await svc.createEvent(event);
        return typeof res === 'string' ? res : JSON.stringify(res);
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] calendarCreate failed', { error });
        return `Error: ${error?.message || String(error)}`;
      }
    },
    sendEmail: async (argsJson: string) => {
      log(LogLevel.INFO, `[CodeAgent] sendEmail called.`);
      try {
        const svc = getRegisteredService<any>('EmailService');
        if (!svc || typeof svc.send !== 'function') {
          return 'Error: EmailService not available.';
        }
        const args = JSON.parse(String(argsJson || '{}'));
        const res = await svc.send(args);
        if (typeof res === 'string') return res;
        try { return JSON.stringify(res); } catch { return String(res); }
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] sendEmail failed', { error });
        return `Error: ${error?.message || String(error)}`;
      }
    },
    schedule: async (when: any, text: string) => {
      const messageText = String(text ?? '').trim();
      let timeExpression: string;
      if (typeof when === 'number' && isFinite(when)) {
        timeExpression = `in ${when} minutes`;
      } else if (typeof when === 'string') {
        const w = when.trim();
        if (/^\d+$/.test(w)) {
          timeExpression = `in ${w} minutes`;
        } else if (/^\d+\s*(m|min|min\.|mins|minutes)$/i.test(w)) {
          const n = (w.match(/^\d+/) || ['0'])[0];
          timeExpression = `in ${n} minutes`;
        } else {
          timeExpression = w;
        }
      } else {
        timeExpression = String(when ?? '').trim();
      }
      log(LogLevel.INFO, `[CodeAgent] schedule called for "${messageText}" at ${timeExpression}`);
      // Ensure the scheduled task will send a Signal message at execution time
      const payload = `sendSignal {"message":"${messageText.replace(/"/g, '\\"')}"}`;
      return scheduleAgentTask({
        taskPayload: payload,
        timeExpression,
        humanReadableDescription: messageText,
      });
    },
    list_scheduled_tasks: async () => {
        log(LogLevel.INFO, `[CodeAgent] list_scheduled_tasks called.`);
        try {
            const tasks = await SchedulerService.getAllScheduledTasks();
            if (tasks.length === 0) {
                return [];
            }
            // Return raw array so the agent can use .map() on it directly
            return tasks.map(t => ({
                id: t.id,
                schedule: t.schedule_expression,
                description: t.description,
                active: t.is_active
            }));
        } catch (error: any) {
            log(LogLevel.ERROR, '[CodeAgent] list_scheduled_tasks failed', { error });
            return `Error listing tasks: ${error.message}`;
        }
    },
    discordNotify: async (msg: string) => {
      log(LogLevel.INFO, `[CodeAgent] discordNotify called with: ${msg}`);
      // Placeholder implementation
    },
    signalNotify: async (msg: any) => {
      const text = normalizeSignalMessageInput(msg);
      log(LogLevel.INFO, `[CodeAgent] signalNotify called with: ${text}`);
      try {
        const signalEnv = {
          cliPath: process.env.SIGNAL_CLI_PATH || '/opt/homebrew/bin/signal-cli',
          number: (process.env.SIGNAL_CLI_NUMBER || '').replace(/^['"]|['"]$/g, ''),
          to: (process.env.SIGNAL_TO || '').replace(/^['"]|['"]$/g, ''),
          groupId: (process.env.SIGNAL_GROUP_ID || '').replace(/^['"]|['"]$/g, ''),
          timeoutMs: Number(process.env.SIGNAL_CLI_TIMEOUT_MS || '20000'),
        } as any;
        const { sendSignalMessage } = await import('../plugins/signal');
        const res = await (sendSignalMessage as any)(signalEnv, text);
        log(LogLevel.INFO, `[CodeAgent] signalNotify delivered (to:${mask(signalEnv.to)} group:${mask(signalEnv.groupId)} fallbackNote:${!signalEnv.to && !signalEnv.groupId})`);
        return res;
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] Error sending Signal message', { error });
        return `Error sending Signal message: ${error.message}`;
      }
    },
    // Alias used by some prompts
    sendSignal: async (msg: any) => {
      const text = normalizeSignalMessageInput(msg);
      log(LogLevel.INFO, `[CodeAgent] sendSignal (alias) called with: ${text}`);
      try {
        const signalEnv = {
          cliPath: process.env.SIGNAL_CLI_PATH || '/opt/homebrew/bin/signal-cli',
          number: (process.env.SIGNAL_CLI_NUMBER || '').replace(/^['"]|['"]$/g, ''),
          to: (process.env.SIGNAL_TO || '').replace(/^['"]|['"]$/g, ''),
          groupId: (process.env.SIGNAL_GROUP_ID || '').replace(/^['"]|['"]$/g, ''),
          timeoutMs: Number(process.env.SIGNAL_CLI_TIMEOUT_MS || '20000'),
        } as any;
        const { sendSignalMessage } = await import('../plugins/signal');
        const res = await (sendSignalMessage as any)(signalEnv, text);
        log(LogLevel.INFO, `[CodeAgent] sendSignal delivered (to:${mask(signalEnv.to)} group:${mask(signalEnv.groupId)} fallbackNote:${!signalEnv.to && !signalEnv.groupId})`);
        return res;
      } catch (error: any) {
        log(LogLevel.ERROR, '[CodeAgent] Error sending Signal message (alias)', { error });
        return `Error sending Signal message: ${error.message}`;
      }
    },
  };
}
