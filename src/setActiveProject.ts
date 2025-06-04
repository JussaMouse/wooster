import { CoreServices } from './types/plugin';
import { LogLevel } from './logger';

export interface SetActiveProjectResult {
  success: boolean;
  messageForLog: string; // Detailed message for logging
  messageForUser: string;  // Concise message for user feedback
}

/**
 * Attempts to set the active project using a method on CoreServices.
 * @param projectName The name of the project to set as active.
 * @param services The CoreServices instance.
 * @param log A logging function (e.g., plugin's this.logMsg or services.log).
 * @returns A promise that resolves with an object indicating success or failure and appropriate messages.
 */
export async function setActiveProjectInCore(
  projectName: string,
  services: CoreServices,
  log: (level: LogLevel, message: string, details?: object) => void
): Promise<SetActiveProjectResult> {
  if (!projectName || projectName.trim() === '') {
    const errorMsg = 'Project name cannot be empty when trying to set active project.';
    log(LogLevel.ERROR, `setActiveProjectInCore: ${errorMsg}`);
    return {
      success: false,
      messageForLog: errorMsg,
      messageForUser: 'Error: Project name was empty.',
    };
  }

  const trimmedProjectName = projectName.trim();

  try {
    // Directly call setActiveProject, as it's now a defined part of CoreServices
    await services.setActiveProject(trimmedProjectName);
    const successMsg = `Project '${trimmedProjectName}' is now the active project.`;
    log(LogLevel.INFO, `setActiveProjectInCore: Successfully set active project to "${trimmedProjectName}".`);
    return {
      success: true,
      messageForLog: `Successfully set active project to "${trimmedProjectName}".`,
      messageForUser: successMsg,
    };
  } catch (error: any) {
    // This will catch errors thrown by services.setActiveProject (e.g., project not found)
    const errorMsg = `Error attempting to set active project to "${trimmedProjectName}": ${error.message}`;
    log(LogLevel.ERROR, `setActiveProjectInCore: ${errorMsg}`, { name: error.name, stack: error.stack, details: error });
    return {
      success: false,
      messageForLog: errorMsg,
      messageForUser: error.message || `Error setting '${trimmedProjectName}' as active project.`,
      // It might be useful to pass a more specific user message if the error is known, e.g., project not found.
    };
  }
} 