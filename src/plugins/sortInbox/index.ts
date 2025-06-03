import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { DynamicTool } from '@langchain/core/tools';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync } from 'child_process';
import { mainReplManager } from '../../index'; // Import mainReplManager

let core: CoreServices;

// File and Directory Paths (relative to Wooster project root)
const INBOX_FILE_PATH = './inbox.md';
const ARCHIVE_DIR_PATH = './logs/inboxArchive/';
const NEXT_ACTIONS_FILE_PATH = './next_actions.md';
const SOMEDAY_MAYBE_FILE_PATH = './someday_maybe.md';
const WAITING_FOR_FILE_PATH = './waiting_for.md';
const PROJECTS_DIR_PATH = './projects/';

interface InboxItem {
  id: string; // Unique identifier (e.g., line number or hash of rawText)
  rawText: string; // The original line text from inbox.md
  description: string; // The main content of the item
  timestamp?: string; // Optional timestamp extracted from the item
  isProcessed?: boolean; // Flag to mark if item has been handled in current session
}

class SortInboxPluginDefinition implements WoosterPlugin {
  readonly name = "sortInbox";
  readonly version = "1.1.0"; // Updated version
  readonly description = "Processes items from inbox.md with an interactive, detailed workflow.";

  private workspaceRoot = '';

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    this.workspaceRoot = process.cwd(); // Assuming Wooster runs from project root
    core.log(LogLevel.INFO, `SortInboxPlugin (v${this.version}): Initializing...`);
    this.ensureDirExists(this.getFullPath(ARCHIVE_DIR_PATH));
  }

  async shutdown(): Promise<void> {
    core.log(LogLevel.INFO, `SortInboxPlugin (v${this.version}): Shutdown.`);
  }

  private getFullPath(relativePath: string): string {
    return path.join(this.workspaceRoot, relativePath);
  }

  private ensureDirExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      core.log(LogLevel.INFO, `SortInboxPlugin: Created directory ${dirPath}`);
    }
  }

  private getProjectList(): string[] {
    const projectsFullPath = this.getFullPath(PROJECTS_DIR_PATH);
    try {
      return fs.readdirSync(projectsFullPath).filter(file =>
        fs.statSync(path.join(projectsFullPath, file)).isDirectory()
      );
    } catch (error: any) {
      core.log(LogLevel.ERROR, `SortInboxPlugin: Error listing projects in ${projectsFullPath}`, { message: error.message, stack: error.stack });
      return [];
    }
  }

  private appendToMdFile(filePath: string, content: string, heading?: string): void {
    const fullFilePath = this.getFullPath(filePath);
    let fileContent = '';
    if (heading) {
      fileContent += `\n${heading}\n`;
    }
    fileContent += `${content}\n`;
    fs.appendFileSync(fullFilePath, fileContent, 'utf-8');
  }

  private archiveInboxItem(item: InboxItem): string {
    this.ensureDirExists(this.getFullPath(ARCHIVE_DIR_PATH));
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+/, '');
    // Sanitize description for filename
    const safeDescription = item.description.substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const archiveFileName = `${timestamp}_${safeDescription || 'archived_item'}.md`;
    const archiveFilePath = this.getFullPath(path.join(ARCHIVE_DIR_PATH, archiveFileName));
    
    const archiveContent = `---
Archive Date: ${new Date().toISOString()}
Original Timestamp: ${item.timestamp || 'N/A'}
---

${item.description}
`;
    fs.writeFileSync(archiveFilePath, archiveContent, 'utf-8');
    return archiveFilePath;
  }
  
  private removeLineFromFile(filePath: string, lineToRemove: string): void {
    const fullFilePath = this.getFullPath(filePath);
    if (!fs.existsSync(fullFilePath)) return;

    let content = fs.readFileSync(fullFilePath, 'utf-8');
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => line.trim() !== lineToRemove.trim());
    content = filteredLines.join('\n');
    fs.writeFileSync(fullFilePath, content, 'utf-8');
  }

  private parseInboxItem(line: string, index: number): InboxItem | null {
    const match = line.match(/^-\s*\[\s*(x|\s)?\]\s*(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})?\s*(.*)/i);
    if (match) {
      const isDone = match[1]?.toLowerCase() === 'x';
      if (isDone) return null; // Skip already completed items

      const timestamp = match[2];
      const description = match[3].trim();
      if (description) {
        return {
          id: `line-${index + 1}-${Buffer.from(line).toString('base64')}`, // More unique ID
          rawText: line,
          description,
          timestamp,
          isProcessed: false,
        };
      }
    }
    return null;
  }

  private async readInboxItems(): Promise<InboxItem[]> {
    const inboxPath = this.getFullPath(INBOX_FILE_PATH);
    try {
      if (!fs.existsSync(inboxPath)) {
        core.log(LogLevel.WARN, `SortInboxPlugin: Inbox file not found at ${inboxPath}. Creating it.`);
        fs.writeFileSync(inboxPath, '', 'utf-8');
        return [];
      }
      const fileContent = fs.readFileSync(inboxPath, 'utf-8');
      const lines = fileContent.split('\n');
      const items: InboxItem[] = [];
      lines.forEach((line, index) => {
        if (line.trim() === '') return;
        const item = this.parseInboxItem(line, index);
        if (item) {
          items.push(item);
        }
      });
      core.log(LogLevel.DEBUG, `SortInboxPlugin: Read ${items.length} items from inbox.md`);
      return items;
    } catch (error: any) {
      core.log(LogLevel.ERROR, `SortInboxPlugin: Error reading or parsing ${INBOX_FILE_PATH}.`, { error: error.message });
      return [];
    }
  }
  
  // Helper for readline prompts
  private async ask(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, resolve));
  }

  private async processItem(item: InboxItem, rl: readline.Interface): Promise<boolean> { // Returns true if should quit
    console.log('\n-----------------------------------------------------');
    console.log(`Item: "${item.description}" ${item.timestamp ? '(Captured: ' + item.timestamp + ')' : ''}`);
    console.log('-----------------------------------------------------');
    
    const menu = `Choose an action:
  (t)rash         - Delete this item
  (d)one          - Mark as completed & archive
  (n)ext Action   - Add to Next Actions list
  (p)roject       - Create new project / Add to existing project
  (r)eference     - Add as reference material to a specific project's main notes file
  (s)omeday/Maybe - Add to Someday/Maybe list
  (w)aiting For   - Add to Waiting For list
  (c)alendar      - Schedule it (add due date/reminder to Next Actions)
  (e)dit          - Modify this item (opens in $EDITOR)
  (q)uit          - Exit inbox processing
Enter code: `;

    const action = (await this.ask(rl, menu)).toLowerCase().charAt(0);
    let projectList: string[];
    let projectChoice: string;
    let selectedProjectName: string;
    let taskDetails: string;

    switch (action) {
      case 't': // Trash
        this.removeLineFromFile(INBOX_FILE_PATH, item.rawText);
        console.log("Item trashed.");
        item.isProcessed = true;
        break;

      case 'd': // Done
        this.archiveInboxItem(item);
        this.removeLineFromFile(INBOX_FILE_PATH, item.rawText);
        console.log("Item marked as Done and archived.");
        item.isProcessed = true;
        break;

      case 'n': // Next Action
        taskDetails = await this.ask(rl, "Optional: +project @context due:YYYY-MM-DD details for next action (or leave blank): ");
        this.appendToMdFile(NEXT_ACTIONS_FILE_PATH, `- [ ] ${item.description}${taskDetails ? ' ' + taskDetails : ''} (Captured: ${item.timestamp || 'N/A'})`);
        this.archiveInboxItem(item);
        this.removeLineFromFile(INBOX_FILE_PATH, item.rawText);
        console.log("Item added to Next Actions and archived.");
        item.isProcessed = true;
        break;

      case 'p': // Project
        const projectAction = (await this.ask(rl, "Create (n)ew project or add to (e)xisting? ")).toLowerCase();
        if (projectAction.startsWith('n')) {
          const newProjectName = await this.ask(rl, "New project name: ");
          if (newProjectName) {
            const newProjectDir = path.join(PROJECTS_DIR_PATH, newProjectName);
            this.ensureDirExists(this.getFullPath(newProjectDir));
            const projectFilePath = path.join(newProjectDir, `${newProjectName}.md`);
            this.appendToMdFile(projectFilePath, `# Project: ${newProjectName}\n\n## Initial Item\n\n${item.description}\n`);
            console.log(`Project '${newProjectName}' created with item as initial content.`);
            this.archiveInboxItem(item);
            this.removeLineFromFile(INBOX_FILE_PATH, item.rawText);
            item.isProcessed = true;
          } else {
            console.log("Project creation cancelled.");
          }
        } else if (projectAction.startsWith('e')) {
          projectList = this.getProjectList();
          if (projectList.length === 0) {
            console.log("No existing projects found.");
            break;
          }
          console.log("Select a project:");
          projectList.forEach((p, i) => console.log(`${i + 1}. ${p}`));
          projectChoice = await this.ask(rl, "Enter project number: ");
          const projectIndex = parseInt(projectChoice) - 1;
          if (projectIndex >= 0 && projectIndex < projectList.length) {
            selectedProjectName = projectList[projectIndex];
            const projectFilePath = path.join(PROJECTS_DIR_PATH, selectedProjectName, `${selectedProjectName}.md`);
            const projectTaskDetails = await this.ask(rl, `What is the next action for this item within '${selectedProjectName}'? (Leave blank if just filing): `);
            const contentToAppend = `\n---\nFrom Inbox (Captured: ${item.timestamp || 'N/A'}): ${item.description}${projectTaskDetails ? '\nNext Action: ' + projectTaskDetails : ''}\n`;
            this.appendToMdFile(projectFilePath, contentToAppend, "## Project Log / Inbox Items");
            console.log(`Item added to project '${selectedProjectName}'.`);
            this.archiveInboxItem(item);
            this.removeLineFromFile(INBOX_FILE_PATH, item.rawText);
            item.isProcessed = true;
          } else {
            console.log("Invalid project selection.");
          }
        }
        break;

      case 'r': // Reference
        projectList = this.getProjectList();
        if (projectList.length === 0) {
          console.log("No projects found to add reference to.");
          break;
        }
        console.log("Select a project for this reference material:");
        projectList.forEach((p, i) => console.log(`${i + 1}. ${p}`));
        console.log("(b)ack - Return to main action menu");
        projectChoice = await this.ask(rl, "Enter project number or (b)ack: ");
        if (projectChoice.toLowerCase() === 'b') break;
        
        const refProjectIndex = parseInt(projectChoice) - 1;
        if (refProjectIndex >= 0 && refProjectIndex < projectList.length) {
          selectedProjectName = projectList[refProjectIndex];
          const projectMdPath = path.join(PROJECTS_DIR_PATH, selectedProjectName, `${selectedProjectName}.md`);
          const refContent = `---
### Reference Item - Added: ${new Date().toISOString()}
#### Original Capture: ${item.timestamp || 'N/A'}

${item.description}
`;
          this.appendToMdFile(projectMdPath, refContent, "## Captured Reference Items");
          console.log(`Item added as reference to '${selectedProjectName}'.`);
          this.archiveInboxItem(item);
          this.removeLineFromFile(INBOX_FILE_PATH, item.rawText);
          item.isProcessed = true;
        } else {
          console.log("Invalid project selection.");
        }
        break;

      case 's': // Someday/Maybe
        this.appendToMdFile(SOMEDAY_MAYBE_FILE_PATH, `- ${item.description} (Captured: ${item.timestamp || 'N/A'})`);
        this.archiveInboxItem(item);
        this.removeLineFromFile(INBOX_FILE_PATH, item.rawText);
        console.log("Item added to Someday/Maybe list and archived.");
        item.isProcessed = true;
        break;

      case 'w': // Waiting For
        taskDetails = await this.ask(rl, "Waiting for whom/what? Optional follow-up date (YYYY-MM-DD): ");
        this.appendToMdFile(WAITING_FOR_FILE_PATH, `- ${item.description} (Waiting For: ${taskDetails}) (Captured: ${item.timestamp || 'N/A'})`);
        this.archiveInboxItem(item);
        this.removeLineFromFile(INBOX_FILE_PATH, item.rawText);
        console.log("Item added to Waiting For list and archived.");
        item.isProcessed = true;
        break;
      
      case 'c': // Calendar
        taskDetails = await this.ask(rl, "Schedule for YYYY-MM-DD (or 'today', 'tomorrow', 'next week'). Task description (defaults to item content): ");
        this.appendToMdFile(NEXT_ACTIONS_FILE_PATH, `- [ ] ${item.description} (Scheduled: ${taskDetails}) (Captured: ${item.timestamp || 'N/A'})`);
        this.archiveInboxItem(item);
        this.removeLineFromFile(INBOX_FILE_PATH, item.rawText);
        console.log("Item scheduled (added to Next Actions) and archived.");
        item.isProcessed = true;
        break;

      case 'e': // Edit
        console.log("Attempting to open item in $EDITOR...");
        const tempFilePath = this.getFullPath(path.join(ARCHIVE_DIR_PATH, `temp_inbox_edit_${Date.now()}.md`));
        fs.writeFileSync(tempFilePath, item.rawText, 'utf-8');
        try {
          execSync(`$EDITOR "${tempFilePath}"`, { stdio: 'inherit' });
          const updatedContent = fs.readFileSync(tempFilePath, 'utf-8').trim();
          fs.unlinkSync(tempFilePath); // Clean up temp file

          if (updatedContent !== item.rawText) {
            console.log("Content modified. Updating item.");
            // Update the main inbox file
            const inboxFullPath = this.getFullPath(INBOX_FILE_PATH);
            let currentInboxContent = fs.readFileSync(inboxFullPath, 'utf-8');
            currentInboxContent = currentInboxContent.replace(item.rawText, updatedContent);
            fs.writeFileSync(inboxFullPath, currentInboxContent, 'utf-8');
            
            // Update the item in memory for the current session
            const parsedNewItem = this.parseInboxItem(updatedContent, 0); // Index doesn't matter much here
            if(parsedNewItem) {
                item.description = parsedNewItem.description;
                item.rawText = updatedContent; // Keep raw text for further processing
                item.timestamp = parsedNewItem.timestamp;
            }
            console.log("Item updated. Please choose an action for the modified item.");
          } else {
            console.log("No changes detected.");
          }
        } catch (error) {
          let meta: object | undefined;
          if (error instanceof Error) {
            meta = { message: error.message, stack: error.stack, details: "Failed to open or process $EDITOR modification for item: " + item.description };
          } else {
            meta = { error: String(error), details: "Unknown error during $EDITOR modification for item: " + item.description };
          }
          core.log(LogLevel.ERROR, "SortInboxPlugin: $EDITOR error", meta);
          console.log("Failed to edit item. Please ensure $EDITOR is set and working, or edit the item manually in inbox.md.");
        }
        // Do not mark as processed, loop back to re-evaluate the (potentially modified) item.
        return false; // Don't quit, re-process this item

      case 'q': // Quit
        console.log("Exiting inbox processing.");
        return true; // Signal to quit

      default:
        console.log("Invalid action. Please try again.");
        break;
    }
    return false; // Continue processing unless 'q'
  }

  public async sortInbox(): Promise<void> {
    core.log(LogLevel.INFO, "SortInboxPlugin: Starting inbox sorting process...");
    let items = await this.readInboxItems();

    if (items.length === 0) {
      core.log(LogLevel.INFO, "SortInboxPlugin: Inbox is empty or contains no actionable items.");
      if (process.stdout.isTTY) {
        console.log("Inbox is currently empty or all items are processed. 🎉");
      }
      return;
    }

    core.log(LogLevel.INFO, `SortInboxPlugin: Found ${items.length} items to process.`);
    if (process.stdout.isTTY) {
      console.log(`Found ${items.length} items in your inbox. Processing one by one...`);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(async (resolvePromise) => {
      try {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.isProcessed) continue;

          const shouldQuit = await this.processItem(item, rl);
          if (shouldQuit) break;
        }
      } catch (error) {
        let meta: object | undefined;
        if (error instanceof Error) {
            meta = { message: error.message, stack: error.stack };
        } else {
            meta = { error: String(error) };
        }
        core.log(LogLevel.ERROR, "SortInboxPlugin: Error during item processing loop.", meta);
        if (process.stdout.isTTY) {
            console.error("An error occurred during inbox processing. Please check logs.");
        }
      } finally {
        rl.close();
        const finalItems = await this.readInboxItems();
        if (finalItems.length === 0 && process.stdout.isTTY) {
            console.log("\nInbox zero! 🎉");
        } else if (process.stdout.isTTY) {
            console.log("\nFinished processing session.");
            if (finalItems.length > 0) console.log(`${finalItems.length} item(s) remaining in inbox.`);
        }
        core.log(LogLevel.INFO, "SortInboxPlugin: Finished processing inbox items.");
        resolvePromise();
      }
    });
  }

  getAgentTools?(): DynamicTool[] {
    const sortInboxTool = new DynamicTool({
      name: "processInboxItems",
      description: "Initiates an interactive command-line session to process items from inbox.md. Allows user to categorize, defer, delegate, or action each item. This tool is blocking and will wait for the session to complete.",
      func: async (): Promise<string> => {
        mainReplManager.pauseInput(); // Pause main REPL before starting
        core.log(LogLevel.DEBUG, 'AgentTool processInboxItems: called, Main REPL paused.');
        
        if (!process.stdin.isTTY) {
          const message = "ProcessInboxItems tool must be run in an interactive terminal session.";
          core.log(LogLevel.WARN, `AgentTool processInboxItems: ${message}`);
          mainReplManager.resumeInput(); // Resume REPL if not TTY and returning early
          return message;
        }
        
        try {
          await this.sortInbox(); 
          return "Inbox processing session finished.";
        } catch (err) {
            let meta: object | undefined;
            if (err instanceof Error) {
              meta = { message: err.message, stack: err.stack };
            } else {
              meta = { error: String(err) }; 
            }
            core.log(LogLevel.ERROR, "Error during sortInbox execution triggered by agent", meta);
            return "Inbox processing session failed or was interrupted. Please check logs.";
        } finally {
          mainReplManager.resumeInput(); // Ensure REPL is resumed after session ends or errors
          core.log(LogLevel.DEBUG, 'AgentTool processInboxItems: finished, Main REPL resumed.');
        }
      },
      metadata: { 
        isInteractive: true 
      }
    });
    return [sortInboxTool];
  }
}

export default new SortInboxPluginDefinition(); 