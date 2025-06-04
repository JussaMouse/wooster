import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from './configLoader'; // Assuming AppConfig is available
import { log, LogLevel } from './logger'; // Correctly import named exports

interface CreateProjectResult {
  success: boolean;
  message: string;
  projectPath?: string;
  projectFilePath?: string;
}

/**
 * Creates a new project directory and a main project journal file.
 * @param projectName The name of the new project.
 * @param config The application configuration containing GTD_PROJECTS_DIR.
 * @returns A promise that resolves with an object indicating success or failure.
 */
export async function createNewProject(
  projectName: string,
  config: AppConfig
): Promise<CreateProjectResult> {
  if (!projectName || projectName.trim() === '') {
    return { success: false, message: 'Project name cannot be empty.' };
  }

  if (!config.gtd || !config.gtd.projectsDir) {
    log(LogLevel.ERROR, 'createNewProject: GTD_PROJECTS_DIR is not configured.');
    return { success: false, message: 'GTD_PROJECTS_DIR is not configured in AppConfig.' };
  }

  const projectsBasePath = path.resolve(config.gtd.projectsDir);
  const newProjectDir = path.join(projectsBasePath, projectName);
  const projectFilePath = path.join(newProjectDir, `${projectName}.md`);

  try {
    // Ensure the base projects directory exists
    if (!fs.existsSync(projectsBasePath)) {
      fs.mkdirSync(projectsBasePath, { recursive: true });
      log(LogLevel.INFO, `createNewProject: Base projects directory created at ${projectsBasePath}`);
    }

    // Check if project directory already exists
    if (fs.existsSync(newProjectDir)) {
      return {
        success: false,
        message: `Project '${projectName}' already exists at ${newProjectDir}.`,
        projectPath: newProjectDir,
        projectFilePath: fs.existsSync(projectFilePath) ? projectFilePath : undefined
      };
    }

    // Create the project directory
    fs.mkdirSync(newProjectDir, { recursive: true });
    log(LogLevel.INFO, `createNewProject: Project directory created at ${newProjectDir}`);

    // Create the main project journal file with some initial content
    const initialContent = `# Journal: ${projectName}\n\n## Overview\n\n\n## Tasks\n\n\n## Notes\n\n\n## Reference Material\n\n`;
    fs.writeFileSync(projectFilePath, initialContent);
    log(LogLevel.INFO, `createNewProject: Project journal file created at ${projectFilePath}`);

    return {
      success: true,
      message: `Project '${projectName}' created successfully.`,
      projectPath: newProjectDir,
      projectFilePath: projectFilePath,
    };
  } catch (error: any) {
    log(LogLevel.ERROR, `createNewProject: Error creating project '${projectName}'`, { error: error.message, stack: error.stack });
    return {
      success: false,
      message: `Error creating project '${projectName}': ${error.message}`,
    };
  }
}

// Example basic AppConfig structure for standalone testing (if needed)
// Adjust according to your actual AppConfig structure in configLoader.ts
/*
if (require.main === module) {
  // This block runs if the script is executed directly
  const mockConfig: AppConfig = {
    // ... other app config properties
    gtd: {
      basePath: 'gtd',
      inboxPath: 'gtd/inbox.md',
      projectsDir: 'projects', // Example projects directory
      archiveDir: 'logs/inboxArchive',
      nextActionsPath: 'gtd/next_actions.md',
      somedayMaybePath: 'gtd/someday_maybe.md',
      waitingForPath: 'gtd/waiting_for.md',
    },
    // ... other specific plugin configs
  } as AppConfig; // Type assertion might be needed depending on full AppConfig

  (async () => {
    const result1 = await createNewProject('Test Project Alpha', mockConfig);
    console.log(result1);

    const result2 = await createNewProject('Test Project Beta', mockConfig);
    console.log(result2);

    // Test existing project
    const result3 = await createNewProject('Test Project Alpha', mockConfig);
    console.log(result3);

    // Test empty project name
    const result4 = await createNewProject('', mockConfig);
    console.log(result4);

  })();
}
*/ 