import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { DynamicTool } from '@langchain/core/tools';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

let core: CoreServices;
const INBOX_FILE_NAME = 'inbox.md';

interface InboxItem {
  id: string; // A unique identifier, e.g., line number or hash
  rawText: string; // The original text of the item
  description: string; // Cleaned-up description
  timestamp?: string; // Optional timestamp from the item
}

class SortInboxPluginDefinition implements WoosterPlugin {
  readonly name = "sortInbox";
  readonly version = "1.0.0";
  readonly description = "Reads items from inbox.md, presents them one by one, and allows user dispatch.";

  private getInboxFilePath(): string {
    const workspaceRoot = process.cwd(); // Assuming workspace root is current working directory
    return path.join(workspaceRoot, INBOX_FILE_NAME);
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    core.log(LogLevel.INFO, `SortInboxPlugin (v${this.version}): Initializing...`);
    // services.registerService("SortInboxService", this); // If it needs to expose methods
  }

  async shutdown(): Promise<void> {
    core.log(LogLevel.INFO, "SortInboxPlugin: Shutdown.");
    return Promise.resolve();
  }

  private parseInboxItem(line: string, index: number): InboxItem | null {
    // Example parsing: "- [ ] YYYY-MM-DD HH:mm:ss Description of the item"
    const match = line.match(/^-\s*\[\s*(x|\s)?\]\s*(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})?\s*(.*)/i);
    if (match) {
      const isDone = match[1]?.toLowerCase() === 'x';
      if (isDone) return null; // Skip completed items

      const timestamp = match[2];
      const description = match[3].trim();
      if (description) {
        return {
          id: `line-${index + 1}`,
          rawText: line,
          description,
          timestamp,
        };
      }
    }
    return null;
  }

  private async readInboxItems(): Promise<InboxItem[]> {
    const inboxPath = this.getInboxFilePath();
    try {
      if (!fs.existsSync(inboxPath)) {
        core.log(LogLevel.INFO, `SortInboxPlugin: Inbox file not found at ${inboxPath}. Nothing to sort.`);
        return [];
      }
      const fileContent = fs.readFileSync(inboxPath, 'utf-8');
      const lines = fileContent.split('\n');
      const items: InboxItem[] = [];
      lines.forEach((line, index) => {
        const item = this.parseInboxItem(line, index);
        if (item) {
          items.push(item);
        }
      });
      core.log(LogLevel.INFO, `SortInboxPlugin: Read ${items.length} items from inbox.md`);
      return items;
    } catch (error: any) {
      core.log(LogLevel.ERROR, `SortInboxPlugin: Error reading or parsing ${INBOX_FILE_NAME}.`, { error: error.message });
      return [];
    }
  }

  private async processItem(item: InboxItem): Promise<void> {
    core.log(LogLevel.INFO, `Presenting item: ${item.description}`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(`Item: "${item.description}"\nAction (s:skip, d:done, o:other [specify]): `, async (answer) => {
        rl.close();
        let newFileContent = '';
        const inboxPath = this.getInboxFilePath();
        const currentInbox = fs.readFileSync(inboxPath, 'utf-8');

        switch (answer.toLowerCase().charAt(0)) {
          case 's':
            core.log(LogLevel.INFO, `Item skipped: ${item.description}`);
            // No change to inbox.md for skip
            break;
          case 'd':
            core.log(LogLevel.INFO, `Item marked as done: ${item.description}`);
            // Mark as done: replace "- [ ]" with "- [x]"
            newFileContent = currentInbox.replace(item.rawText, item.rawText.replace("- [ ]", "- [x]"));
            fs.writeFileSync(inboxPath, newFileContent, 'utf-8');
            break;
          case 'o':
            const customAction = answer.substring(1).trim();
            core.log(LogLevel.INFO, `Item action '${customAction}': ${item.description}`);
            // For now, just remove it from inbox. We can later integrate with other plugins or tools.
            // This could involve calling an agent or another service.
            newFileContent = currentInbox.replace(item.rawText + '\n', '').replace(item.rawText, ''); // Remove the line
            fs.writeFileSync(inboxPath, newFileContent, 'utf-8');
            core.log(LogLevel.INFO, `Item removed from inbox for other action. Further processing for '${customAction}' would happen here.`);
            break;
          default:
            core.log(LogLevel.INFO, `Invalid action. Item remains unchanged: ${item.description}`);
            break;
        }
        resolve();
      });
    });
  }

  public async sortInbox(): Promise<void> {
    core.log(LogLevel.INFO, "SortInboxPlugin: Starting inbox sorting process...");
    const items = await this.readInboxItems();

    if (items.length === 0) {
      core.log(LogLevel.INFO, "SortInboxPlugin: Inbox is empty or contains no actionable items.");
      // Inform the user via console as well, since this might be run manually
      if (process.stdout.isTTY) { // Check if running in an interactive terminal
        console.log("Inbox is currently empty or all items are processed.");
      }
      return;
    }

    core.log(LogLevel.INFO, `SortInboxPlugin: Found ${items.length} items to process.`);
    if (process.stdout.isTTY) {
        console.log(`Found ${items.length} items in your inbox. Processing one by one...`);
    }

    for (const item of items) {
      await this.processItem(item);
    }
    core.log(LogLevel.INFO, "SortInboxPlugin: Finished processing inbox items.");
    if (process.stdout.isTTY) {
        console.log("Finished processing all inbox items.");
    }
  }

  getAgentTools?(): DynamicTool[] {
    const sortInboxTool = new DynamicTool({
      name: "processInboxItems",
      description: "Initiates a session to go through items in inbox.md one by one, allowing the user to mark them as done, skip, or specify other actions via console prompts.",
      func: async (): Promise<string> => {
        core.log(LogLevel.DEBUG, 'AgentTool processInboxItems: called');
        try {
          // This tool is interactive and long-running, best invoked by user directly
          // or if the agent is sure the user is ready for an interactive session.
          if (!process.stdin.isTTY) {
            const message = "ProcessInboxItems tool must be run in an interactive terminal.";
            core.log(LogLevel.WARN, `AgentTool processInboxItems: ${message}`);
            return message;
          }
          this.sortInbox(); // Fire and forget for the agent tool, console interaction handles the rest
          return "Inbox processing session started. Please check your console.";
        } catch (error: any) {
          core.log(LogLevel.ERROR, 'AgentTool processInboxItems: Error.', { error: error.message });
          return "Sorry, I couldn't start the inbox processing session due to an error.";
        }
      },
    });
    return [sortInboxTool];
  }
}

export default new SortInboxPluginDefinition(); 