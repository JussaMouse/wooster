import { WoosterPlugin, AppConfig, CoreServices } from '../../types/plugin';
import { DynamicTool } from 'langchain/tools';
import { createNewProject } from '../../newProject'; // Utility to create project files
import { setActiveProjectInCore, SetActiveProjectResult } from '../../setActiveProject'; // Import new utility
import { LogLevel } from '../../logger'; // Keep for LogLevel enum
import * as fs from 'fs'; // Import fs for checking directory existence
import * as path from 'path'; // Import path for constructing paths

export class ProjectManagerPlugin implements WoosterPlugin {
  static readonly pluginName = 'projectManager'; // Renamed to avoid conflict with Function.name
  static readonly version = '0.1.1'; // Incremented version due to new tool and refactor
  static readonly description = 'Manages projects, including creation, opening, and setting active project.';

  // Instance properties for WoosterPlugin interface if it expects them on instance
  readonly name = ProjectManagerPlugin.pluginName;
  readonly version = ProjectManagerPlugin.version;
  readonly description = ProjectManagerPlugin.description;

  private config!: AppConfig;
  private services!: CoreServices; // Uncommented

  private logMsg(level: LogLevel, message: string, details?: object) {
    // Basic logger, assuming services might not be ready during early init or if something goes wrong
    const fullMessage = `[${ProjectManagerPlugin.pluginName} Plugin v${ProjectManagerPlugin.version}] ${message}`;
    if (this.services && this.services.log) {
      this.services.log(level, fullMessage, details);
    } else {
      console.log(`[${level.toUpperCase()}] ${fullMessage}`, details || '');
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.config = config;
    this.services = services; // Uncommented
    this.logMsg(LogLevel.INFO, 'Initializing...');

    if (!this.config.gtd || !this.config.gtd.projectsDir) {
      this.logMsg(LogLevel.WARN, 'GTD_PROJECTS_DIR is not configured. Project operations might fail or use defaults.');
    }
    this.logMsg(LogLevel.INFO, 'Initialized successfully.');
  }

  async shutdown(): Promise<void> {
    this.logMsg(LogLevel.INFO, 'Shutting down.');
  }

  getAgentTools?(): DynamicTool[] {
    const createProjectTool = new DynamicTool({
      name: 'createProject',
      description: 'Creates a new project with the given name and sets it as the active project. Usage: createProject project_name',
      func: async (projectName: string) => {
        if (!projectName || typeof projectName !== 'string' || projectName.trim() === '') {
          const errorMsg = 'Error: Project name must be a non-empty string.';
          this.logMsg(LogLevel.ERROR, `User error: ${errorMsg}`);
          return errorMsg;
        }
        const trimmedProjectName = projectName.trim();
        this.logMsg(LogLevel.INFO, `createProject tool called with project name: "${trimmedProjectName}"`);

        try {
          const createResult = await createNewProject(trimmedProjectName, this.config);
          if (createResult.success) {
            this.logMsg(LogLevel.INFO, `Project "${trimmedProjectName}" created successfully at ${createResult.projectFilePath}`);
            
            const setActiveResult = await setActiveProjectInCore(trimmedProjectName, this.services, this.logMsg.bind(this));
            this.logMsg(setActiveResult.success ? LogLevel.INFO : LogLevel.WARN, `User feedback: ${setActiveResult.messageForUser}`);

            return `${createResult.message} ${setActiveResult.messageForUser}` + (createResult.projectFilePath ? ` Path: ${createResult.projectFilePath}.` : '.');
          } else {
            this.logMsg(LogLevel.WARN, `Failed to create project "${trimmedProjectName}". Reason: ${createResult.message}`);
            this.logMsg(LogLevel.ERROR, `User error: Error creating project '${trimmedProjectName}': ${createResult.message}`);
            return `Error creating project: ${createResult.message}`;
          }
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, `Unexpected error in createProject tool for project "${trimmedProjectName}"`, { error: error.message, stack: error.stack });
          this.logMsg(LogLevel.ERROR, `User error: An unexpected error occurred while creating project '${trimmedProjectName}'.`);
          return 'Error: An unexpected error occurred while creating the project.';
        }
      },
    });

    const openProjectTool = new DynamicTool({
      name: 'openProject',
      description: 'Opens an existing project and sets it as the active project. Usage: openProject project_name',
      func: async (projectName: string) => {
        if (!projectName || typeof projectName !== 'string' || projectName.trim() === '') {
          const errorMsg = 'Error: Project name must be a non-empty string for opening.';
          this.logMsg(LogLevel.ERROR, `User error: ${errorMsg}`);
          return errorMsg;
        }
        const trimmedProjectName = projectName.trim();
        this.logMsg(LogLevel.INFO, `openProject tool called with project name: "${trimmedProjectName}"`);

        if (!this.config.gtd || !this.config.gtd.projectsDir) {
          const errorMsg = 'Error: GTD_PROJECTS_DIR is not configured. Cannot locate projects.';
          this.logMsg(LogLevel.ERROR, `Configuration error: ${errorMsg}`);
          return errorMsg;
        }

        const projectsBasePath = path.resolve(this.config.gtd.projectsDir);
        const projectDir = path.join(projectsBasePath, trimmedProjectName);

        if (!fs.existsSync(projectDir)) {
          const errorMsg = `Error: Project '${trimmedProjectName}' not found at ${projectDir}.`;
          this.logMsg(LogLevel.WARN, `User error: ${errorMsg}`);
          return errorMsg;
        }

        this.logMsg(LogLevel.INFO, `Project "${trimmedProjectName}" found at ${projectDir}. Attempting to set as active.`);
        const setActiveResult = await setActiveProjectInCore(trimmedProjectName, this.services, this.logMsg.bind(this));
        this.logMsg(setActiveResult.success ? LogLevel.INFO : LogLevel.WARN, `User feedback: ${setActiveResult.messageForUser}`);
        
        return setActiveResult.messageForUser; // Return the user-facing message directly to the agent/user
      },
    });

    return [createProjectTool, openProjectTool];
  }

  // Add other plugin methods if needed, e.g., for listing projects, setting active project, etc.
}

// Export the plugin class as the default export
export default ProjectManagerPlugin; 