import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import { DynamicTool } from 'langchain/tools';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { TaskItem } from '../../types/task';
import { TaskParser } from '../../taskParser';
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
      const task = TaskParser.parse(line);
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

    // Apply Filtering
    if (filters) {
      if (filters.context) {
        const lc = filters.context.toLowerCase();
        tasks = tasks.filter(t => t.context && t.context.toLowerCase() === lc);
      }
      if (filters.project) {
        const lp = filters.project.toLowerCase();
        tasks = tasks.filter(t => t.project && t.project.toLowerCase() === lp);
      }
      if (filters.status) {
        if (filters.status === 'open') {
          tasks = tasks.filter(t => !t.isCompleted);
        } else if (filters.status === 'completed') {
          // readNextActionsFromFile currently only reads open tasks.
          // To support this, we'd need to read all tasks or have a separate completed tasks source.
          // For now, if 'completed' is requested, it will return an empty list from open tasks.
          tasks = tasks.filter(t => t.isCompleted); 
        }
        // 'all' status implies no filtering by completion status, which is default if not specified
      }
      if (filters.dueDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        if (filters.dueDate.toLowerCase() === 'today') {
          tasks = tasks.filter(t => {
            if (!t.dueDate) return false;
            const taskDueDate = new Date(t.dueDate);
            return taskDueDate.getTime() === today.getTime();
          });
        } else if (filters.dueDate.toLowerCase() === 'tomorrow') {
          tasks = tasks.filter(t => {
            if (!t.dueDate) return false;
            const taskDueDate = new Date(t.dueDate);
            return taskDueDate.getTime() === tomorrow.getTime();
          });
        } else { // Specific date YYYY-MM-DD
          tasks = tasks.filter(t => t.dueDate === filters.dueDate);
        }
      }
    }

    // Apply Sorting
    if (sortOptions && sortOptions.sortBy && sortOptions.sortBy !== 'fileOrder') {
      tasks.sort((a, b) => {
        let valA: any, valB: any;
        switch (sortOptions.sortBy) {
          case 'dueDate':
            // Handle cases where dueDate might be null or undefined for robust sorting
            valA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            valB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            break;
          case 'project':
            valA = a.project?.toLowerCase() || '';
            valB = b.project?.toLowerCase() || '';
            break;
          case 'context':
            valA = a.context?.toLowerCase() || '';
            valB = b.context?.toLowerCase() || '';
            break;
          default:
            return 0; // Should not happen if sortBy is validated
        }

        if (valA < valB) {
          return sortOptions.sortOrder === 'desc' ? 1 : -1;
        }
        if (valA > valB) {
          return sortOptions.sortOrder === 'desc' ? -1 : 1;
        }
        return 0;
      });
    }
    // Default sort is 'fileOrder' (original order from file), which is already the case.

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
      id: parsedForDesc.id, // Use ID from the parsed structure (which will be a new UUID for new tasks)
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
      // We need to decide if line number identification is still desired or if we exclusively use IDs.
      // For now, keeping it, but it might be less reliable if tasks are frequently reordered without re-reading.
      // Preferring ID-based lookup for robustness.
      const tasks = await this.readNextActionsFromFile(); // Re-read to get current numbering if identifier is number
      if (identifier > 0 && identifier <= tasks.length) {
        taskIndex = identifier - 1;
        taskToComplete = tasks[taskIndex];
      }
    } else {
      // ID or description fragment based search
      const tasks = await this.readNextActionsFromFile(); // Ensure we have IDs for all tasks
      taskIndex = tasks.findIndex(t => t.id === identifier || t.description.toLowerCase().includes(identifier.toLowerCase()));
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

  public async editTask(identifier: string, updates: Partial<TaskItem>): Promise<TaskItem | null> {
    const tasks = await this.readNextActionsFromFile();
    const taskIndex = tasks.findIndex(t => t.id === identifier);

    if (taskIndex === -1) {
      core.log(LogLevel.WARN, `NextActionsPlugin: editTask - Task with ID "${identifier}" not found.`);
      return null;
    }

    // Merge updates into the found task
    // Important: Do not allow changing the ID via updates
    const originalTask = tasks[taskIndex];
    const { id, rawText, ...updatableFields } = updates; // Destructure to exclude id and rawText from direct update
    
    // If description is updated, other fields parsed from it (context, project, dueDate, additionalMetadata) might become stale
    // or might be intended to be replaced by explicit values in `updates`.
    // For simplicity, if `description` is part of `updates`, we should re-parse it to ensure consistency, 
    // then layer explicit `updates` for context, project, dueDate etc. on top.
    let updatedTaskFields: Partial<TaskItem> = { ...originalTask, ...updatableFields };

    if (updatableFields.description) {
        // If description changes, re-parse it to potentially update derived fields, then apply explicit updates.
        const tempRawForReparse = `- [ ] ${updatableFields.description}`;
        const parsedFromNewDesc = TaskParser.parse(tempRawForReparse);
        if (parsedFromNewDesc) {
            updatedTaskFields.description = parsedFromNewDesc.description; // Use re-parsed description
            updatedTaskFields.context = updatableFields.context ?? parsedFromNewDesc.context; // Prioritize explicit update
            updatedTaskFields.project = updatableFields.project ?? parsedFromNewDesc.project; // Prioritize explicit update
            updatedTaskFields.dueDate = updatableFields.dueDate ?? parsedFromNewDesc.dueDate; // Prioritize explicit update
            // Keep original capturedDate unless explicitly updated
            updatedTaskFields.capturedDate = updatableFields.capturedDate === undefined ? originalTask.capturedDate : updatableFields.capturedDate;
            // additionalMetadata from re-parse, unless explicitly updated
            updatedTaskFields.additionalMetadata = updatableFields.additionalMetadata === undefined ? parsedFromNewDesc.additionalMetadata : updatableFields.additionalMetadata;
        } else {
            // Fallback if new description is not parsable as a task body (should be rare)
            updatedTaskFields.description = updatableFields.description; 
        }
    }
    
    // Ensure all fields of TaskItem are present, carrying over from original if not in updatedTaskFields
    const finalUpdatedTask: TaskItem = {
        id: originalTask.id, // ID must not change
        rawText: '', // Will be regenerated by serialize
        description: updatedTaskFields.description || originalTask.description,
        isCompleted: typeof updatedTaskFields.isCompleted === 'boolean' ? updatedTaskFields.isCompleted : originalTask.isCompleted,
        context: updatedTaskFields.context !== undefined ? updatedTaskFields.context : originalTask.context,
        project: updatedTaskFields.project !== undefined ? updatedTaskFields.project : originalTask.project,
        dueDate: updatedTaskFields.dueDate !== undefined ? updatedTaskFields.dueDate : originalTask.dueDate,
        capturedDate: updatedTaskFields.capturedDate !== undefined ? updatedTaskFields.capturedDate : originalTask.capturedDate,
        completedDate: updatedTaskFields.completedDate !== undefined ? updatedTaskFields.completedDate : originalTask.completedDate,
        additionalMetadata: updatedTaskFields.additionalMetadata !== undefined ? updatedTaskFields.additionalMetadata : originalTask.additionalMetadata,
    };

    tasks[taskIndex] = finalUpdatedTask;
    await this.writeNextActionsToFile(tasks);
    core.log(LogLevel.INFO, `NextActionsPlugin: Task "${finalUpdatedTask.id}" updated.`);
    return finalUpdatedTask;
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
        description: "Displays the current list of tasks from your 'next_actions.md' file. Use this to see your upcoming tasks. This is different from sorting the inbox. Supports filtering and sorting via optional JSON input.",
        func: async (jsonInput?: string) => {
            let filters: NextActionFilters | undefined;
            let sortOptions: NextActionSortOptions | undefined;

            if (jsonInput) {
                try {
                    const parsedInput = JSON.parse(jsonInput);
                    // Basic validation: ensure parsedInput is an object before trying to destructure
                    if (typeof parsedInput === 'object' && parsedInput !== null) {
                        filters = parsedInput.filters; // Assuming filters and sortOptions are top-level keys
                        sortOptions = parsedInput.sortOptions;
                    } else {
                        core.log(LogLevel.WARN, "viewNextActionsTool: Invalid non-object JSON input provided.");
                        // Potentially return an error message or proceed with defaults
                    }
                } catch (e) {
                    core.log(LogLevel.WARN, `viewNextActionsTool: Invalid JSON input for parsing: ${jsonInput}`, { parseError: String(e) });
                    return "Invalid JSON input for filtering/sorting next actions. Please provide valid JSON or no input for default view.";
                }
            }

            const tasks = await this.getTasks(filters, sortOptions);

            if (tasks.length === 0) {
                if (filters && Object.keys(filters).length > 0) {
                    return "No next actions match your criteria.";
                }
                return "You have no pending next actions.";
            }

            let responseLines = ["Here are your next actions:"];
            tasks.forEach((task, index) => {
                const taskString = TaskParser.serialize(task);
                // Remove the ID part for display for a cleaner look
                const displayString = taskString.replace(/\s*\(id: [a-f0-9\-]+\)/i, '').trim();
                responseLines.push(`${index + 1}. ${displayString}`);
            });
            return responseLines.join('\n');
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
  private displayTasks(tasks: TaskItem[]): void {
    if (tasks.length === 0) {
      console.log("No next actions found.");
      return;
    }
    tasks.forEach((task, index) => {
      const taskString = TaskParser.serialize(task); // Get the full string representation
      // Remove the ID part for display if we want a cleaner look, but keep for full serialization
      const displayString = taskString.replace(/\s*\(id: [a-f0-9\-]+\)/i, ''); 
      console.log(`${index + 1}. ${displayString}`);
    });
  }

  public async runInteractiveSession(): Promise<void> {
    core.log(LogLevel.INFO, "NextActionsPlugin: Starting interactive session...");
    await mainReplManager.pauseInput();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'nextActions> ',
    });

    const displayHelp = () => {
      console.log("\nNext Actions Commands:");
      console.log("  l, list [filter_string]  - List tasks (e.g., l @home, l +projectX, l due:today)");
      console.log("  a, add <description>     - Add a new task");
      console.log("  d, done <task_#>         - Mark task as done by its number from the list");
      console.log("  e, edit <task_#>         - Edit a task by its number from the list (Not yet implemented)");
      console.log("  h, help                  - Show this help message");
      console.log("  q, quit                  - Quit interactive session");
      console.log("\n");
    };

    displayHelp();
    rl.prompt();

    // Store currently listed tasks for easy access by number for done/edit
    let S_currentListedTasks: TaskItem[] = []; 

    rl.on('line', async (line) => {
      const parts = line.trim().split(' ');
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      try {
        switch (command) {
          case 'l':
          case 'list':
            // Basic filter parsing: assume args join to a simple string for now
            // TODO: More sophisticated filter string parsing for getTasks
            const filterArg = args.join(' ');
            let filters: NextActionFilters | undefined;
            if (filterArg.startsWith('@')) filters = { context: filterArg };
            else if (filterArg.startsWith('+')) filters = { project: filterArg };
            else if (filterArg.startsWith('due:')) filters = { dueDate: filterArg.substring(4) };
            else if (filterArg) {
                console.log(`Unrecognized filter format: ${filterArg}. Listing all open tasks.`);
            }
            
            S_currentListedTasks = await this.getTasks(filters);
            this.displayTasks(S_currentListedTasks);
            break;
          case 'a':
          case 'add':
            if (args.length === 0) {
              console.log("Usage: add <description of the task>");
              break;
            }
            const description = args.join(' ');
            // For now, we won't parse context/project/due from the add command here.
            // The user can add them, and TaskParser will pick them up. 
            // Or they can edit the task later to add them explicitly.
            // The addTask method will handle default context if none is provided in the description.
            const newTask = await this.addTask(description);
            console.log("Task added:");
            this.displayTasks([newTask]); // Display just the added task
            // Optionally, re-list all tasks or just the new one with its number in the full list
            S_currentListedTasks = await this.getTasks(); // Refresh the main list for numbering consistency
            break;
          case 'd':
          case 'done':
            if (args.length !== 1) {
              console.log("Usage: done <task_number>");
              break;
            }
            const taskNumberDone = parseInt(args[0], 10);
            if (isNaN(taskNumberDone) || taskNumberDone <= 0 || taskNumberDone > S_currentListedTasks.length) {
              console.log(`Invalid task number. Please provide a number between 1 and ${S_currentListedTasks.length}.`);
              break;
            }
            const taskToComplete = S_currentListedTasks[taskNumberDone - 1];
            const completedTask = await this.completeTask(taskToComplete.id); // Use persistent ID
            if (completedTask) {
              console.log(`Task "${completedTask.description}" marked as done and archived.`);
            } else {
              console.log("Failed to mark task as done. It might have been already processed or an error occurred.");
            }
            S_currentListedTasks = await this.getTasks(); // Refresh the list
            this.displayTasks(S_currentListedTasks); // Display the updated list
            break;
          case 'e':
          case 'edit':
            console.log("Edit command not yet implemented.");
            break;
          case 'h':
          case 'help':
            displayHelp();
            break;
          case 'q':
          case 'quit':
            rl.close();
            return; // Exit before prompt
          default:
            console.log(`Unknown command: ${command}. Type 'help' for commands.`);
            break;
        }
      } catch (error: any) {
        core.log(LogLevel.ERROR, `Error in interactive command ${command}: ${error.message}`, error);
        console.error(`An error occurred: ${error.message}`);
      }
      rl.prompt();
    }).on('close', async () => {
      core.log(LogLevel.INFO, "NextActionsPlugin: Exiting interactive session.");
      await mainReplManager.resumeInput();
    });
  }
}

export default new NextActionsPluginDefinition(); 