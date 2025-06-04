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
    // Check if the setActiveProject method exists on the services object
    if (typeof (services as any).setActiveProject === 'function') {
      await (services as any).setActiveProject(trimmedProjectName);
      const successMsg = `Project '${trimmedProjectName}' is now the active project.`;
      log(LogLevel.INFO, `setActiveProjectInCore: Successfully set active project to "${trimmedProjectName}".`);
      return {
        success: true,
        messageForLog: `Successfully set active project to "${trimmedProjectName}".`,
        messageForUser: successMsg,
      };
    } else {
      const notAvailableMsg = `setActiveProject method not found on core services. Cannot set '${trimmedProjectName}' as active programmatically.`;
      log(LogLevel.WARN, `setActiveProjectInCore: ${notAvailableMsg}`);
      return {
        success: false,
        messageForLog: notAvailableMsg,
        messageForUser: `Project '${trimmedProjectName}' processed, but could not be set as active (feature not available).`,
      };
    }
  } catch (error: any) {
    const errorMsg = `Error attempting to set active project to "${trimmedProjectName}": ${error.message}`;
    log(LogLevel.ERROR, `setActiveProjectInCore: ${errorMsg}`, { error });
    return {
      success: false,
      messageForLog: errorMsg,
      messageForUser: `Error setting '${trimmedProjectName}' as active project.`,
    };
  }
} 