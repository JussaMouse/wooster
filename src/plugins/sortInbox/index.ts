import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { DynamicTool } from 'langchain/tools';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync } from 'child_process';
import { mainReplManager } from '../../index'; // Import mainReplManager
import * as chrono from 'chrono-node'; // Added for date parsing
import slugify from 'slugify';

// Default File and Directory Paths
const DEFAULT_GTD_BASE_PATH = './gtd/';
const DEFAULT_INBOX_FILENAME = 'inbox.md';
const DEFAULT_NEXT_ACTIONS_FILENAME = 'next_actions.md';
const DEFAULT_SOMEDAY_MAYBE_FILENAME = 'someday_maybe.md';
const DEFAULT_WAITING_FOR_FILENAME = 'waiting_for.md';

// New defaults for projects and archive paths, independent of gtdBasePath by default
const DEFAULT_PROJECTS_DIR_PATH = './projects/';
const DEFAULT_ARCHIVE_DIR_PATH = './logs/inboxArchive/';

interface InboxItem {
  id: string; // Unique identifier (e.g., line number or hash of rawText)
  rawText: string; // The original line text from inbox.md
  description: string; // The main content of the item
  timestamp?: string; // Optional timestamp extracted from the item
  isProcessed?: boolean; // Flag to mark if item has been handled in current session
}

// Define an interface for the expected CalendarService (optional but good practice)
interface CalendarService {
  createEvent: (eventDetails: {
    summary: string;
    // These are what gcal's createEventInternal takes
    startDateTime: string; 
    endDateTime: string;   
    description?: string;
    // gcal also takes timeZone, attendees, location, but sortInbox won't provide these initially
  }) => Promise<string | object>; // Adapting to gcal's return type (string for error, GCalEventData object for success)
}

class SortInboxPluginDefinition implements WoosterPlugin {
  static readonly pluginName = "sortInbox";
  static readonly version = "1.6.0"; // Incremented version
  static readonly description = "Processes items from inbox.md with an interactive, detailed workflow, including calendar event creation and adding 'waiting for' items.";

  readonly name = SortInboxPluginDefinition.pluginName;
  readonly version = SortInboxPluginDefinition.version;
  readonly description = SortInboxPluginDefinition.description;

  private coreServices!: CoreServices; // Added instance member
  private workspaceRoot = '';
  private calendarService: CalendarService | undefined;

  // Configurable paths
  private gtdBasePath!: string;
  private inboxFilePath!: string;
  private archiveDirPath!: string;
  private nextActionsFilePath!: string;
  private somedayMaybeFilePath!: string;
  private waitingForFilePath!: string;
  private projectsDirPath!: string;

  private logMsg(level: LogLevel, message: string, metadata?: object) {
    if (this.coreServices && this.coreServices.log) {
      this.coreServices.log(level, `[${SortInboxPluginDefinition.pluginName} Plugin v${SortInboxPluginDefinition.version}] ${message}`, metadata);
    } else {
      console.log(`[${level}][${SortInboxPluginDefinition.pluginName} Plugin v${SortInboxPluginDefinition.version}] ${message}`, metadata || '');
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.coreServices = services; // Use instance member
    this.workspaceRoot = process.cwd(); // Assuming Wooster runs from project root
    this.logMsg(LogLevel.INFO, `Initializing...`);

    // Initialize paths from config or use defaults
    this.gtdBasePath = config.gtd?.basePath ?? DEFAULT_GTD_BASE_PATH;
    this.logMsg(LogLevel.INFO, `Using GTD base path for core files: ${this.gtdBasePath}`);

    this.projectsDirPath = config.gtd?.projectsDir ?? DEFAULT_PROJECTS_DIR_PATH;
    this.logMsg(LogLevel.INFO, `Using projects directory: ${this.projectsDirPath}`);

    this.archiveDirPath = config.gtd?.archiveDir ?? DEFAULT_ARCHIVE_DIR_PATH;
    this.logMsg(LogLevel.INFO, `Using archive directory: ${this.archiveDirPath}`);
    
    // Specific file paths (typically within gtdBasePath, but could be overridden if needed in future by more specific config)
    this.inboxFilePath = config.gtd?.inboxPath ?? path.join(this.gtdBasePath, DEFAULT_INBOX_FILENAME);
    this.nextActionsFilePath = config.gtd?.nextActionsPath ?? path.join(this.gtdBasePath, DEFAULT_NEXT_ACTIONS_FILENAME);
    this.somedayMaybeFilePath = config.gtd?.somedayMaybePath ?? path.join(this.gtdBasePath, DEFAULT_SOMEDAY_MAYBE_FILENAME);
    this.waitingForFilePath = config.gtd?.waitingForPath ?? path.join(this.gtdBasePath, DEFAULT_WAITING_FOR_FILENAME);

    this.logMsg(LogLevel.INFO, `Inbox file path: ${this.inboxFilePath}`);
    this.logMsg(LogLevel.INFO, `Next Actions file path: ${this.nextActionsFilePath}`);
    this.logMsg(LogLevel.INFO, `Someday/Maybe file path: ${this.somedayMaybeFilePath}`);
    this.logMsg(LogLevel.INFO, `Waiting For file path: ${this.waitingForFilePath}`);

    this.ensureDirExists(this.getFullPath(this.gtdBasePath));
    this.ensureDirExists(this.getFullPath(this.projectsDirPath));
    this.ensureDirExists(this.getFullPath(this.archiveDirPath));

    // Attempt to get CalendarService
    this.calendarService = services.getService("CalendarService") as CalendarService | undefined;
    if (this.calendarService && typeof this.calendarService.createEvent === 'function') {
      this.logMsg(LogLevel.INFO, "Successfully connected to CalendarService.");
    } else {
      this.calendarService = undefined; // Ensure it's undefined if not valid
      this.logMsg(LogLevel.WARN, "CalendarService not found or is invalid. Calendar creation will be limited to next_actions.md.");
    }
  }

  async shutdown(): Promise<void> {
    this.logMsg(LogLevel.INFO, `Shutdown.`);
  }

  private getFullPath(relativePath: string): string {
    // If already absolute, return as is. Otherwise, join with workspaceRoot.
    if (path.isAbsolute(relativePath)) {
        return relativePath;
    }
    return path.join(this.workspaceRoot, relativePath);
  }

  private ensureDirExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      this.logMsg(LogLevel.INFO, `Created directory ${dirPath}`);
    }
  }

  private prependContextIfNeeded(description: string): string {
    const contextRegex = /^@\w+/;
    if (!contextRegex.test(description)) {
      return `@home ${description}`;
    }
    return description;
  }

  private getProjectList(): string[] {
    const projectsFullPath = this.getFullPath(this.projectsDirPath);
    try {
      if (!fs.existsSync(projectsFullPath)) {
        this.logMsg(LogLevel.WARN, `Projects directory ${projectsFullPath} does not exist. Returning empty list.`);
        return [];
      }
      return fs.readdirSync(projectsFullPath).filter(file => {
        const fullEntryPath = path.join(projectsFullPath, file);
        try {
          return fs.statSync(fullEntryPath).isDirectory();
        } catch (statError: any) {
          this.logMsg(LogLevel.ERROR, `Error stating file ${fullEntryPath} in getProjectList.`, { message: statError.message });
          return false;
        }
      });
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, `Error listing projects in ${projectsFullPath}`, { message: error.message, stack: error.stack });
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
    this.ensureDirExists(this.getFullPath(this.archiveDirPath));
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+/, '');
    // Sanitize description for filename
    const safeDescription = item.description.substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const archiveFileName = `${timestamp}_${safeDescription || 'archived_item'}.md`;
    const archiveFilePath = this.getFullPath(path.join(this.archiveDirPath, archiveFileName));
    
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
    const inboxPath = this.getFullPath(this.inboxFilePath);
    try {
      if (!fs.existsSync(inboxPath)) {
        this.logMsg(LogLevel.WARN, `Inbox file not found at ${inboxPath}. Creating it.`);
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
      this.logMsg(LogLevel.DEBUG, `Read ${items.length} items from inbox.md`);
      return items;
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, `Error reading or parsing ${this.inboxFilePath}.`, { error: error.message });
      return [];
    }
  }

  // Helper for readline prompts
  private async ask(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, resolve));
  }

  private async processItem(item: InboxItem, rl: readline.Interface): Promise<boolean> { // Returns true if should quit
    if (process.stdout.isTTY) {
        console.clear(); // Clear terminal for each new item
    }
    this.logMsg(LogLevel.DEBUG, "Processing inbox item", { description: item.description });
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
  (c)alendar      - Schedule it (add due date/reminder)
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
        this.removeLineFromFile(this.inboxFilePath, item.rawText);
        console.log("Item trashed.");
        item.isProcessed = true;
        break;

      case 'd': // Done
        this.archiveInboxItem(item);
        this.removeLineFromFile(this.inboxFilePath, item.rawText);
        console.log("Item marked as Done and archived.");
        item.isProcessed = true;
        break;

      case 'n': // Next Action
        taskDetails = await this.ask(rl, "Optional: +project @context due:YYYY-MM-DD details for next action (or leave blank): ");
        this.appendToMdFile(this.nextActionsFilePath, `- [ ] ${this.prependContextIfNeeded(item.description)}${taskDetails ? ' ' + taskDetails : ''} (Captured: ${item.timestamp || 'N/A'})`);
        this.archiveInboxItem(item);
        this.removeLineFromFile(this.inboxFilePath, item.rawText);
        console.log("Item added to Next Actions and archived.");
        item.isProcessed = true;
            break;

      case 'p': // Project
        const projectAction = (await this.ask(rl, "Create (n)ew project or add to (e)xisting? ")).toLowerCase();
        if (projectAction.startsWith('n')) {
          const newProjectName = await this.ask(rl, "New project name: ");
          if (newProjectName) {
            // Slugify the project name for directory and file naming
            const projectSlug = slugify(newProjectName, { lower: true, strict: true });
            const newProjectDir = path.join(this.projectsDirPath, projectSlug);
            this.ensureDirExists(this.getFullPath(newProjectDir));
            const projectFilePath = path.join(newProjectDir, `${projectSlug}.md`); // Project journal file

            // Use the original project name in the header, but file is based on slug
            this.appendToMdFile(projectFilePath, `# Journal: ${newProjectName}\n\n## Initial Item\n\n- [ ] ${item.description}\n`);

            console.log(`Project '${newProjectName}' created as '${projectSlug}' with item as initial task.`);
            this.archiveInboxItem(item);
            this.removeLineFromFile(this.inboxFilePath, item.rawText);
            item.isProcessed = true;
          } else {
            console.log("Project creation cancelled.");
          }
        } else if (projectAction.startsWith('e')) {
          projectList = this.getProjectList();
          if (projectList.length === 0) {
            console.log("No existing projects. Please create one first.");
            // Potentially offer to create one or loop back
            break;
          }
          let projectMenu = "Add to which project?\\n";
          projectList.forEach((p, i) => projectMenu += `  (${i + 1}) ${p}\\n`);
          projectMenu += "Enter number: ";
          const choiceIndex = parseInt(await this.ask(rl, projectMenu), 10) - 1;

          if (choiceIndex >= 0 && choiceIndex < projectList.length) {
            selectedProjectName = projectList[choiceIndex];
            const projectFilePath = path.join(this.projectsDirPath, selectedProjectName, `${selectedProjectName}.md`);
            taskDetails = await this.ask(rl, "Optional: details/sub-tasks for this item within the project (or leave blank): ");
            this.appendToMdFile(projectFilePath, `\\n- [ ] ${item.description}${taskDetails ? ': ' + taskDetails : ''} (Added from Inbox: ${item.timestamp || 'N/A'})`, `## Tasks`);
            this.archiveInboxItem(item);
            this.removeLineFromFile(this.inboxFilePath, item.rawText);
            console.log(`Item added to project '${selectedProjectName}' and archived.`);
            item.isProcessed = true;
          } else {
            console.log("Invalid project selection.");
          }
        } else {
          console.log("Invalid action. Returning to item.");
        }
            break;

      case 'r': // Reference
        projectList = this.getProjectList();
        if (projectList.length === 0) {
          console.log("No existing projects to add reference to. Please create a project first or add this item to a general reference file (not yet implemented).");
          // Ideally, offer to create a general ref.md or similar here
            break;
        }
        let refProjectMenu = "Add reference to which project's main notes file?\\n";
        projectList.forEach((p, i) => refProjectMenu += `  (${i + 1}) ${p}\\n`);
        refProjectMenu += "Enter number: ";
        const refChoiceIndex = parseInt(await this.ask(rl, refProjectMenu), 10) - 1;

        if (refChoiceIndex >= 0 && refChoiceIndex < projectList.length) {
          selectedProjectName = projectList[refChoiceIndex];
          // Reference appended to the main [projectName].md file
          const projectNotesFilePath = path.join(this.projectsDirPath, selectedProjectName, `${selectedProjectName}.md`);
          const heading = await this.ask(rl, "Optional: Heading for this reference material (or leave blank for general notes): ");
          
          this.appendToMdFile(projectNotesFilePath, `${item.description} (Captured: ${item.timestamp || 'N/A'})`, heading ? `## ${heading}` : `## Reference Material`);
          this.archiveInboxItem(item);
          this.removeLineFromFile(this.inboxFilePath, item.rawText);
          console.log(`Item added as reference to project '${selectedProjectName}' in ${selectedProjectName}.md and archived.`);
          item.isProcessed = true;
        } else {
          console.log("Invalid project selection for reference.");
        }
        break;

      case 's': // Someday/Maybe
        this.appendToMdFile(this.somedayMaybeFilePath, `- [ ] ${item.description} (Captured: ${item.timestamp || 'N/A'})`);
        this.archiveInboxItem(item);
        this.removeLineFromFile(this.inboxFilePath, item.rawText);
        console.log("Item added to Someday/Maybe list and archived.");
        item.isProcessed = true;
        break;

      case 'w': // Waiting For
        const waitingDetails = await this.ask(rl, "Waiting for whom/what? (e.g., 'response from Bob'): ");
        this.appendToMdFile(this.waitingForFilePath, `- [ ] ${item.description} - Waiting For: ${waitingDetails} (Delegated/Requested: ${new Date().toISOString().split('T')[0]}, Captured: ${item.timestamp || 'N/A'})`);
        this.archiveInboxItem(item);
        this.removeLineFromFile(this.inboxFilePath, item.rawText);
        console.log("Item added to Waiting For list and archived.");
        item.isProcessed = true;
        break;
      
      case 'c': // Calendar
        const scheduleInput = await this.ask(rl, "When to schedule? (e.g., 'tomorrow 3pm for 1 hour', 'next Friday 10am to 11:30am', 'Dec 25th 9am-5pm'). Details for event (optional): ");
        
        if (this.calendarService) {
          this.logMsg(LogLevel.INFO, `User input for scheduling: '${scheduleInput}' for item '${item.description}'.`);

          const now = new Date();
          const parsedResults = chrono.parse(scheduleInput, now, { forwardDate: true });

          if (parsedResults.length === 0) {
            console.log("Sorry, I couldn\'t understand the date/time. Please try a clearer format (e.g., 'tomorrow 3pm for 1 hour').");
            this.appendToMdFile(this.nextActionsFilePath, `- [ ] SCHEDULE (failed parse): ${this.prependContextIfNeeded(item.description)} (Captured: ${item.timestamp || 'N/A'})`);
            this.archiveInboxItem(item);
            this.removeLineFromFile(this.inboxFilePath, item.rawText);
            console.log("Item moved to Next Actions for manual scheduling and archived.");
            item.isProcessed = true;
            break;
          }

          const primaryResult = parsedResults[0];
          let startDateTime: Date | null = null;
          let endDateTime: Date | null = null;
          let eventTitle = item.description; // Default title
          
          // Extract details from the part of scheduleInput NOT parsed as date/time
          let eventDetailsFromInput = scheduleInput.replace(primaryResult.text, '').trim();

          // If the remaining text (eventDetailsFromInput) is substantial, consider it for the title.
          if (eventDetailsFromInput.length > 5 && eventDetailsFromInput.length > item.description.length / 2) { 
            eventTitle = eventDetailsFromInput; 
          }
          // Ensure eventDescriptionContent has meaningful details
          const eventDescriptionForCalendar = `Original Item: ${item.description}\nCaptured Timestamp: ${item.timestamp || 'N/A'}\nFull User Input: ${scheduleInput}${eventDetailsFromInput ? '\nUser Provided Details: ' + eventDetailsFromInput : ''}`;

          if (primaryResult.start) {
            startDateTime = primaryResult.start.date();
          }

          if (primaryResult.end) {
            endDateTime = primaryResult.end.date();
          } else if (startDateTime && (primaryResult.start as any).knownValues && (primaryResult.start as any).knownValues.hour != null && (primaryResult.start as any).knownValues.minute != null) {
            // If only start time is known (hour and minute), default to a 1-hour duration
            endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
            console.log("No end time specified or parsed, defaulting to a 1-hour duration.");
          }

          if (startDateTime && endDateTime && startDateTime < endDateTime) {
            const isoStartDateTime = startDateTime.toISOString();
            const isoEndDateTime = endDateTime.toISOString();

            console.log(`Attempting to create calendar event:`);
            console.log(`  Title: ${eventTitle}`);
            console.log(`  Start: ${isoStartDateTime}`);
            console.log(`  End: ${isoEndDateTime}`);
            console.log(`  Description: ${eventDescriptionForCalendar.split('\n')[0]}...`);

            try {
              const result = await this.calendarService.createEvent({
                summary: eventTitle,
                startDateTime: isoStartDateTime,
                endDateTime: isoEndDateTime,
                description: eventDescriptionForCalendar,
              });

              if (typeof result === 'string') { 
                this.logMsg(LogLevel.ERROR, `CalendarService reported an error: ${result}`);
                console.log(`Failed to create calendar event: ${result}.`);
                this.appendToMdFile(this.nextActionsFilePath, `- [ ] SCHEDULE (API Error): ${this.prependContextIfNeeded(item.description)} - ${result} (Captured: ${item.timestamp || 'N/A'})`);
                console.log("Item moved to Next Actions due to scheduling error.");
              } else { 
                this.logMsg(LogLevel.INFO, `CalendarService success. Event Data:`, { result });
                console.log("Calendar event created successfully!");
              }
              this.archiveInboxItem(item);
              this.removeLineFromFile(this.inboxFilePath, item.rawText);
              console.log("Original item archived.");
              item.isProcessed = true;

            } catch (e: any) {
              this.logMsg(LogLevel.ERROR, `Error calling CalendarService.createEvent`, { message: e.message, stack: e.stack });
              console.log("Error trying to schedule with CalendarService. Adding to Next Actions as fallback.");
              this.appendToMdFile(this.nextActionsFilePath, `- [ ] SCHEDULE (Exec Error): ${this.prependContextIfNeeded(item.description)} (Captured: ${item.timestamp || 'N/A'})`);
              this.archiveInboxItem(item);
              this.removeLineFromFile(this.inboxFilePath, item.rawText);
              console.log("Original item archived.");
              item.isProcessed = true;
            }
          } else {
            console.log("Could not determine a valid start and end time for the event. Please be more specific.");
            this.appendToMdFile(this.nextActionsFilePath, `- [ ] SCHEDULE (Parse Invalid): ${this.prependContextIfNeeded(item.description)} (Captured: ${item.timestamp || 'N/A'})`);
            this.archiveInboxItem(item);
            this.removeLineFromFile(this.inboxFilePath, item.rawText);
            console.log("Item moved to Next Actions for manual scheduling and archived.");
            item.isProcessed = true;
          }
        } else { 
            this.logMsg(LogLevel.WARN, `CalendarService not found. Appending to next_actions.md.`);
            console.log("CalendarService not available. Adding to Next Actions as a reminder to schedule.");
            this.appendToMdFile(this.nextActionsFilePath, `- [ ] SCHEDULE (no service): ${this.prependContextIfNeeded(item.description)} (Captured: ${item.timestamp || 'N/A'})`);
            this.archiveInboxItem(item);
            this.removeLineFromFile(this.inboxFilePath, item.rawText);
            console.log("Item added to Next Actions (to be scheduled) and archived.");
            item.isProcessed = true;
        }
        break;

      case 'e': // Edit
        console.log("Attempting to open item in $EDITOR...");
        const tempFilePath = this.getFullPath(path.join(this.archiveDirPath, `temp_inbox_edit_${Date.now()}.md`));
        fs.writeFileSync(tempFilePath, item.rawText, 'utf-8');
        try {
          execSync(`$EDITOR "${tempFilePath}"`, { stdio: 'inherit' });
          const updatedContent = fs.readFileSync(tempFilePath, 'utf-8').trim();
          fs.unlinkSync(tempFilePath); // Clean up temp file

          if (updatedContent !== item.rawText) {
            console.log("Content modified. Updating item.");
            // Update the main inbox file
            const inboxFullPath = this.getFullPath(this.inboxFilePath);
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
          this.logMsg(LogLevel.ERROR, "$EDITOR error", meta);
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
    if (mainReplManager) {
      mainReplManager.pauseInput();
      this.logMsg(LogLevel.INFO, "Main REPL paused for Sort Inbox session.");
    }
    this.logMsg(LogLevel.INFO, "Starting inbox sorting session...");
    const items = await this.readInboxItems();
    if (items.length === 0) {
      this.logMsg(LogLevel.INFO, "Inbox is empty. Nothing to sort.");
      console.log("Inbox is empty. Nothing to sort.");
      if (mainReplManager) mainReplManager.resumeInput();
      return;
    }

    console.log(`Found ${items.length} item(s) in the inbox.`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.isProcessed) continue; // Skip if already handled in this session (e.g. after 'skip')

        const shouldQuit = await this.processItem(item, rl);
        if (shouldQuit) {
          this.logMsg(LogLevel.INFO, "User chose to quit sorting session.");
          break; 
        }
        // If not quitting, mark as processed for this session and remove from original inbox file
        item.isProcessed = true; 
        this.removeLineFromFile(this.inboxFilePath, item.rawText);
      }
    } finally {
      rl.close();
      if (mainReplManager) {
        mainReplManager.resumeInput();
        this.logMsg(LogLevel.INFO, "Main REPL resumed after Sort Inbox session.");
      }
      this.logMsg(LogLevel.INFO, "Inbox sorting session finished.");
      console.log("Exiting Sort Inbox session.");
    }
  }

  getAgentTools?(): DynamicTool[] | StructuredTool[] {
    const sortInboxTool = new DynamicTool({
      name: "sortInboxInteractively",
      description: "Starts an interactive session to process items in the inbox.md file. Each item can be converted to a next action, scheduled, delegated, archived, or deleted.",
      func: async () => {
        try {
          // Ensure mainReplManager is available
          if (!mainReplManager) {
            const msg = "Main REPL manager is not available. Cannot run interactive inbox sorting.";
            this.logMsg(LogLevel.ERROR, msg);
            return msg;
          }
          await this.sortInbox(); // Call the existing sortInbox method
          return "Interactive inbox sorting session completed.";
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, "Error during interactive inbox sorting tool execution.", { error: error.message, stack: error.stack });
          return "Error during interactive inbox sorting: " + error.message;
        }
      },
    });

    const addWaitingForItemTool = new DynamicTool({
      name: "addWaitingForItem",
      description: "Adds an item to the 'Waiting For' list (waiting_for.md). This tool MUST be called with an object containing a single key: 'input'. The value for this 'input' key MUST be a JSON string. This JSON string ITSELF MUST represent an object with a required 'description' key (string: what you are waiting for) and an optional 'waitingFor' key (string: the person/entity you are waiting on). Example agent call: addWaitingForItemTool({ input: '{\"description\": \"feedback on proposal\", \"waitingFor\": \"Alice\"}' })",
      func: async (jsonInput: string) => {
        this.logMsg(LogLevel.DEBUG, "addWaitingForItemTool executed", { jsonInput });
        try {
          const { description, waitingFor } = JSON.parse(jsonInput);
          if (!description) {
            return "Error: description is required for addWaitingForItem.";
          }

          const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          let taskString = "- [ ] @Waiting ";
          if (waitingFor) {
            taskString += `${waitingFor} re: `;
          }
          taskString += `${description} (Logged: ${today})`;

          this.appendToMdFile(this.waitingForFilePath, taskString);
          this.logMsg(LogLevel.INFO, "Item added to waiting_for.md", { description, waitingFor });
          return `Added to Waiting For list: "${description}"` + (waitingFor ? ` (waiting for ${waitingFor})` : "");
        } catch (e: any) {
          this.logMsg(LogLevel.ERROR, "Error in addWaitingForItemTool", { error: e.message, jsonInput });
          return `Error adding waiting for item: ${e.message}`;
        }
      },
    });

    // New StructuredTool for viewWaitingForItems
    const viewWaitingForItemsSchema = z.object({});
    class ViewWaitingForItemsTool extends StructuredTool<typeof viewWaitingForItemsSchema> {
      name = "viewWaitingForItems";
      description = "Reads and displays the content of the global 'waiting_for.md' file. This tool requires no parameters.";
      schema = viewWaitingForItemsSchema;
      pluginInstance: SortInboxPluginDefinition;

      constructor(pluginInstance: SortInboxPluginDefinition) {
        super();
        this.pluginInstance = pluginInstance;
      }

      async _call(_args: z.infer<typeof this.schema>): Promise<string> {
        this.pluginInstance.logMsg(LogLevel.DEBUG, "viewWaitingForItemsTool executed", { _args });
        try {
          const fullPath = this.pluginInstance.getFullPath(this.pluginInstance.waitingForFilePath);
          if (!fs.existsSync(fullPath)) {
            this.pluginInstance.logMsg(LogLevel.INFO, `Waiting For file not found at ${fullPath}.`);
            return "The waiting_for.md file does not exist or is empty.";
          }
          const fileContent = fs.readFileSync(fullPath, 'utf-8');
          if (!fileContent.trim()) {
            return "The waiting_for.md file is empty.";
          }
          return `Contents of waiting_for.md:\n---\n${fileContent.trim()}`;
        } catch (e: any) {
          this.pluginInstance.logMsg(LogLevel.ERROR, "Error in viewWaitingForItemsTool", { error: e.message });
          return `Error reading waiting_for.md: ${e.message}`;
        }
      }
    }
    const viewWaitingForItemsToolInstance = new ViewWaitingForItemsTool(this);

    // New StructuredTool for viewInboxItems
    const viewInboxItemsSchema = z.object({});
    class ViewInboxItemsTool extends StructuredTool<typeof viewInboxItemsSchema> {
      name = "viewInboxItems";
      description = "Reads and displays the content of the global 'inbox.md' file. This tool requires no parameters.";
      schema = viewInboxItemsSchema;
      pluginInstance: SortInboxPluginDefinition;

      constructor(pluginInstance: SortInboxPluginDefinition) {
        super();
        this.pluginInstance = pluginInstance;
      }

      async _call(_args: z.infer<typeof this.schema>): Promise<string> {
        this.pluginInstance.logMsg(LogLevel.DEBUG, "viewInboxItemsTool executed", { _args });
        try {
          const inboxItems = await this.pluginInstance.readInboxItems(); // Use existing method
          if (inboxItems.length === 0) {
            return "The inbox.md file is empty or does not exist.";
          }
          const itemLines = inboxItems.map(item => item.rawText);
          return `Contents of inbox.md:\n---\n${itemLines.join('\n')}`;
        } catch (e: any) {
          this.pluginInstance.logMsg(LogLevel.ERROR, "Error in viewInboxItemsTool", { error: e.message });
          return `Error reading inbox.md: ${e.message}`;
        }
      }
    }
    const viewInboxItemsToolInstance = new ViewInboxItemsTool(this);

    return [sortInboxTool, addWaitingForItemTool, viewWaitingForItemsToolInstance, viewInboxItemsToolInstance];
  }
}

export default SortInboxPluginDefinition; 