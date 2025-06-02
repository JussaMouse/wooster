import fs from 'fs/promises';
import path from 'path';
import { AppConfig, CoreServices, WoosterPlugin } from '../../types/plugin';
import { NextActionItem, NextActionsService } from './types';
import { log, LogLevel } from '../../logger'; // Assuming a shared logger
import { z } from 'zod';
import { DynamicTool, StructuredTool } from '@langchain/core/tools';

const PROJECTS_DIR = path.join(__dirname, '../../../projects'); // Adjust as per your project structure
const ACTIONS_FILE_NAME = 'actions.txt';
const COMPLETED_ACTIONS_FILE_NAME = 'completed_actions.txt';

// --- Zod Schemas for Tools ---
const GetNextActionsListSchema = z.object({
  projectName: z.string().optional().describe("The specific project to list actions for. If omitted, lists aggregated actions from home and recent projects."),
});

const AddNextActionSchema = z.object({
  actionText: z.string().min(1, "Action text cannot be empty.").describe("The text content of the action."),
  projectName: z.string().optional().describe("The project to add the action to. Defaults to 'home'."),
});

const RemoveNextActionSchema = z.object({
  actionIndex: z.number().int().positive("Action index must be a positive integer.").describe("The 1-based index of the action to remove, as shown by 'get_next_actions_list'."),
  projectName: z.string().min(1, "Project name cannot be empty.").describe("The project from which to remove the action."),
});

const CompleteNextActionSchema = z.object({
  actionIndex: z.number().int().positive("Action index must be a positive integer.").describe("The 1-based index of the action to complete, as shown by 'get_next_actions_list'."),
  projectName: z.string().min(1, "Project name cannot be empty.").describe("The project where the action is located."),
});

// --- Tool Classes ---
class GetNextActionsListTool extends StructuredTool<typeof GetNextActionsListSchema> {
  name = "get_next_actions_list";
  description = "Lists next actions. Can list actions for a specific project or an aggregated list from home and recent projects.";
  schema = GetNextActionsListSchema;
  
  constructor(private plugin: NextActionsPluginDefinition) {
    super();
  }

  protected async _call({ projectName }: z.infer<typeof GetNextActionsListSchema>): Promise<string> {
    let actionsList: NextActionItem[];
    let header: string;

    if (projectName) {
      actionsList = await this.plugin.getProjectActions(projectName, true) as NextActionItem[];
      header = `Next Actions for project: ${projectName}`;
      if (actionsList.length === 0 || (actionsList.length === 1 && actionsList[0].action.trim() === '')) {
        return `${header}\n- No actions found for this project.`;
      }
    } else {
      actionsList = await this.plugin.getAggregatedActions(true);
      header = "Aggregated Next Actions (Home & Recent Projects)";
      if (actionsList.length === 0) {
        return `${header}\n- No actions found.`;
      }
    }

    const formattedActions = actionsList
      .filter(item => item.action.trim() !== '') // Filter out completely blank lines that might have slipped through
      .map(item => {
        const displayIndex = projectName ? item.originalIndex : item.displayIndex;
        return `- ${displayIndex}. [${item.project}] ${item.action}`;
      })
      .join('\n');
    
    return `${header}\n${formattedActions}`;
  }
}

class AddNextActionTool extends StructuredTool<typeof AddNextActionSchema> {
  name = "add_next_action";
  description = "Adds a new action to a project's next actions list.";
  schema = AddNextActionSchema;

  constructor(private plugin: NextActionsPluginDefinition) {
    super();
  }

  protected async _call({ actionText, projectName = 'home' }: z.infer<typeof AddNextActionSchema>): Promise<string> {
    try {
      await this.plugin.addAction(projectName, actionText);
      return `Action "${actionText}" added to project "${projectName}".`;
    } catch (error: any) {
      this.plugin.logMsg(LogLevel.ERROR, `Error adding action via tool: ${error.message}`, { error });
      return `Failed to add action to project "${projectName}". Error: ${error.message}`;
    }
  }
}

class RemoveNextActionTool extends StructuredTool<typeof RemoveNextActionSchema> {
  name = "remove_next_action";
  description = "Removes an action from a project's next actions list by its index.";
  schema = RemoveNextActionSchema;

  constructor(private plugin: NextActionsPluginDefinition) {
    super();
  }

  protected async _call({ actionIndex, projectName }: z.infer<typeof RemoveNextActionSchema>): Promise<string> {
    try {
      const removedAction = await this.plugin.removeAction(projectName, actionIndex);
      if (removedAction) {
        return `Action "${removedAction}" (index ${actionIndex}) removed from project "${projectName}".`;
      }
      return `Action at index ${actionIndex} not found in project "${projectName}". No action removed.`;
    } catch (error: any) {
      this.plugin.logMsg(LogLevel.ERROR, `Error removing action via tool: ${error.message}`, { error });
      return `Failed to remove action from project "${projectName}". Error: ${error.message}`;
    }
  }
}

class CompleteNextActionTool extends StructuredTool<typeof CompleteNextActionSchema> {
  name = "complete_next_action";
  description = "Marks an action as completed in a project. This moves it from the active list to a completed log.";
  schema = CompleteNextActionSchema;

  constructor(private plugin: NextActionsPluginDefinition) {
    super();
  }

  protected async _call({ actionIndex, projectName }: z.infer<typeof CompleteNextActionSchema>): Promise<string> {
    try {
      const completedAction = await this.plugin.completeAction(projectName, actionIndex);
      if (completedAction) {
        return `Action "${completedAction}" (index ${actionIndex}) from project "${projectName}" marked as completed.`;
      }
      return `Action at index ${actionIndex} not found in project "${projectName}". No action completed.`;
    } catch (error: any) {
      this.plugin.logMsg(LogLevel.ERROR, `Error completing action via tool: ${error.message}`, { error });
      return `Failed to complete action in project "${projectName}". Error: ${error.message}`;
    }
  }
}

class NextActionsPluginDefinition implements WoosterPlugin, NextActionsService {
    readonly name = "nextActions";
    readonly version = "1.0.0";
    readonly description = "Manages 'next actions' lists for projects, allowing users to add, remove, complete, and view actions.";

    private coreServices!: CoreServices;
    private appConfig!: AppConfig;
    private getNextActionsListToolInstance!: GetNextActionsListTool;
    private addNextActionToolInstance!: AddNextActionTool;
    private removeNextActionToolInstance!: RemoveNextActionTool;
    private completeNextActionToolInstance!: CompleteNextActionTool;

    public logMsg(level: LogLevel, message: string, metadata?: object) {
        const pluginName = '[NextActionsPlugin]';
        if (this.coreServices && this.coreServices.log) {
            this.coreServices.log(level, `${pluginName} ${message}`, metadata);
        } else {
            log(level, `${pluginName} ${message}`, metadata); // Fallback to global log
        }
    }

    // --- WoosterPlugin Implementation ---
    async initialize(config: AppConfig, services: CoreServices): Promise<void> {
        this.appConfig = config;
        this.coreServices = services;
        this.logMsg(LogLevel.INFO, `Initializing NextActionsPlugin (v${this.version})...`);
        
        // Register the service this plugin provides
        this.coreServices.registerService('NextActionsService', this);
        this.logMsg(LogLevel.INFO, 'NextActionsService registered.');

        // Instantiate tools
        this.getNextActionsListToolInstance = new GetNextActionsListTool(this);
        this.addNextActionToolInstance = new AddNextActionTool(this);
        this.removeNextActionToolInstance = new RemoveNextActionTool(this);
        this.completeNextActionToolInstance = new CompleteNextActionTool(this);
    }

    getAgentTools?(): any[] {
        const tools: any[] = [];
        if (this.getNextActionsListToolInstance) tools.push(this.getNextActionsListToolInstance);
        if (this.addNextActionToolInstance) tools.push(this.addNextActionToolInstance);
        if (this.removeNextActionToolInstance) tools.push(this.removeNextActionToolInstance);
        if (this.completeNextActionToolInstance) tools.push(this.completeNextActionToolInstance);
        return tools;
    }

    // --- Core Private Helper Methods for File Operations ---
    private _getProjectFilePath(projectName: string, fileName: string): string {
        return path.join(PROJECTS_DIR, projectName, fileName);
    }

    private async _readActions(projectName: string, fileName: string): Promise<string[]> {
        const filePath = this._getProjectFilePath(projectName, fileName);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return content.split('\n').map(action => action.trim()).filter(action => action.length > 0);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return []; // File not found, return empty array
            }
            this.logMsg(LogLevel.ERROR, `Error reading ${fileName} for project ${projectName}`, { error: error.message, filePath });
            throw error; // Re-throw for callers to handle if needed beyond logging
        }
    }

    private async _writeActions(projectName: string, fileName: string, actions: string[]): Promise<void> {
        const filePath = this._getProjectFilePath(projectName, fileName);
        try {
            // Ensure project directory exists
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            const content = actions.join('\n') + (actions.length > 0 ? '\n' : ''); // Ensure trailing newline if not empty
            await fs.writeFile(filePath, content, 'utf-8');
        } catch (error: any) {
            this.logMsg(LogLevel.ERROR, `Error writing ${fileName} for project ${projectName}`, { error: error.message, filePath });
            throw error;
        }
    }

    /**
     * Ensures actions.txt exists in the project. If not, creates it with a single blank line.
     * This makes it an "empty" list rather than non-existent, simplifying some logic.
     */
    private async _ensureProjectActionsFileExists(projectName: string): Promise<void> {
        const filePath = this._getProjectFilePath(projectName, ACTIONS_FILE_NAME);
        try {
            await fs.access(filePath);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.logMsg(LogLevel.INFO, `Actions file not found for ${projectName}, creating with a blank line.`, { filePath });
                await this._writeActions(projectName, ACTIONS_FILE_NAME, ['']); // Create with one blank line
            }
        }
    }

    // --- NextActionsService Implementation ---

    async addAction(projectName: string, actionText: string): Promise<void> {
        this.logMsg(LogLevel.INFO, `Adding action to ${projectName}: ${actionText}`);
        await this._ensureProjectActionsFileExists(projectName); // Important: Ensures file exists, potentially with a blank line
        const actions = await this._readActions(projectName, ACTIONS_FILE_NAME);

        // If the only action is a blank line (from _ensureProjectActionsFileExists), replace it.
        // Otherwise, add the new action.
        if (actions.length === 1 && actions[0].trim() === '') {
            actions[0] = actionText.trim();
        } else {
            actions.push(actionText.trim());
        }
        
        await this._writeActions(projectName, ACTIONS_FILE_NAME, actions.filter(a => a.length > 0)); // Filter out any accidental empty strings before writing
        this.logMsg(LogLevel.DEBUG, `Action added successfully to ${projectName}.`);
    }

    async getProjectActions(projectName: string, includeIndices: boolean = false): Promise<string[] | NextActionItem[]> {
        this.logMsg(LogLevel.DEBUG, `Service call: getProjectActions for ${projectName}, includeIndices: ${includeIndices}`);
        const actions = await this._readActions(projectName, ACTIONS_FILE_NAME);
        if (includeIndices) {
            return actions.map((action, idx) => ({
                project: projectName,
                action,
                originalIndex: idx + 1 // 1-based index
            }));
        }
        return actions;
    }

    async getAggregatedActions(includeDisplayIndices: boolean = false): Promise<NextActionItem[]> {
        this.logMsg(LogLevel.DEBUG, `Service call: getAggregatedActions, includeDisplayIndices: ${includeDisplayIndices}`);
        const aggregatedActions: NextActionItem[] = [];
        let displayIdxCounter = 1;

        // 1. Get actions from 'home' project
        try {
            const homeActions = await this._readActions('home', ACTIONS_FILE_NAME);
            homeActions.forEach((action, idx) => {
                const item: NextActionItem = {
                    project: 'home',
                    action,
                    originalIndex: idx + 1
                };
                if (includeDisplayIndices) item.displayIndex = displayIdxCounter++;
                aggregatedActions.push(item);
            });
        } catch (error) {
            this.logMsg(LogLevel.WARN, 'Error fetching actions for home project during aggregation.', { error });
        }

        // 2. Get 3 most recently touched other projects
        try {
            const allProjectFolders = (await fs.readdir(PROJECTS_DIR, { withFileTypes: true }))
                .filter(dirent => dirent.isDirectory() && dirent.name !== 'home')
                .map(dirent => dirent.name);

            const projectsWithMtimes: Array<{ name: string; mtime: number }> = [];
            for (const folderName of allProjectFolders) {
                // Check mtime of actions.txt or the project folder itself as a proxy for activity
                let mtimeMs = 0;
                try {
                    const stats = await fs.stat(this._getProjectFilePath(folderName, ACTIONS_FILE_NAME));
                    mtimeMs = stats.mtimeMs;
                } catch (e) { // actions.txt might not exist, try folder
                    try {
                        const folderStats = await fs.stat(path.join(PROJECTS_DIR, folderName));
                        mtimeMs = folderStats.mtimeMs;
                    } catch (folderError) {
                        this.logMsg(LogLevel.DEBUG, `Could not stat project folder ${folderName} for mtime.`, { folderError });
                        continue; // Skip if cannot determine mtime
                    }
                }
                projectsWithMtimes.push({ name: folderName, mtime: mtimeMs });
            }

            const sortedOtherProjects = projectsWithMtimes.sort((a, b) => b.mtime - a.mtime).slice(0, 3);

            for (const project of sortedOtherProjects) {
                const projectActions = await this._readActions(project.name, ACTIONS_FILE_NAME);
                projectActions.forEach((action, idx) => {
                    const item: NextActionItem = {
                        project: project.name,
                        action,
                        originalIndex: idx + 1
                    };
                    if (includeDisplayIndices) item.displayIndex = displayIdxCounter++;
                    aggregatedActions.push(item);
                });
            }
        } catch (error) {
            this.logMsg(LogLevel.ERROR, 'Error fetching or processing recent project actions for aggregation.', { error });
        }
        return aggregatedActions;
    }

    async removeAction(projectName: string, actionIndex: number): Promise<string | null> {
        this.logMsg(LogLevel.INFO, `Removing action from ${projectName}, 1-based index ${actionIndex}`);
        if (actionIndex <= 0) {
            this.logMsg(LogLevel.WARN, 'Attempted to remove action with invalid index (<=0).');
            return null; 
        }
        await this._ensureProjectActionsFileExists(projectName);
        const actions = await this._readActions(projectName, ACTIONS_FILE_NAME);
        const targetIndex = actionIndex - 1; // Convert to 0-based

        if (targetIndex >= 0 && targetIndex < actions.length) {
            const removedAction = actions.splice(targetIndex, 1)[0];
            // If actions list becomes empty, write a single blank line
            if (actions.length === 0) {
                await this._writeActions(projectName, ACTIONS_FILE_NAME, ['']);
            } else {
                await this._writeActions(projectName, ACTIONS_FILE_NAME, actions);
            }
            this.logMsg(LogLevel.DEBUG, `Action removed: "${removedAction}" from ${projectName}.`);
            return removedAction;
        }
        this.logMsg(LogLevel.WARN, `Action not found at index ${actionIndex} in ${projectName}. No action removed.`);
        return null;
    }

    async completeAction(projectName: string, actionIndex: number): Promise<string | null> {
        this.logMsg(LogLevel.INFO, `Completing action in ${projectName}, 1-based index ${actionIndex}`);
        if (actionIndex <= 0) {
            this.logMsg(LogLevel.WARN, 'Attempted to complete action with invalid index (<=0).');
            return null;
        }

        const removedActionText = await this.removeAction(projectName, actionIndex); // Leverage removeAction logic

        if (removedActionText) {
            const completedActions = await this._readActions(projectName, COMPLETED_ACTIONS_FILE_NAME);
            const timestamp = new Date().toISOString();
            completedActions.push(`[${timestamp}] ${removedActionText}`);
            await this._writeActions(projectName, COMPLETED_ACTIONS_FILE_NAME, completedActions);
            this.logMsg(LogLevel.DEBUG, `Action "${removedActionText}" marked as complete in ${projectName} and moved to ${COMPLETED_ACTIONS_FILE_NAME}.`);
            return removedActionText;
        }
        this.logMsg(LogLevel.WARN, `Action not found at index ${actionIndex} in ${projectName} for completion.`);
        return null;
    }
}

export default new NextActionsPluginDefinition(); 