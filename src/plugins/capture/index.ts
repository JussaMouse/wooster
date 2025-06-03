import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { z } from 'zod';
import { DynamicTool } from '@langchain/core/tools';
import { CapturedItem, CaptureService } from './types';
import * as fs from 'fs';
import * as path from 'path';

let core: CoreServices;

// Defaults consistent with sortInbox plugin if config is not fully specified
const DEFAULT_GTD_BASE_PATH = './gtd/';
const DEFAULT_INBOX_FILENAME = 'inbox.md';

// Zod schema for validating the item text string
const itemTextSchema = z.string().min(1, { message: "Item text cannot be empty." });

class CapturePluginDefinition implements WoosterPlugin, CaptureService {
  readonly name = "capture";
  readonly version = "1.1.0"; // Version bump for configurable inbox path
  readonly description = "Captures items or notes to a configurable inbox.md file (shared with sortInbox plugin).";

  private workspaceRoot!: string;
  private inboxFilePath!: string;

  private getFullPath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
        return relativePath;
    }
    return path.join(this.workspaceRoot, relativePath);
  }

  private ensureDirExists(filePath: string): void {
    // filePath is expected to be the full path to the *file*
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      core.log(LogLevel.INFO, `CapturePlugin: Created directory ${dirPath} for inbox file.`);
    }
  }

  private getResolvedInboxFilePath(): string {
    return this.getFullPath(this.inboxFilePath);
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    this.workspaceRoot = process.cwd();
    core.log(LogLevel.INFO, `CapturePlugin (v${this.version}): Initializing...`);

    // Determine inbox file path using gtd config, similar to sortInbox
    const gtdBasePath = config.gtd?.basePath ?? DEFAULT_GTD_BASE_PATH;
    this.inboxFilePath = config.gtd?.inboxPath ?? path.join(gtdBasePath, DEFAULT_INBOX_FILENAME);
    core.log(LogLevel.INFO, `CapturePlugin: Using inbox file path: ${this.inboxFilePath}`);

    this.ensureDirExists(this.getFullPath(this.inboxFilePath));
    
    services.registerService("CaptureService", this);
    core.log(LogLevel.INFO, "CapturePlugin: CaptureService registered.");
  }

  async shutdown(): Promise<void> {
    core.log(LogLevel.INFO, "CapturePlugin: Shutdown.");
    return Promise.resolve();
  }

  captureItem(text: string): CapturedItem | null {
    core.log(LogLevel.DEBUG, `CaptureService: captureItem called with text: "${text}"`);
    try {
      itemTextSchema.parse(text);
    } catch (e) {
      if (e instanceof z.ZodError) {
        core.log(LogLevel.WARN, "CaptureService: Invalid item text.", { text, errors: e.errors });
      }
      return null;
    }

    try {
      const resolvedInboxPath = this.getResolvedInboxFilePath();
      
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const localTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      const entry = `- [ ] ${localTimestamp} ${text.trim()}\n`; 
      
      fs.appendFileSync(resolvedInboxPath, entry);
      core.log(LogLevel.INFO, `CaptureService: Item appended to ${this.inboxFilePath}.`);

      const newItemId = `item_${now.getTime()}`;
      const newItem: CapturedItem = {
        id: newItemId,
        timestamp: localTimestamp,
        text: text.trim(),
      };
      return newItem;
    } catch (error: any) {
      core.log(LogLevel.ERROR, `CaptureService: Error appending to ${this.inboxFilePath}.`, { error: error.message });
      return null;
    }
  }
 
  getAgentTools?(): DynamicTool[] {
    const captureTool = new DynamicTool({
      name: "captureItem",
      description: `Captures a new item, note, or task to your configured inbox file (currently: ${this.inboxFilePath}). The input should be the text to capture.`,
      func: async (input: string): Promise<string> => {
        core.log(LogLevel.DEBUG, 'AgentTool captureItem: called with input string', { input });
        const item = this.captureItem(input);
        if (item) {
          return `OK, I\'ve captured: "${item.text}\" to ${this.inboxFilePath}.`;
        }
        return `Sorry, I couldn\'t capture that. It might be an invalid text or a system error when writing to ${this.inboxFilePath}.`;
      },
    });
    return [captureTool];
  }
}

export default new CapturePluginDefinition(); 