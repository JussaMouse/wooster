// src/plugins/projectManager/renameProject.ts
import * as fs from 'fs';
import * as path from 'path';
import { CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';

// Assuming projectBasePath is consistently 'projects' relative to cwd
const projectBasePath = path.join(process.cwd(), 'projects');

export interface RenameProjectResult {
  success: boolean;
  message: string;
  oldName?: string;
  newName?: string;
}

export async function performRenameProject(
  currentName: string,
  newName: string,
  services: CoreServices,
  log: (level: LogLevel, message: string, metadata?: object) => void
): Promise<RenameProjectResult> {
  log(LogLevel.INFO, `Attempting to rename project "${currentName}" to "${newName}"`);

  if (!currentName || !newName || currentName.trim() === '' || newName.trim() === '') {
    return { success: false, message: "Error: Both current and new project names must be provided and non-empty." };
  }

  const trimmedCurrentName = currentName.trim();
  const trimmedNewName = newName.trim();

  if (trimmedCurrentName === trimmedNewName) {
    return { success: false, message: `Error: New project name "${trimmedNewName}" is the same as the current name.` };
  }

  const currentProjectPath = path.join(projectBasePath, trimmedCurrentName);
  const newProjectPath = path.join(projectBasePath, trimmedNewName);

  if (!fs.existsSync(currentProjectPath)) {
    return { success: false, message: `Error: Project "${trimmedCurrentName}" not found at ${currentProjectPath}.` };
  }

  if (fs.existsSync(newProjectPath)) {
    return { success: false, message: `Error: A project named "${trimmedNewName}" already exists at ${newProjectPath}. Cannot rename.` };
  }

  try {
    // Perform the file system rename
    await fs.promises.rename(currentProjectPath, newProjectPath);
    log(LogLevel.INFO, `Successfully renamed directory from "${currentProjectPath}" to "${newProjectPath}"`);

    // Now, update Wooster's core knowledge of the active project
    // services.setActiveProject will handle re-initializing the vector store from the new path.
    await services.setActiveProject(trimmedNewName);
    log(LogLevel.INFO, `Successfully set active project to "${trimmedNewName}" after rename.`);

    return {
      success: true,
      message: `Project "${trimmedCurrentName}" successfully renamed to "${trimmedNewName}" and is now the active project.`,
      oldName: trimmedCurrentName,
      newName: trimmedNewName,
    };

  } catch (error: any) {
    log(LogLevel.ERROR, `Error during project rename operation for "${trimmedCurrentName}" to "${trimmedNewName}": ${error.message}`, { error });
    return {
      success: false,
      message: `Error renaming project: ${error.message}. The project directory may or may not have been renamed. Please check the file system.`,
    };
  }
} 