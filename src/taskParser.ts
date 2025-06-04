import { TaskItem } from './types/task'; // Adjusted path
import crypto from 'crypto';

export class TaskParser {
  // Regex to capture the main parts of a task item line.
  // It aims to be flexible and capture known parts, leaving the core description.
  // 1: Checkbox part (e.g., "- [ ]" or "- [x]")
  // 2: The rest of the line after the checkbox.
  private static taskLineRegex = /^(?:-\s*\[\s*(x|\s)\]\s+)(.*)$/i;

  // Regexes for specific metadata components
  private static idRegex = /\(id:\s*([a-f0-9\-]+)\)/i; // Regex for (id: UUID)
  private static contextRegex = /(?:^|\s)(@\w+)/;
  private static projectRegex = /(?:^|\s)(\+[^@()]+?(?=\s(?:@|\(|\bdue:)|$))/;
  private static dueDateRegex = /due:(\d{4}-\d{2}-\d{2})\b/i;
  // More specific capture for dates, e.g., YYYY-MM-DD HH:MM:SS or YYYY-MM-DD
  private static capturedDateRegex = /\(Captured:\s*([^)]+)\)/i;
  private static completedDateRegex = /\(Completed:\s*([^)]+)\)/i;
  // Adjusted additionalMetadataRegex to NOT match (id:...), (Captured:...), or (Completed:...)
  private static additionalMetadataRegex = /\((?!id:|Captured:|Completed:)([^)]+)\)/i;


  public static parse(rawText: string): TaskItem | null {
    const lineMatch = rawText.match(this.taskLineRegex);
    if (!lineMatch) {
      return null;
    }

    const isCompleted = lineMatch[1].toLowerCase() === 'x';
    let descriptionContent = lineMatch[2].trim();

    let id: string | null = null;
    let context: string | null = null;
    let project: string | null = null;
    let dueDate: string | null = null;
    let capturedDate: string | null = null;
    let completedDate: string | null = null;
    let additionalMetadata: string | null = null;

    // Attempt to extract a persistent ID first
    const idMatch = descriptionContent.match(this.idRegex);
    if (idMatch) {
      id = idMatch[2]; // Group 2 is the UUID itself
      descriptionContent = descriptionContent.replace(this.idRegex, '').trim();
    }

    // Extract other metadata (context, project, dates, etc.)
    const contextMatch = descriptionContent.match(this.contextRegex);
    if (contextMatch) {
      context = contextMatch[1];
      descriptionContent = descriptionContent.replace(this.contextRegex, '').trim();
    }

    const projectMatch = descriptionContent.match(this.projectRegex);
    if (projectMatch) {
      project = projectMatch[1];
      descriptionContent = descriptionContent.replace(this.projectRegex, '').trim();
    }

    const dueDateMatch = descriptionContent.match(this.dueDateRegex);
    if (dueDateMatch) {
      dueDate = dueDateMatch[1];
      descriptionContent = descriptionContent.replace(this.dueDateRegex, '').trim();
    }

    const capturedDateMatch = descriptionContent.match(this.capturedDateRegex);
    if (capturedDateMatch) {
      capturedDate = capturedDateMatch[1].trim();
      descriptionContent = descriptionContent.replace(this.capturedDateRegex, '').trim();
    }

    const completedDateMatch = descriptionContent.match(this.completedDateRegex);
    if (completedDateMatch) {
      completedDate = completedDateMatch[1].trim();
      descriptionContent = descriptionContent.replace(this.completedDateRegex, '').trim();
    }
    
    const additionalMetadataMatch = descriptionContent.match(this.additionalMetadataRegex);
    if (additionalMetadataMatch) {
        additionalMetadata = additionalMetadataMatch[1].trim();
        descriptionContent = descriptionContent.replace(this.additionalMetadataRegex, '').trim();
    }

    descriptionContent = descriptionContent.replace(/\s\s+/g, ' ').trim();

    // If no ID was found in the string, generate a new one.
    if (!id) {
      id = crypto.randomUUID();
    }

    return {
      id,
      rawText,
      description: descriptionContent,
      isCompleted,
      context,
      project,
      dueDate,
      capturedDate,
      completedDate,
      additionalMetadata,
    };
  }

  // TODO: Implement serialize method
  public static serialize(task: TaskItem): string {
    let line = `- [${task.isCompleted ? 'x' : ' '}] `;
    let description = task.description;

    if (task.project) {
      description = `${task.project} ${description}`;
    }
    if (task.context) {
      description = `${task.context} ${description}`;
    }
    line += description.trim();

    if (task.dueDate) {
      line += ` due:${task.dueDate}`;
    }
    
    // Add other metadata, ensuring ID is distinct and last to avoid being caught by general additionalMetadata regex if it also uses parens
    if (task.capturedDate) {
      line += ` (Captured: ${task.capturedDate})`;
    }
    if (task.completedDate) {
      line += ` (Completed: ${task.completedDate})`;
    }
    if (task.additionalMetadata) {
        line += ` (${task.additionalMetadata})`; // General metadata first
    }
    
    line += ` (id: ${task.id})`; // Always add the persistent ID

    return line.replace(/\s\s+/g, ' ').trim();
  }
} 