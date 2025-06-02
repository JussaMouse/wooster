export interface NextActionItem {
  project: string;
  action: string;
  originalIndex?: number; // 1-based index within its original project file
  displayIndex?: number;  // 1-based index for aggregated lists shown to user
}

// Describes the service this plugin will provide to other plugins
export interface NextActionsService {
  /**
   * Gets all actions for a specific project.
   * @param projectName The name of the project.
   * @param includeIndices Whether to include originalIndex in the returned items.
   * @returns A promise that resolves to an array of action strings or NextActionItems.
   */
  getProjectActions(projectName: string, includeIndices?: boolean): Promise<string[] | NextActionItem[]>;

  /**
   * Gets an aggregated list of actions from 'home' and the 3 most recently modified projects.
   * @param includeDisplayIndices Whether to include displayIndex in the returned items for user interaction.
   * @returns A promise that resolves to an array of NextActionItems.
   */
  getAggregatedActions(includeDisplayIndices?: boolean): Promise<NextActionItem[]>;

  /**
   * Adds an action to the specified project.
   * @param projectName The name of the project.
   * @param actionText The text of the action to add.
   * @returns A promise that resolves when the action is added.
   */
  addAction(projectName: string, actionText: string): Promise<void>;

  /**
   * Removes an action from the specified project by its 1-based index.
   * @param projectName The name of the project.
   * @param actionIndex The 1-based index of the action to remove.
   * @returns A promise that resolves with the removed action text or null if not found/error.
   */
  removeAction(projectName: string, actionIndex: number): Promise<string | null>;

  /**
   * Marks an action as completed in the specified project by its 1-based index.
   * Typically moves it from actions.txt to completed_actions.txt with a timestamp.
   * @param projectName The name of the project.
   * @param actionIndex The 1-based index of the action to complete.
   * @returns A promise that resolves with the completed action text (as it was in actions.txt) or null if not found/error.
   */
  completeAction(projectName: string, actionIndex: number): Promise<string | null>;
} 