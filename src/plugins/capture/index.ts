import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { z } from 'zod';
import { DynamicTool } from '@langchain/core/tools';
import { CapturedItem, CaptureService } from './types';
import * as fs from 'fs';
import * as path from 'path';

let core: CoreServices;
const INBOX_FILE_NAME = 'inbox.md';

// Zod schema for validating the item description string
const itemDescriptionSchema = z.string().min(1, { message: "Item description cannot be empty." });

class CapturePluginDefinition implements WoosterPlugin, CaptureService {
  readonly name = "capture";
  readonly version = "1.0.0";
  readonly description = "Captures items or notes to a central inbox.md file.";

  private getInboxFilePath(): string {
    // const config = core.getConfig(); // No longer attempting to use config for basePath
    // Defaulting to process.cwd() for the workspace root
    const workspaceRoot = process.cwd(); 
    return path.join(workspaceRoot, INBOX_FILE_NAME);
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    core.log(LogLevel.INFO, `CapturePlugin (v${this.version}): Initializing...`);
    
    services.registerService("CaptureService", this);
    core.log(LogLevel.INFO, "CapturePlugin: CaptureService registered.");
  }

  async shutdown(): Promise<void> {
    core.log(LogLevel.INFO, "CapturePlugin: Shutdown.");
    return Promise.resolve();
  }

  captureItem(description: string): CapturedItem | null {
    core.log(LogLevel.DEBUG, `CaptureService: captureItem called with description: "${description}"`);
    try {
      itemDescriptionSchema.parse(description);
    } catch (e) {
      if (e instanceof z.ZodError) {
        core.log(LogLevel.WARN, "CaptureService: Invalid item description.", { description, errors: e.errors });
      }
      return null;
    }

    try {
      const inboxPath = this.getInboxFilePath();
      // const timestamp = new Date().toISOString(); // Old ISO timestamp
      
      // Generate local timestamp in YYYY-MM-DD HH:mm:ss format
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const localTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      // Simple markdown format, could be made more configurable
      const entry = `- [ ] ${localTimestamp} ${description.trim()}\n`; 
      
      fs.appendFileSync(inboxPath, entry);
      core.log(LogLevel.INFO, `CaptureService: Item appended to ${INBOX_FILE_NAME}.`);

      // Construct a CapturedItem object. 'id' is not applicable for file append in this simple model.
      const newItem: CapturedItem = {
        description: description.trim(),
        status: 'pending',
        createdAt: localTimestamp, // Use local timestamp
        updatedAt: localTimestamp, // Use local timestamp
      };
      return newItem;
    } catch (error: any) {
      core.log(LogLevel.ERROR, `CaptureService: Error appending to ${INBOX_FILE_NAME}.`, { error: error.message });
      return null;
    }
  }
 
  getAgentTools?(): DynamicTool[] {
    const captureTool = new DynamicTool({
      name: "captureItem",
      description: "Captures a new item, note, or task to your inbox.md file. The input should be the text to capture.",
      func: async (input: string): Promise<string> => {
        core.log(LogLevel.DEBUG, 'AgentTool captureItem: called with input string', { input });
        const item = this.captureItem(input);
        if (item) {
          return `OK, I\'ve captured: "${item.description}" to your ${INBOX_FILE_NAME}.`;
        }
        return `Sorry, I couldn\'t capture that. It might be an invalid description or a system error when writing to ${INBOX_FILE_NAME}.`;
      },
    });
    return [captureTool];
  }
}

export default new CapturePluginDefinition(); 