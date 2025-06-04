import { WoosterPlugin, AppConfig, CoreServices } from '../../types/plugin';
import { DynamicTool } from 'langchain/tools';
import { createNewProject } from '../../newProject'; // Utility to create project files
import { LogLevel } from '../../logger'; // Keep for LogLevel enum

export class ProjectManagerPlugin implements WoosterPlugin {
  static readonly pluginName = 'projectManager'; // Renamed to avoid conflict with Function.name
  static readonly version = '0.1.0';
  static readonly description = 'Manages projects, including creation, listing, and setting active project (future).';

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
      this.logMsg(LogLevel.WARN, 'GTD_PROJECTS_DIR is not configured. Project creation might fail or use defaults.');
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
          const result = await createNewProject(trimmedProjectName, this.config);
          if (result.success) {
            this.logMsg(LogLevel.INFO, `Project "${trimmedProjectName}" created successfully at ${result.projectFilePath}`);
            
            let setActiveMessage = '';
            try {
              if (typeof (this.services as any).setActiveProject === 'function') {
                await (this.services as any).setActiveProject(trimmedProjectName);
                setActiveMessage = `Project '${trimmedProjectName}' is now the active project.`;
                this.logMsg(LogLevel.INFO, `User success: ${setActiveMessage}`);
              } else {
                setActiveMessage = `Project '${trimmedProjectName}' created. Active project management not fully available.`;
                this.logMsg(LogLevel.WARN, 'setActiveProject method not found on core services. User info: ' + setActiveMessage);
              }
            } catch (setActiveError: any) {
              setActiveMessage = `Project '${trimmedProjectName}' created, but failed to set as active: ${setActiveError.message}`;
              this.logMsg(LogLevel.ERROR, `Failed to set project "${trimmedProjectName}" as active. User warning: ${setActiveMessage}`, { error: setActiveError.message });
            }
            return result.message + (result.projectFilePath ? ` Path: ${result.projectFilePath}. ` : '. ') + setActiveMessage;
          } else {
            this.logMsg(LogLevel.WARN, `Failed to create project "${trimmedProjectName}". Reason: ${result.message}`);
            this.logMsg(LogLevel.ERROR, `User error: Error creating project '${trimmedProjectName}': ${result.message}`);
            return `Error creating project: ${result.message}`;
          }
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, `Unexpected error in createProject tool for project "${trimmedProjectName}"`, { error: error.message, stack: error.stack });
          this.logMsg(LogLevel.ERROR, `User error: An unexpected error occurred while creating project '${trimmedProjectName}'.`);
          return 'Error: An unexpected error occurred while creating the project.';
        }
      },
    });

    return [createProjectTool];
  }

  // Add other plugin methods if needed, e.g., for listing projects, setting active project, etc.
}

// Export the plugin class as the default export
export default ProjectManagerPlugin; 