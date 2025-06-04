import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { DynamicTool } from 'langchain/tools';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync } from 'child_process';
import { mainReplManager } from '../../index'; // Import mainReplManager
import * as chrono from 'chrono-node'; // Added for date parsing

let core: CoreServices;

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
  readonly name = "sortInbox";
  readonly version = "1.4.0"; // Version bump for calendar event creation
  readonly description = "Processes items from inbox.md with an interactive, detailed workflow, including calendar event creation.";

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

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    this.workspaceRoot = process.cwd(); // Assuming Wooster runs from project root
    core.log(LogLevel.INFO, `SortInboxPlugin (v${this.version}): Initializing...`);

    // Initialize paths from config or use defaults
    this.gtdBasePath = config.gtd?.basePath ?? DEFAULT_GTD_BASE_PATH;
    core.log(LogLevel.INFO, `SortInboxPlugin: Using GTD base path for core files: ${this.gtdBasePath}`);

    this.projectsDirPath = config.gtd?.projectsDir ?? DEFAULT_PROJECTS_DIR_PATH;
    core.log(LogLevel.INFO, `SortInboxPlugin: Using projects directory: ${this.projectsDirPath}`);

    this.archiveDirPath = config.gtd?.archiveDir ?? DEFAULT_ARCHIVE_DIR_PATH;
    core.log(LogLevel.INFO, `SortInboxPlugin: Using archive directory: ${this.archiveDirPath}`);
    
    // Specific file paths (typically within gtdBasePath, but could be overridden if needed in future by more specific config)
    this.inboxFilePath = config.gtd?.inboxPath ?? path.join(this.gtdBasePath, DEFAULT_INBOX_FILENAME);
    this.nextActionsFilePath = config.gtd?.nextActionsPath ?? path.join(this.gtdBasePath, DEFAULT_NEXT_ACTIONS_FILENAME);
    this.somedayMaybeFilePath = config.gtd?.somedayMaybePath ?? path.join(this.gtdBasePath, DEFAULT_SOMEDAY_MAYBE_FILENAME);
    this.waitingForFilePath = config.gtd?.waitingForPath ?? path.join(this.gtdBasePath, DEFAULT_WAITING_FOR_FILENAME);

    core.log(LogLevel.INFO, `SortInboxPlugin: Inbox file path: ${this.inboxFilePath}`);
    core.log(LogLevel.INFO, `SortInboxPlugin: Next Actions file path: ${this.nextActionsFilePath}`);
    core.log(LogLevel.INFO, `SortInboxPlugin: Someday/Maybe file path: ${this.somedayMaybeFilePath}`);
    core.log(LogLevel.INFO, `SortInboxPlugin: Waiting For file path: ${this.waitingForFilePath}`);

    this.ensureDirExists(this.getFullPath(this.gtdBasePath));
    this.ensureDirExists(this.getFullPath(this.projectsDirPath));
    this.ensureDirExists(this.getFullPath(this.archiveDirPath));

    // Attempt to get CalendarService
    this.calendarService = services.getService("CalendarService") as CalendarService | undefined;
    if (this.calendarService && typeof this.calendarService.createEvent === 'function') {
      core.log(LogLevel.INFO, "SortInboxPlugin: Successfully connected to CalendarService.");
    } else {
      this.calendarService = undefined; // Ensure it's undefined if not valid
      core.log(LogLevel.WARN, "SortInboxPlugin: CalendarService not found or is invalid. Calendar creation will be limited to next_actions.md.");
    }
  }

  async shutdown(): Promise<void> {
    core.log(LogLevel.INFO, `SortInboxPlugin (v${this.version}): Shutdown.`);
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
      core.log(LogLevel.INFO, `SortInboxPlugin: Created directory ${dirPath}`);
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
        core.log(LogLevel.WARN, `SortInboxPlugin: Projects directory ${projectsFullPath} does not exist. Returning empty list.`);
        return [];
      }
      return fs.readdirSync(projectsFullPath).filter(file => {
        const fullEntryPath = path.join(projectsFullPath, file);
        try {
          return fs.statSync(fullEntryPath).isDirectory();
        } catch (statError: any) {
          core.log(LogLevel.ERROR, `SortInboxPlugin: Error stating file ${fullEntryPath} in getProjectList.`, { message: statError.message });
          return false;
        }
      });
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
      core.log(LogLevel.ERROR, `SortInboxPlugin: Error reading or parsing ${this.inboxFilePath}.`, { error: error.message });
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
            const newProjectDir = path.join(this.projectsDirPath, newProjectName);
            this.ensureDirExists(this.getFullPath(newProjectDir));
            const projectFilePath = path.join(newProjectDir, `${newProjectName}.md`); // Main project file
            
            this.appendToMdFile(projectFilePath, `# Project: ${newProjectName}\n\n## Initial Item\n\n- [ ] ${item.description}\n`);

            console.log(`Project '${newProjectName}' created with item as initial task.`);
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
          core.log(LogLevel.INFO, `SortInbox (Calendar): User input for scheduling: '${scheduleInput}' for item '${item.description}'.`);

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
                core.log(LogLevel.ERROR, `SortInbox (Calendar): CalendarService reported an error: ${result}`);
                console.log(`Failed to create calendar event: ${result}.`);
                this.appendToMdFile(this.nextActionsFilePath, `- [ ] SCHEDULE (API Error): ${this.prependContextIfNeeded(item.description)} - ${result} (Captured: ${item.timestamp || 'N/A'})`);
                console.log("Item moved to Next Actions due to scheduling error.");
              } else { 
                core.log(LogLevel.INFO, `SortInbox (Calendar): CalendarService success. Event Data:`, { result });
                console.log("Calendar event created successfully!");
              }
              this.archiveInboxItem(item);
              this.removeLineFromFile(this.inboxFilePath, item.rawText);
              console.log("Original item archived.");
              item.isProcessed = true;

            } catch (e: any) {
              core.log(LogLevel.ERROR, `SortInbox (Calendar): Error calling CalendarService.createEvent`, { message: e.message, stack: e.stack });
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
            core.log(LogLevel.WARN, `SortInbox (Calendar): CalendarService not found. Appending to next_actions.md.`);
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
        console.clear(); // Clear if inbox is empty from the start
        console.log("Inbox is currently empty or all items are processed. 🎉");
      }
      return;
    }

    core.log(LogLevel.INFO, `SortInboxPlugin: Found ${items.length} items to process.`);
    if (process.stdout.isTTY && items.length > 0) { // Only log if there are items
      // Initial clear before first item, processItem will clear for subsequent items
      console.clear(); 
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
        if (process.stdout.isTTY) {
            console.clear(); // Final clear
        }
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