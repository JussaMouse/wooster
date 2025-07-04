import { WoosterPlugin, AppConfig, CoreServices } from '../../types/plugin';
import { DynamicTool } from 'langchain/tools';
import { createNewProject } from '../../newProject'; // Utility to create project files
import { setActiveProjectInCore, SetActiveProjectResult } from '../../setActiveProject'; // Import new utility
import { LogLevel } from '../../logger'; // Keep for LogLevel enum
import * as fs from 'fs'; // Import fs for checking directory existence
import * as path from 'path'; // Import path for constructing paths
import { performRenameProject, RenameProjectResult } from './renameProject'; // Import the new utility
// @ts-ignore: no type declarations for 'trash'
import trash from 'trash'; // Send deleted project to the OS trash/recycle bin

// Helper function to find a matching project name
function findMatchingProjectName(requestedName: string, actualProjectNames: string[]): string | string[] | null {
  if (actualProjectNames.includes(requestedName)) {
    return requestedName; // Exact match
  }

  const lowerRequestedName = requestedName.toLowerCase();
  const caseInsensitiveMatches = actualProjectNames.filter(name => name.toLowerCase() === lowerRequestedName);
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0]; // Single case-insensitive match
  }
  if (caseInsensitiveMatches.length > 1) {
    return caseInsensitiveMatches; // Multiple case-insensitive matches (ambiguous)
  }

  // Normalized matching (lowercase, remove spaces, hyphens, underscores)
  const normalize = (str: string) => str.toLowerCase().replace(/[-\s_]/g, '');
  const normalizedRequestedName = normalize(requestedName);
  
  const normalizedMatches = actualProjectNames.filter(name => normalize(name) === normalizedRequestedName);
  if (normalizedMatches.length === 1) {
    return normalizedMatches[0]; // Single normalized match
  }
  if (normalizedMatches.length > 1) {
    return normalizedMatches; // Multiple normalized matches (ambiguous)
  }
  
  return null; // No suitable match found
}

export class ProjectManagerPlugin implements WoosterPlugin {
  static readonly pluginName = 'projectManager';
  static readonly version = '0.1.8'; // Patch bump for deleteProject tool
  static readonly description = 'Manages projects: creating new projects (including a project journal), opening (with fuzzy matching), renaming, closing projects, deleting projects, listing projects, setting active project, and listing files in the active project.';

  readonly name = ProjectManagerPlugin.pluginName;
  readonly version = ProjectManagerPlugin.version;
  readonly description = ProjectManagerPlugin.description;

  private config!: AppConfig;
  private services!: CoreServices;
  // Holds the project pending deletion confirmation
  private pendingDeleteProject: { slug: string; humanName: string } | null = null;

  private logMsg(level: LogLevel, message: string, details?: object) {
    const fullMessage = `[${ProjectManagerPlugin.pluginName} Plugin v${ProjectManagerPlugin.version}] ${message}`;
    if (this.services && this.services.log) {
      this.services.log(level, fullMessage, details);
    } else {
      console.log(`[${level.toUpperCase()}] ${fullMessage}`, details || '');
    }
  }

  // Helper to determine where projects live
  private getProjectsBaseDir(): string {
    return this.config.gtd && this.config.gtd.projectsDir
      ? path.resolve(this.config.gtd.projectsDir)
      : path.join(process.cwd(), 'projects');
  }
  
  // Convert a slug (hyphens/underscores) into spaced, capitalized words
  private formatProjectName(slug: string): string {
    return slug
      .split(/[-_]/g)
      .map(token => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.config = config;
    this.services = services;
    this.logMsg(LogLevel.INFO, 'Initializing...');
    if (!this.config.gtd || !this.config.gtd.projectsDir) {
      this.logMsg(LogLevel.WARN, 'GTD_PROJECTS_DIR is not configured. Project operations might use defaults or fail if base project path is derived from it.');
    }
    this.logMsg(LogLevel.INFO, 'Initialized successfully.');
  }

  async shutdown(): Promise<void> {
    this.logMsg(LogLevel.INFO, 'Shutting down.');
  }

  getAgentTools?(): DynamicTool[] {
    const tools: DynamicTool[] = [];
    
    const createProjectTool = new DynamicTool({
      name: 'createProject',
      description: 'Creates a new project with the given name (which includes a project journal file) and attempts to set it as the active project. Usage: createProject project_name',
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
          if (createResult.success && createResult.projectSlug) {
            this.logMsg(LogLevel.INFO, `Project "${trimmedProjectName}" created successfully at ${createResult.projectFilePath}`);
            
            const setActiveResult = await setActiveProjectInCore(createResult.projectSlug, this.services, this.logMsg.bind(this));
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
    tools.push(createProjectTool);

    const openProjectTool = new DynamicTool({
      name: 'openProject',
      description: 'Opens an existing project and attempts to set it as the active project. Tries to match project name if not exact. Usage: openProject project_name',
      func: async (requestedProjectName: string) => {
        if (!requestedProjectName || typeof requestedProjectName !== 'string' || requestedProjectName.trim() === '') {
          const errorMsg = 'Error: Project name must be a non-empty string for opening.';
          this.logMsg(LogLevel.ERROR, `User error: ${errorMsg}`);
          return errorMsg;
        }
        const trimmedRequestedName = requestedProjectName.trim();
        this.logMsg(LogLevel.INFO, `openProject tool called with requested project name: "${trimmedRequestedName}"`);

        // Assuming projectBasePath is now defined in renameProject.ts or globally accessible
        // For consistency, let's define a base path for projects, e.g., from config or process.cwd()
        const projectsBaseDir = (this.config.gtd && this.config.gtd.projectsDir) ? path.resolve(this.config.gtd.projectsDir) : path.join(process.cwd(), 'projects');
        
        if (!fs.existsSync(projectsBaseDir)) {
             const errorMsg = `Error: Projects base directory '${projectsBaseDir}' not found. Cannot locate projects.`;
             this.logMsg(LogLevel.ERROR, `Configuration error: ${errorMsg}`);
             return errorMsg;
        }

        let actualProjectNames: string[];
        try {
          actualProjectNames = fs.readdirSync(projectsBaseDir).filter(name => 
            fs.statSync(path.join(projectsBaseDir, name)).isDirectory()
          );
        } catch (err: any) {
          this.logMsg(LogLevel.ERROR, `Error reading project directories from ${projectsBaseDir}: ${err.message}`);
          return `Error: Could not list project directories.`;
        }

        const matched = findMatchingProjectName(trimmedRequestedName, actualProjectNames);

        if (!matched) {
          const errorMsg = `Error: Project like '${trimmedRequestedName}' not found in ${projectsBaseDir}.`;
          this.logMsg(LogLevel.WARN, `User error: ${errorMsg}`);
          return errorMsg;
        }

        if (Array.isArray(matched)) {
          const ambiguousMsg = `Multiple projects match '${trimmedRequestedName}': ${matched.join(', ')}. Please be more specific.`;
          this.logMsg(LogLevel.WARN, `User info: ${ambiguousMsg}`);
          return ambiguousMsg;
        }

        const actualProjectName = matched;
        const projectDir = path.join(projectsBaseDir, actualProjectName);

        this.logMsg(LogLevel.INFO, `Project "${actualProjectName}" (matched from "${trimmedRequestedName}") found at ${projectDir}. Attempting to set as active.`);
        const setActiveResult = await setActiveProjectInCore(actualProjectName, this.services, this.logMsg.bind(this));
        this.logMsg(setActiveResult.success ? LogLevel.INFO : LogLevel.WARN, `User feedback: ${setActiveResult.messageForUser}`);
        
        return setActiveResult.messageForUser;
      },
    });
    tools.push(openProjectTool);

    const renameProjectTool = new DynamicTool({
      name: 'renameProject',
      description: `Renames an existing project. Input must be a JSON string with 'currentName' (the project to rename) and 'newName' (the desired new name). Example: {"currentName": "old-project-name", "newName": "new-project-name"}`,
      func: async (input: string): Promise<string> => {
        this.logMsg(LogLevel.INFO, `renameProject tool called with input: "${input}"`);
        let currentName: string;
        let newName: string;

        try {
          const parsedInput = JSON.parse(input);
          currentName = parsedInput.currentName;
          newName = parsedInput.newName;
          if (typeof currentName !== 'string' || typeof newName !== 'string' || !currentName.trim() || !newName.trim()) {
            throw new Error("Invalid input: 'currentName' and 'newName' must be non-empty strings.");
          }
        } catch (e: any) {
          const errorMessage = `Error: Invalid input format for renameProject. Expected JSON with "currentName" and "newName". Input received: ${input}. Details: ${e.message}`;
          this.logMsg(LogLevel.ERROR, errorMessage);
          return errorMessage;
        }
        
        if (!this.services) {
            const errorMsg = "Core services not available to renameProject tool.";
            this.logMsg(LogLevel.ERROR, errorMsg);
            return `Error: Core services not available. Cannot rename project.`;
        }

        const result: RenameProjectResult = await performRenameProject(
          currentName.trim(),
          newName.trim(),
          this.services,
          this.logMsg.bind(this)
        );
        return result.message;
      },
    });
    tools.push(renameProjectTool);

    const listFilesInActiveProjectTool = new DynamicTool({
      name: 'listFilesInActiveProject',
      description: 'Lists files and directories in the currently active project. Ignores common system files and the project\'s vector store. This tool takes no functional parameters. If the agent MUST provide an input object, it should use `{"input": ""}`; this input will be ignored by the tool.',
      func: async (args?: string | object) => {
        this.logMsg(LogLevel.INFO, `listFilesInActiveProject tool called. Received args (ignored):`, { args });
        if (!this.services || typeof this.services.getActiveProjectPath !== 'function') {
          const errorMsg = 'Error: Core services for getting active project path are not available.';
          this.logMsg(LogLevel.ERROR, errorMsg);
          return errorMsg;
        }

        const activeProjectPath = this.services.getActiveProjectPath();

        if (!activeProjectPath) {
          const infoMsg = 'No project is currently active. Please open or create a project first.';
          this.logMsg(LogLevel.INFO, infoMsg);
          return infoMsg;
        }

        try {
          // Check if path exists asynchronously
          await fs.promises.stat(activeProjectPath);

          const files = await fs.promises.readdir(activeProjectPath);
          const ignoredItems = ['.DS_Store', 'vectorStore', 'faiss.index', 'docstore.json'];
          const filteredFiles = files.filter(file => !ignoredItems.includes(file));

          if (filteredFiles.length === 0) {
            return `The active project directory "${path.basename(activeProjectPath)}" is empty or contains only ignored files.`;
          }

          return `Files in active project "${path.basename(activeProjectPath)}":\n${filteredFiles.join('\n')}`;
        } catch (error: any) {
          // Handle specific error for path not existing if stat fails for that reason
          if (error.code === 'ENOENT') {
            const errorMsg = `Error: Active project path does not exist: ${activeProjectPath}`;
            this.logMsg(LogLevel.ERROR, errorMsg);
            return errorMsg;
          }
          const errorMsg = `Error listing files in active project path ${activeProjectPath}: ${error.message}`;
          this.logMsg(LogLevel.ERROR, errorMsg, { stack: error.stack });
          return errorMsg;
        }
      },
    });
    tools.push(listFilesInActiveProjectTool);

    // Add a tool to close the active project by switching back to home
    const closeProjectTool = new DynamicTool({
      name: 'closeProject',
      description: 'Closes the current project and switches active project back to home. Usage: closeProject',
      func: async (_?: string | object) => {
        this.logMsg(LogLevel.INFO, 'closeProject tool called.');
        if (!this.services || typeof this.services.getActiveProjectName !== 'function') {
          const errMsg = 'Error: Core services for getting active project are not available.';
          this.logMsg(LogLevel.ERROR, errMsg);
          return errMsg;
        }
        const activeProject = this.services.getActiveProjectName();
        if (!activeProject || activeProject === 'home') {
          const infoMsg = 'Home project is already the active project.';
          this.logMsg(LogLevel.INFO, infoMsg);
          return infoMsg;
        }
        const result = await setActiveProjectInCore('home', this.services, this.logMsg.bind(this));
        this.logMsg(result.success ? LogLevel.INFO : LogLevel.WARN, `User feedback: ${result.messageForUser}`);
        return result.messageForUser;
      },
    });
    tools.push(closeProjectTool);

    // Tool to list all existing projects, de-slugified and capitalized
    const listProjectsTool = new DynamicTool({
      name: 'listProjects',
      description: 'Lists all existing projects with human-friendly names. Usage: listProjects',
      func: async (_?: string | object) => {
        this.logMsg(LogLevel.INFO, 'listProjects tool called.');
        const baseDir = this.getProjectsBaseDir();
        if (!fs.existsSync(baseDir)) {
          const err = `Error: Projects directory '${baseDir}' not found.`;
          this.logMsg(LogLevel.ERROR, err);
          return err;
        }
        let entries: string[];
        try {
          entries = fs.readdirSync(baseDir).filter(name => fs.statSync(path.join(baseDir, name)).isDirectory());
        } catch (e: any) {
          const err = `Error reading projects directory: ${e.message}`;
          this.logMsg(LogLevel.ERROR, err, { stack: e.stack });
          return err;
        }
        if (entries.length === 0) {
          const msg = `No projects found in '${baseDir}'.`;
          this.logMsg(LogLevel.INFO, msg);
          return msg;
        }
        const formatted = entries.map(slug => this.formatProjectName(slug));
        this.logMsg(LogLevel.INFO, `Found ${entries.length} projects.`);
        return `Projects:\n${formatted.join('\n')}`;
      }
    });
    tools.push(listProjectsTool);

    // Tool to delete a project by name, moving its folder to the OS trash after confirmation
    const deleteProjectTool = new DynamicTool({
      name: 'deleteProject',
      description: 'Deletes a project by name, moving it to the OS trash after confirmation. Usage: deleteProject {"projectName":"name","confirm":true}',
      func: async (input: string) => {
        this.logMsg(LogLevel.INFO, `deleteProject tool called with input: ${input}`);
        // Try JSON parse first
        let parsed: any;
        try {
          parsed = JSON.parse(input);
        } catch {
          parsed = null;
        }
        if (parsed && typeof parsed.projectName === 'string') {
          const projectName = parsed.projectName;
          const confirm = !!parsed.confirm;
          const baseDir = this.getProjectsBaseDir();
          if (!fs.existsSync(baseDir)) {
            const err = `Error: Projects directory '${baseDir}' not found.`;
            this.logMsg(LogLevel.ERROR, err);
            return err;
          }
          let allSlugs: string[];
          try {
            allSlugs = fs.readdirSync(baseDir).filter(name => fs.statSync(path.join(baseDir, name)).isDirectory());
          } catch (e: any) {
            const err = `Error reading projects directory: ${e.message}`;
            this.logMsg(LogLevel.ERROR, err, { stack: e.stack });
            return err;
          }
          const matched = findMatchingProjectName(projectName, allSlugs);
          if (!matched) {
            return `Error: Project like '${projectName}' not found.`;
          }
          if (Array.isArray(matched)) {
            const ambiguousMsg = `Multiple projects match '${projectName}': ${matched.join(', ')}. Please be more specific.`;
            this.logMsg(LogLevel.WARN, ambiguousMsg);
            return ambiguousMsg;
          }
          const projectSlug = matched;
          const humanName = this.formatProjectName(projectSlug);
          const target = path.join(baseDir, projectSlug);
          if (!confirm) {
            // Set pending and ask
            this.pendingDeleteProject = { slug: projectSlug, humanName };
            return `Are you sure you want to delete project '${humanName}'? Reply 'yes' to confirm.`;
          }
          // Confirmed path: delete
          this.pendingDeleteProject = null;
          try {
            await trash([target]);
            return `Project '${humanName}' deleted (moved to trash).`;
          } catch (e: any) {
            this.logMsg(LogLevel.ERROR, `Error deleting project '${projectSlug}'`, { error: e.message, stack: e.stack });
            return `Error deleting project: ${e.message}`;
          }
        }
        // Handle confirmation replies ('yes'/'y')
        const normalized = input.trim().toLowerCase();
        if (['yes','y'].includes(normalized) && this.pendingDeleteProject) {
          const { slug: projectSlug, humanName } = this.pendingDeleteProject;
          this.pendingDeleteProject = null;
          const target = path.join(this.getProjectsBaseDir(), projectSlug);
          try {
            await trash([target]);
            return `Project '${humanName}' deleted (moved to trash).`;
          } catch (e: any) {
            this.logMsg(LogLevel.ERROR, `Error deleting project '${projectSlug}'`, { error: e.message, stack: e.stack });
            return `Error deleting project: ${e.message}`;
          }
        }
        // Free-text delete request: fuzzy-match input and ask for confirmation
        const requestedName = input.trim();
        if (requestedName) {
          const baseDir = this.getProjectsBaseDir();
          if (!fs.existsSync(baseDir)) {
            const err = `Error: Projects directory '${baseDir}' not found.`;
            this.logMsg(LogLevel.ERROR, err);
            return err;
          }
          let allSlugs: string[];
          try {
            allSlugs = fs.readdirSync(baseDir).filter(name => fs.statSync(path.join(baseDir, name)).isDirectory());
          } catch (e: any) {
            const err = `Error reading projects directory: ${e.message}`;
            this.logMsg(LogLevel.ERROR, err, { stack: e.stack });
            return err;
          }
          const matched = findMatchingProjectName(requestedName, allSlugs);
          if (!matched) {
            return `Error: Project like '${requestedName}' not found.`;
          }
          if (Array.isArray(matched)) {
            const ambiguousMsg = `Multiple projects match '${requestedName}': ${matched.join(', ')}. Please be more specific.`;
            this.logMsg(LogLevel.WARN, ambiguousMsg);
            return ambiguousMsg;
          }
          const projectSlug = matched;
          const humanName = this.formatProjectName(projectSlug);
          this.pendingDeleteProject = { slug: projectSlug, humanName };
          return `Are you sure you want to delete project '${humanName}'? Reply 'yes' to confirm.`;
        }
        return 'Deletion not confirmed. To delete a project, provide a project name or reply "yes" when prompted.';
      }
    });
    tools.push(deleteProjectTool);

    return tools;
  }
}

export default ProjectManagerPlugin; 