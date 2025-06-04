import { WoosterPlugin, AppConfig, CoreServices } from '../../types/plugin';
import { DynamicTool } from 'langchain/tools';
import { log, LogLevel } from '../../logger';
import { createNewProject } from '../../newProject'; // Utility to create project files

export class ProjectManagerPlugin implements WoosterPlugin {
  readonly name = 'projectManager';
  readonly version = '0.1.0';
  readonly description = 'Manages projects, including creation, listing, and setting active project (future).';

  private config!: AppConfig;
  // private services!: CoreServices; // Uncomment if core services are needed

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.config = config;
    // this.services = services; // Uncomment if core services are needed
    log(LogLevel.INFO, `ProjectManagerPlugin (v${this.version}): Initializing...`);

    if (!this.config.gtd || !this.config.gtd.projectsDir) {
      log(LogLevel.WARN, `ProjectManagerPlugin: GTD_PROJECTS_DIR is not configured. Project creation might fail or use defaults.`);
    }
    log(LogLevel.INFO, `ProjectManagerPlugin (v${this.version}): Initialized successfully.`);
  }

  async shutdown(): Promise<void> {
    log(LogLevel.INFO, `ProjectManagerPlugin (v${this.version}): Shutting down.`);
  }

  getAgentTools?(): DynamicTool[] {
    const createProjectTool = new DynamicTool({
      name: 'createProject',
      description: 'Creates a new project with the given name. Usage: createProject project_name',
      func: async (projectName: string) => {
        if (!projectName || typeof projectName !== 'string' || projectName.trim() === '') {
          return 'Error: Project name must be a non-empty string.';
        }

        log(LogLevel.INFO, `ProjectManagerPlugin: createProject tool called with project name: "${projectName}"`);

        try {
          const result = await createNewProject(projectName.trim(), this.config);
          if (result.success) {
            log(LogLevel.INFO, `ProjectManagerPlugin: Project "${projectName}" created successfully at ${result.projectFilePath}`);
            return result.message + (result.projectFilePath ? ` Path: ${result.projectFilePath}` : '');
          } else {
            log(LogLevel.WARN, `ProjectManagerPlugin: Failed to create project "${projectName}". Reason: ${result.message}`);
            return `Error creating project: ${result.message}`;
          }
        } catch (error: any) {
          log(LogLevel.ERROR, `ProjectManagerPlugin: Unexpected error in createProject tool for project "${projectName}"`, { error: error.message, stack: error.stack });
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