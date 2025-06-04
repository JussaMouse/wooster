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
  static readonly pluginName = "nextActions";
  static readonly version = "0.1.0";
  static readonly description = "Manages and processes the Next Actions list.";

  readonly name = NextActionsPluginDefinition.pluginName;
  readonly version = NextActionsPluginDefinition.version;
  readonly description = NextActionsPluginDefinition.description;

  private workspaceRoot = '';
  private nextActionsFilePath!: string;
  private archiveDirPath!: string;
  private coreServices!: CoreServices; // Renamed and properly typed

  private logMsg(level: LogLevel, message: string, metadata?: object) {
    if (this.coreServices && this.coreServices.log) {
      this.coreServices.log(level, `[${NextActionsPluginDefinition.pluginName} Plugin v${NextActionsPluginDefinition.version}] ${message}`, metadata);
    } else {
      console.log(`[${level}][${NextActionsPluginDefinition.pluginName} Plugin v${NextActionsPluginDefinition.version}] ${message}`, metadata || '');
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.coreServices = services; // Use instance member
    this.workspaceRoot = process.cwd();
    this.logMsg(LogLevel.INFO, `Initializing...`);

    const gtdConfig = config.gtd;
    this.nextActionsFilePath = gtdConfig?.nextActionsPath ?? path.join(gtdConfig?.basePath || './gtd/', DEFAULT_NEXT_ACTIONS_FILENAME);
    this.archiveDirPath = gtdConfig?.archiveDir ?? DEFAULT_ARCHIVE_DIR_PATH;

    this.logMsg(LogLevel.INFO, `Using Next Actions file: ${this.nextActionsFilePath}`);
    this.logMsg(LogLevel.INFO, `Using Archive directory: ${this.archiveDirPath}`);

    this.ensureDirExists(this.getFullPath(path.dirname(this.nextActionsFilePath)));
    this.ensureDirExists(this.getFullPath(this.archiveDirPath));
  }

  async shutdown(): Promise<void> {
    this.logMsg(LogLevel.INFO, `Shutdown.`);
  }

  private getFullPath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return path.join(this.workspaceRoot, relativePath);
  }

  private ensureDirExists(this: NextActionsPluginDefinition, fullPath: string): void {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      this.logMsg(LogLevel.INFO, `Created directory ${dir}`);
    }
  }

  private async readNextActionsFromFile(): Promise<TaskItem[]> {
    const fullPath = this.getFullPath(this.nextActionsFilePath);
    if (!fs.existsSync(fullPath)) {
      this.logMsg(LogLevel.INFO, `Next Actions file not found at ${fullPath}. Returning empty list.`);
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

  public async addTask(description: string, contextFromInput?: string | null, projectFromInput?: string | null, dueDate?: string | null): Promise<TaskItem> {
    const tasks = await this.readNextActionsFromFile();
    const now = new Date().toISOString().replace(/T.*/, ''); // YYYY-MM-DD

    let effectiveProject = projectFromInput;
    const effectiveContext = contextFromInput; // context isn't auto-populated by active project, so direct pass-through

    // Check if we should auto-append the active project
    // Ensure getActiveProjectName exists on coreServices before calling it
    const activeProjectName = (this.coreServices && typeof this.coreServices.getActiveProjectName === 'function') 
                              ? this.coreServices.getActiveProjectName() 
                              : null;
                              
    const descriptionAlreadyHasProject = /\s*\+\w+/.test(description);

    if (
      !projectFromInput &&             // User did not provide a project in the JSON input
      !descriptionAlreadyHasProject &&   // User did not type +project in the description
      activeProjectName &&               // Active project name exists
      activeProjectName.toLowerCase() !== 'home' // Active project is not 'home' (case-insensitive)
    ) {
      this.logMsg(LogLevel.DEBUG, `Auto-prepending active project '+${activeProjectName}' to new next action.`);
      effectiveProject = `+${activeProjectName}`; 
    }

    // Construct the initial task string parts. TaskParser will handle the final ordering.
    let taskStringParts: string[] = [description.trim()];

    if (effectiveProject) {
        // Avoid duplicating if already in description (e.g. user typed it and also provided in JSON)
        // A simple includes check might be too broad if project name is a substring of the description
        // However, TaskParser should ultimately handle normalization.
        if (!description.trim().includes(effectiveProject)) {
            taskStringParts.unshift(effectiveProject); // Prepend for TaskParser
        } else if (!description.trim().startsWith(effectiveProject)) {
             // If it includes it but doesn't start with it, TaskParser might misinterpret.
             // To be safe, if a project is effective, ensure it's at a parsable position if not already.
             // This part is tricky; relying on TaskParser's robustness is key.
             // For now, if it's included, we assume TaskParser will find it.
        }
    }
    if (effectiveContext) {
        // Avoid duplicating
        if (!description.trim().includes(effectiveContext)) {
            taskStringParts.unshift(effectiveContext); // Prepend for TaskParser
        }
    }
    
    let combinedDescription = taskStringParts.join(' ');

    // Add due date and captured date for parsing
    let rawTaskForParser = `- [ ] ${combinedDescription}`;
    if (dueDate) {
      rawTaskForParser += ` due:${dueDate}`;
    }
    rawTaskForParser += ` (Captured: ${now})`;

    const parsedTask = TaskParser.parse(rawTaskForParser);
    if (!parsedTask) {
      this.logMsg(LogLevel.ERROR, "Failed to parse the constructed task string in addTask.", { rawTaskForParser });
      // Fallback: add with minimal parsing if primary parsing fails
      const fallbackDescription = description.trim() + 
                                (projectFromInput ? ` ${projectFromInput}` : '') +
                                (contextFromInput ? ` ${contextFromInput}` : '') +
                                (dueDate ? ` due:${dueDate}` : '');
      const fallbackTask: TaskItem = {
          id: crypto.randomUUID(),
          rawText: `- [ ] ${fallbackDescription} (Captured: ${now})`,
          description: fallbackDescription,
          isCompleted: false,
          capturedDate: now,
      };
      tasks.push(fallbackTask);
      await this.writeNextActionsToFile(tasks);
      this.logMsg(LogLevel.WARN, "Task added with fallback parsing due to initial parsing error.", { taskId: fallbackTask.id });
      return fallbackTask;
    }

    // Create the TaskItem using values from the successfully parsed task
    const taskToAdd: TaskItem = {
      id: parsedTask.id, 
      rawText: '', 
      description: parsedTask.description, 
      isCompleted: false,
      context: parsedTask.context,
      project: parsedTask.project,
      dueDate: parsedTask.dueDate,
      capturedDate: parsedTask.capturedDate || now,
    };
    
    tasks.push(taskToAdd);
    await this.writeNextActionsToFile(tasks);
    this.logMsg(LogLevel.INFO, "Task added successfully via addTask method", { taskId: taskToAdd.id, description: taskToAdd.description, project: taskToAdd.project, context: taskToAdd.context });
    return taskToAdd;
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
      this.logMsg(LogLevel.INFO, "Task completed and archived", { taskId: taskToComplete.id });
      return taskToComplete;
    }
    this.logMsg(LogLevel.WARN, "Task not found or already completed for completion.", { identifier });
        return null;
    }

  public async editTask(identifier: string, updates: Partial<TaskItem>): Promise<TaskItem | null> {
    const tasks = await this.readNextActionsFromFile();
    const taskIndex = tasks.findIndex(t => t.id === identifier);

    if (taskIndex === -1) {
      this.logMsg(LogLevel.WARN, `editTask - Task with ID "${identifier}" not found.`);
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
    this.logMsg(LogLevel.INFO, `Task "${finalUpdatedTask.id}" updated.`);
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
    this.logMsg(LogLevel.INFO, `Task '${task.description}' archived to ${archiveFilePath}`);
  }

  // --- Agent Tools ---
  getAgentTools?(): DynamicTool[] {
    const viewNextActionsTool = new DynamicTool({
      name: "viewNextActions",
      description: "Views current next actions. This tool expects to be called with an object, which should contain a single key: 'input'. The value for the 'input' key must be a JSON string defining filters and/or sortOptions. To provide NO filters or sort options, the 'input' key's value should be an empty string (e.g., { input: '' }) or the 'input' key can be omitted entirely. The JSON string, if provided and not empty, should represent an object like: { filters?: NextActionFilters, sortOptions?: NextActionSortOptions }. Filters include context, project, dueDate ('today', 'tomorrow', 'YYYY-MM-DD'), status ('all', 'open', 'completed'). SortBy can be 'fileOrder', 'dueDate', 'project', 'context'. sortOrder can be 'asc' or 'desc'. Example for 'input' with filters: '{\"filters\": {\"context\": \"@work\"}}'. Example for 'input' with no options: ''",
      func: async (jsonInput?: string) => {
        this.logMsg(LogLevel.DEBUG, "viewNextActionsTool executed", { receivedRawInput: jsonInput });

        if (jsonInput !== undefined && typeof jsonInput !== 'string') {
          this.logMsg(LogLevel.ERROR, "viewNextActionsTool received non-string input when a string or undefined was expected.", { receivedInput: jsonInput });
          return "Error: Tool received invalid input type. Expected a JSON string or for the input to be undefined.";
        }

        try {
            let filters: NextActionFilters | undefined;
            let sortOptions: NextActionSortOptions | undefined;
            // Proceed to parse only if jsonInput is a non-empty string
            if (typeof jsonInput === 'string' && jsonInput.trim() !== "") {
                const input = JSON.parse(jsonInput);
                filters = input.filters;
                sortOptions = input.sortOptions;
            }
            // If jsonInput is undefined or an empty string, filters and sortOptions will remain undefined, which is the correct behavior for no options.

            const tasks = await this.getTasks(filters, sortOptions);
            if (tasks.length === 0) return "No next actions found matching criteria.";
            const responseLines: string[] = ["Current Next Actions:"];
            tasks.forEach((task, index) => {
                let line = `- [${task.isCompleted ? 'x' : ' '}] `;
                if (task.project) {
                    // Remove '+' from project name and add brackets
                    line += `[${task.project.substring(1)}] `;
                }
                if (task.context) {
                    line += `${task.context} `;
                }
                line += task.description;

                if (task.dueDate) {
                    line += ` due:${task.dueDate}`;
                }
                // Omitting (Captured: ...) and (id: ...) for this display output

                responseLines.push(`${index + 1}. ${line.trim()}`);
            });
            return responseLines.join('\n');
        } catch (e: any) {
            this.logMsg(LogLevel.ERROR, "Error in viewNextActionsTool", { error: e.message, receivedRawInput: jsonInput });
            return `Error processing request: ${e.message}`;
        }
      },
    });

    const addNextActionTool = new DynamicTool({
        name: "addNextAction",
        description: "Adds a new next action. This tool expects to be called with an object containing a single key: 'input'. The value for the 'input' key must be a JSON string. This JSON string should represent an object with the following keys: 'description' (string, required), and optional 'context' (string), 'project' (string), 'dueDate' (string, YYYY-MM-DD). Example of the JSON string that should be the value of 'input': '{\"description\": \"My new task\", \"context\": \"@home\"}'",
        func: async (jsonInput: string) => {
            this.logMsg(LogLevel.DEBUG, "addNextActionTool executed", { jsonInput });
            try {
                const { description, context, project, dueDate } = JSON.parse(jsonInput);
                if (!description) return "Error: description is required.";
                const addedTask = await this.addTask(description, context, project, dueDate);
                return `Task added: ${TaskParser.serialize(addedTask)}`;
            } catch (e: any) {
                this.logMsg(LogLevel.ERROR, "Error in addNextActionTool", { error: e.message, jsonInput });
                return `Error adding task: ${e.message}`;
            }
        },
    });
    
    const completeNextActionTool = new DynamicTool({
        name: "completeNextAction",
        description: "Completes a single next action. This tool MUST be called with an object containing a single key: 'input'. The value for this 'input' key MUST be a JSON string. This JSON string ITSELF MUST represent an object with a single key: 'identifier'. The value for 'identifier' (inside the JSON string) should be the unique task ID (string), a unique phrase from the task's description (string), or the task's line number (number, if recently viewed). For example, if completing task with ID '123', the agent must call the tool as: completeNextActionTool({ input: '{\"identifier\": \"123\"}' }). If completing task by line number 5, call as: completeNextActionTool({ input: '{\"identifier\": 5}' }). If by description 'Buy milk', call as: completeNextActionTool({ input: '{\"identifier\": \"Buy milk\"}' })",
        func: async (jsonInput: string) => {
            this.logMsg(LogLevel.DEBUG, "completeNextActionTool executed", { jsonInput });
            try {
                const { identifier } = JSON.parse(jsonInput);
                if (!identifier) return "Error: identifier is required.";
                const completed = await this.completeTask(identifier);
                const taskDescription = completed ? TaskParser.serialize(completed).replace(/\s*\(id: [a-f0-9\-]+\)/i, '').trim() : "Unknown task";
                return completed ? `Task completed: ${taskDescription}` : "Task not found or already completed.";
            } catch (e: any) {
                this.logMsg(LogLevel.ERROR, "Error in completeNextActionTool", { error: e.message, jsonInput });
                return `Error completing task: ${e.message}`;
            }
        },
    });

    const editNextActionTool = new DynamicTool({
      name: "editNextAction",
      description: "Edits an existing next action. This tool MUST be called with an object containing a single key: 'input'. The value for this 'input' key MUST be a JSON string. This JSON string ITSELF MUST represent an object containing two keys: 'identifier' (string, must be the task's unique ID) and 'updates' (an object with fields to change, e.g., description, context, project, dueDate, isCompleted). The task ID itself cannot be changed via the 'updates' object. Example agent call: editNextActionTool({ input: '{\"identifier\": \"task-uuid\", \"updates\": {\"description\": \"New description\", \"dueDate\": \"2025-01-01\"}}' })",
      func: async (jsonInput: string) => {
        this.logMsg(LogLevel.DEBUG, "editNextActionTool executed", { jsonInput });
        try {
          const { identifier, updates } = JSON.parse(jsonInput);
          if (!identifier) return "Error: task identifier (ID) is required.";
          if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
            return "Error: updates object is required and must not be empty.";
          }
          if (updates.id) return "Error: Task ID cannot be changed via updates.";

          const editedTask = await this.editTask(identifier, updates as Partial<TaskItem>);
          if (editedTask) {
            return `Task updated: ${TaskParser.serialize(editedTask)}`;
          } else {
            return "Error: Task not found or update failed.";
          }
        } catch (e: any) {
          this.logMsg(LogLevel.ERROR, "Error in editNextActionTool", { error: e.message, jsonInput });
          return `Error editing task: ${e.message}`;
        }
      },
    });

    return [viewNextActionsTool, addNextActionTool, completeNextActionTool, editNextActionTool];
  }

  // --- Interactive Mode ---
  // Keep S_currentListedTasks as a static or module-level variable if it needs to persist across calls within the interactive session outside of class instance context.
  // For now, assuming it's managed within the scope of runInteractiveSession or passed around if needed.
  // Let's make S_currentListedTasks an instance variable for better encapsulation if the interactive session is tied to an instance.
  private S_currentListedTasks: TaskItem[] = [];

  private displayTasks(tasks: TaskItem[]): void {
    if (tasks.length === 0) {
      console.log("No next actions found.");
      return;
    }
    this.logMsg(LogLevel.DEBUG, "Displaying tasks in interactive mode.", { count: tasks.length});
    tasks.forEach((task, index) => {
      const taskString = TaskParser.serialize(task); // Get the full string representation
      // Remove the ID part for display if we want a cleaner look, but keep for full serialization
      const displayString = taskString.replace(/\s*\(id: [a-f0-9\-]+\)/i, ''); 
      console.log(`${index + 1}. ${displayString}`);
    });
  }

  public async runInteractiveSession(): Promise<void> {
    this.logMsg(LogLevel.INFO, "Starting interactive session...");
    if (mainReplManager) {
      mainReplManager.pauseInput(); // Corrected method name
      this.logMsg(LogLevel.DEBUG, "Main REPL paused for interactive session.");
    }

    console.log("\nNext Actions Interactive Mode");
    console.log("-----------------------------");
    console.log("Available commands: list (l), add (a), done (d), edit (e), help (h), quit (q)");
    
    this.S_currentListedTasks = await this.getTasks({ status: 'open' }); // Load initial open tasks
    this.displayTasks(this.S_currentListedTasks);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'next> '
    });

    rl.prompt();

    const displayHelp = () => {
      console.log("\nCommands:");
      console.log("  list (l) [filter]      - List tasks. Optional filter: @context, +project, due:today/tomorrow/YYYY-MM-DD");
      console.log("  add (a) <description>  - Add a new task.");
      console.log("  done (d) <number>      - Mark task # from last 'list' as done.");
      console.log("  edit (e) <number>      - Edit task # from last 'list'. (Prompts for new description)");
      console.log("  help (h)               - Show this help message.");
      console.log("  quit (q)               - Exit interactive mode.");
    };

    rl.on('line', async (line) => {
      const parts = line.trim().split(' ');
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      try {
        switch (command) {
          case 'l':
          case 'list':
            const filterArg = args.join(' ');
            let filters: NextActionFilters | undefined = { status: 'open' }; // Default to open
            if (filterArg.startsWith('@')) filters = { context: filterArg, status: 'open' };
            else if (filterArg.startsWith('+')) filters = { project: filterArg, status: 'open' };
            else if (filterArg.toLowerCase().startsWith('due:')) filters = { dueDate: filterArg.substring(4), status: 'open' };
            else if (filterArg.toLowerCase() === 'all') filters = { status: 'all' };
            else if (filterArg.toLowerCase() === 'completed') filters = { status: 'completed' }; // Note: readNextActionsFromFile only gets open ones. This needs adjustment if we want to list completed from file.
            else if (filterArg) {
                this.logMsg(LogLevel.WARN, `Unrecognized filter format in interactive mode: ${filterArg}. Listing all open tasks.`);
            }
            
            this.S_currentListedTasks = await this.getTasks(filters);
            this.displayTasks(this.S_currentListedTasks);
            break;
          case 'a':
          case 'add':
            if (args.length === 0) {
              console.log("Usage: add <description of the task>");
              break;
            }
            const description = args.join(' ');
            const newTask = await this.addTask(description);
            this.logMsg(LogLevel.INFO, "Task added interactively.", { task: newTask.id });
            console.log("Task added:");
            // Display just the added task, then refresh S_currentListedTasks for correct numbering
            this.displayTasks([newTask]); 
            this.S_currentListedTasks = await this.getTasks({ status: 'open' });
            break;
          case 'd':
          case 'done':
            if (args.length !== 1) {
              console.log("Usage: done <task number from list>");
              break;
            }
            const taskNumberDone = parseInt(args[0], 10);
            if (isNaN(taskNumberDone) || taskNumberDone <= 0 || taskNumberDone > this.S_currentListedTasks.length) {
              console.log("Invalid task number.");
              break;
            }
            const taskToComplete = this.S_currentListedTasks[taskNumberDone - 1];
            if (taskToComplete) {
              await this.completeTask(taskToComplete.id); // Use ID for robustness
              console.log(`Task "${taskToComplete.description}" marked as done and archived.`);
              this.S_currentListedTasks = await this.getTasks({ status: 'open' }); // Refresh list
              this.displayTasks(this.S_currentListedTasks);
            } else {
              console.log("Task not found (should not happen if taskNumber is valid).");
            }
            break;
          case 'e':
          case 'edit':
            if (args.length !== 1) {
              console.log("Usage: edit <task number from list>");
              break;
            }
            const taskNumberEdit = parseInt(args[0], 10);
            if (isNaN(taskNumberEdit) || taskNumberEdit <= 0 || taskNumberEdit > this.S_currentListedTasks.length) {
              console.log("Invalid task number.");
              break;
            }
            const taskToEdit = this.S_currentListedTasks[taskNumberEdit - 1];
            if (taskToEdit) {
              // Store rl in a variable accessible by the callback to call prompt correctly
              const currentRl = rl; 
              currentRl.question(`Current: ${TaskParser.serialize(taskToEdit)}\nNew description (or press Enter to keep): `, async (newDescription) => {
                try { // Add try-catch within async callback
                  if (newDescription.trim() !== '') {
                    await this.editTask(taskToEdit.id, { description: newDescription.trim() });
                    console.log("Task updated.");
                  } else {
                    console.log("Edit cancelled or no change.");
                  }
                  this.S_currentListedTasks = await this.getTasks({ status: 'open' }); // Refresh
                  this.displayTasks(this.S_currentListedTasks);
                } catch (e: any) {
                  this.logMsg(LogLevel.ERROR, "Error during interactive task edit", { error: e.message });
                  console.error(`Error updating task: ${e.message}`);
                } finally {
                  currentRl.prompt(); // Call prompt here, after async op is done
                }
              });
            } else {
              console.log("Task not found.");
              rl.prompt(); // Ensure prompt is called if task not found
            }
            break;
          case 'h':
          case 'help':
            displayHelp();
            break;
          case 'q':
          case 'quit':
            rl.close();
            return; // Exit the handler
          default:
            console.log(`Unknown command: ${command}. Type 'h' for help.`);
        }
      } catch (error: any) {
        this.logMsg(LogLevel.ERROR, "Error in interactive command processing", { command, args, error: error.message });
        console.error(`Error: ${error.message}`);
      }
      if (command !== 'q') { // Avoid prompting again if quitting
        rl.prompt();
      }
    });

    rl.on('close', () => {
      this.logMsg(LogLevel.INFO, "Exiting interactive session.");
      if (mainReplManager) {
        mainReplManager.resumeInput(); // Corrected method name
        this.logMsg(LogLevel.DEBUG, "Main REPL resumed.");
      }
      // Resolve the promise when the session ends.
      // Consider if this needs to be linked to a promise returned by runInteractiveSession.
      // For now, it just signals the end of the readline interface.
    });
  }
}

export default NextActionsPluginDefinition; 