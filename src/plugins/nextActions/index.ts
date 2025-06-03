import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { DynamicTool } from 'langchain/tools';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { TaskItem } from '../../types/task';
import { TaskParser } from '../../utils/taskParser';
import { mainReplManager } from '../../index'; // For interactive mode pausing
import crypto from 'crypto';

let core: CoreServices;

// Default file names, paths will be taken from config
const DEFAULT_NEXT_ACTIONS_FILENAME = 'next_actions.md';
const DEFAULT_ARCHIVE_DIR_PATH = './logs/inboxArchive/'; // Consistent with sortInbox

interface NextActionFilters {
  context?: string;
  project?: string;
  dueDate?: string; // e.g., 'today', 'tomorrow', 'YYYY-MM-DD'
  status?: 'all' | 'open' | 'completed'; // 'open' is default
}

interface NextActionSortOptions {
  sortBy?: 'fileOrder' | 'dueDate' | 'project' | 'context';
  sortOrder?: 'asc' | 'desc';
}

class NextActionsPluginDefinition implements WoosterPlugin {
  readonly name = "nextActions";
  readonly version = "0.1.0";
  readonly description = "Manages and processes the Next Actions list.";

  private workspaceRoot = '';
  private nextActionsFilePath!: string;
  private archiveDirPath!: string;

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    this.workspaceRoot = process.cwd();
    core.log(LogLevel.INFO, `NextActionsPlugin (v${this.version}): Initializing...`);

    const gtdConfig = config.gtd;
    this.nextActionsFilePath = gtdConfig?.nextActionsPath ?? path.join(gtdConfig?.basePath || './gtd/', DEFAULT_NEXT_ACTIONS_FILENAME);
    this.archiveDirPath = gtdConfig?.archiveDir ?? DEFAULT_ARCHIVE_DIR_PATH;

    core.log(LogLevel.INFO, `NextActionsPlugin: Using Next Actions file: ${this.nextActionsFilePath}`);
    core.log(LogLevel.INFO, `NextActionsPlugin: Using Archive directory: ${this.archiveDirPath}`);

    this.ensureDirExists(this.getFullPath(path.dirname(this.nextActionsFilePath)));
    this.ensureDirExists(this.getFullPath(this.archiveDirPath));
  }

  async shutdown(): Promise<void> {
    core.log(LogLevel.INFO, `NextActionsPlugin (v${this.version}): Shutdown.`);
  }

  private getFullPath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return path.join(this.workspaceRoot, relativePath);
  }

  private ensureDirExists(dirPath: string): void {
    const fullPath = this.getFullPath(dirPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      core.log(LogLevel.INFO, `NextActionsPlugin: Created directory ${fullPath}`);
    }
  }

  private async readNextActionsFromFile(): Promise<TaskItem[]> {
    const fullPath = this.getFullPath(this.nextActionsFilePath);
    if (!fs.existsSync(fullPath)) {
      core.log(LogLevel.INFO, `NextActionsPlugin: Next Actions file not found at ${fullPath}. Returning empty list.`);
      return [];
    }
    const fileContent = fs.readFileSync(fullPath, 'utf-8');
    const lines = fileContent.split('\n');
    const tasks: TaskItem[] = [];
    lines.forEach((line, index) => {
      if (line.trim() === '') return;
      const task = TaskParser.parse(line, index + 1);
      if (task && !task.isCompleted) { // Only load open tasks for the main list
        tasks.push(task);
      }
    });
    return tasks;
  }

  private async writeNextActionsToFile(tasks: TaskItem[]): Promise<void> {
    const fullPath = this.getFullPath(this.nextActionsFilePath);
    const lines = tasks.map(task => TaskParser.serialize(task));
    fs.writeFileSync(fullPath, lines.join('\n') + '\n', 'utf-8'); // Add trailing newline
  }
  
  private prependContextIfNeeded(description: string, context?: string | null): string {
    const contextRegex = /^@\w+/;
    if (context && contextRegex.test(description)) return description; // Context already in description via explicit parameter
    if (contextRegex.test(description)) return description; // Context already in description
    
    return `${context || '@home'} ${description}`;
  }

  // --- Core Logic Methods (to be implemented more fully) ---
  public async getTasks(filters?: NextActionFilters, sortOptions?: NextActionSortOptions): Promise<TaskItem[]> {
    let tasks = await this.readNextActionsFromFile();
    // TODO: Apply filtering
    // TODO: Apply sorting
    return tasks;
  }

  public async addTask(description: string, context?: string | null, project?: string | null, dueDate?: string | null): Promise<TaskItem> {
    const tasks = await this.readNextActionsFromFile();
    const now = new Date().toISOString().replace(/T.*/, ''); // YYYY-MM-DD for consistency with due date

    const processedDescription = this.prependContextIfNeeded(description, context);
    
    const newTaskItem: Partial<TaskItem> = {
        description: processedDescription, // Description will be the part after context/project
        isCompleted: false,
        capturedDate: now,
    };

    // Temporarily remove context/project from description if they were handled by prependContextIfNeeded
    let coreDesc = description;
    if (context) {
      const tempContextRegex = new RegExp(`^${context.replace('@', '@')}\s*`);
      coreDesc = coreDesc.replace(tempContextRegex, '').trim();
    }
    const projectOnlyInMeta = project && !coreDesc.includes(project);
    const contextOnlyInMeta = context && !coreDesc.includes(context);

    if (contextOnlyInMeta && context) newTaskItem.context = context;
    if (projectOnlyInMeta && project) newTaskItem.project = project;
    if (dueDate) newTaskItem.dueDate = dueDate;

    // Rebuild the primary description part for the TaskItem, ensuring context/project are there if provided
    let finalDescription = description;
    if (project && !finalDescription.startsWith(project) && !finalDescription.includes(project)) {
        finalDescription = project + ' ' + finalDescription;
    }
    if (context && !finalDescription.startsWith(context) && !finalDescription.includes(context)) {
        finalDescription = context + ' ' + finalDescription;
    }
    
    // The TaskParser.serialize will handle the final ordering of context/project in the string.
    // We need to ensure the TaskItem.description is just the core text part.
    // Let's parse the combined string once to get the core description correctly.
    let tempRawTask = `- [ ] ${finalDescription}`;
    if(dueDate) tempRawTask += ` due:${dueDate}`;
    tempRawTask += ` (Captured: ${now})`;

    const parsedForDesc = TaskParser.parse(tempRawTask);
    if (!parsedForDesc) throw new Error("Failed to create a valid task structure for parsing description.");

    const taskToAdd: TaskItem = {
      id: crypto.createHash('md5').update(tempRawTask).digest('hex'), // temp ID
      rawText: '', // Will be generated by serialize
      description: parsedForDesc.description,
      isCompleted: false,
      context: parsedForDesc.context,
      project: parsedForDesc.project,
      dueDate: parsedForDesc.dueDate,
      capturedDate: now,
    };
    
    tasks.push(taskToAdd);
    await this.writeNextActionsToFile(tasks);
    return taskToAdd; // Should return the fully formed TaskItem after serialization and re-parsing if needed for ID
  }

  public async completeTask(identifier: string | number): Promise<TaskItem | null> {
    const tasks = await this.readNextActionsFromFile();
    let taskToComplete: TaskItem | undefined;
    let taskIndex = -1;

    if (typeof identifier === 'number') {
      if (identifier > 0 && identifier <= tasks.length) {
        taskIndex = identifier - 1;
        taskToComplete = tasks[taskIndex];
      }
    } else {
      taskIndex = tasks.findIndex(t => t.description.toLowerCase().includes(identifier.toLowerCase()) || t.id === identifier);
      if (taskIndex !== -1) {
        taskToComplete = tasks[taskIndex];
      }
    }

    if (taskToComplete && taskIndex !== -1) {
      taskToComplete.isCompleted = true;
      taskToComplete.completedDate = new Date().toISOString().replace(/T.*/, ''); // YYYY-MM-DD
      // Archive it
      await this.archiveTask(taskToComplete);
      // Remove from active list
      tasks.splice(taskIndex, 1);
      await this.writeNextActionsToFile(tasks);
      return taskToComplete;
    }
    return null;
  }

  public async editTask(identifier: string | number, updates: Partial<TaskItem>): Promise<TaskItem | null> {
    // TODO: Implement edit logic
    // Find task, apply updates, re-serialize, write to file
    return null;
  }

  private async archiveTask(task: TaskItem): Promise<void> {
    this.ensureDirExists(this.archiveDirPath);
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+/, '');
    const safeDescription = (task.description || 'completed_task').substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const archiveFileName = `nextaction_${timestamp}_${safeDescription}.md`;
    const archiveFilePath = this.getFullPath(path.join(this.archiveDirPath, archiveFileName));
    
    // Use TaskParser.serialize to ensure consistent format, even for archived task
    const archivedTaskString = TaskParser.serialize(task); 

    const archiveContent = `---
SourceFile: ${this.nextActionsFilePath}
Archived: ${new Date().toISOString()}
---

${archivedTaskString}
`;
    fs.writeFileSync(archiveFilePath, archiveContent, 'utf-8');
    core.log(LogLevel.INFO, `NextActionsPlugin: Task '${task.description}' archived to ${archiveFilePath}`);
  }

  // --- Agent Tools ---
  getAgentTools?(): DynamicTool[] {
    const viewNextActionsTool = new DynamicTool({
        name: "viewNextActions",
        description: "Views the next actions list. Optional JSON input for filters (context, project, dueDate, status) and sortOptions (sortBy, sortOrder).",
        func: async (jsonInput?: string) => {
            // TODO: Parse jsonInput, call this.getTasks
            return JSON.stringify(await this.getTasks());
        },
    });

    const addNextActionTool = new DynamicTool({
        name: "addNextAction",
        description: "Adds a new next action. Input JSON: { description: string, context?: string, project?: string, dueDate?: string (YYYY-MM-DD) }",
        func: async (jsonInput: string) => {
            try {
                const { description, context, project, dueDate } = JSON.parse(jsonInput);
                if (!description) return "Error: description is required.";
                const addedTask = await this.addTask(description, context, project, dueDate);
                return `Task added: ${TaskParser.serialize(addedTask)}`;
            } catch (e: any) { return `Error adding task: ${e.message}`; }
        },
    });
    
    const completeNextActionTool = new DynamicTool({
        name: "completeNextAction",
        description: "Completes a next action. Input JSON: { identifier: string | number } where identifier is a unique phrase from task or line number (if recently viewed).",
        func: async (jsonInput: string) => {
            try {
                const { identifier } = JSON.parse(jsonInput);
                if (!identifier) return "Error: identifier is required.";
                const completed = await this.completeTask(identifier);
                return completed ? `Task completed: ${completed.description}` : "Task not found or already completed.";
            } catch (e: any) { return `Error completing task: ${e.message}`; }
        },
    });

    // TODO: Add editNextActionTool

    return [viewNextActionsTool, addNextActionTool, completeNextActionTool];
  }

  // --- Interactive Mode ---
  public async runInteractiveSession(): Promise<void> {
    core.log(LogLevel.INFO, "NextActionsPlugin: Starting interactive session...");
    // TODO: Implement readline interface loop for (l)ist, (a)dd, (d)one, (e)dit, (q)uit
    console.log("Interactive mode for Next Actions not yet implemented.");
    // Remember to call mainReplManager.pauseInput() / resumeInput()
  }
}

export default new NextActionsPluginDefinition(); 