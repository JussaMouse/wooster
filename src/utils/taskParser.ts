import { TaskItem } from '../types/task';
import crypto from 'crypto';

export class TaskParser {
  // Regex to capture the main parts of a task item line.
  // It aims to be flexible and capture known parts, leaving the core description.
  // 1: Checkbox part (e.g., "- [ ]" or "- [x]")
  // 2: The rest of the line after the checkbox.
  private static taskLineRegex = /^(?:-\s*\[\s*(x|\s)\]\s+)(.*)$/i;

  // Regexes for specific metadata components that can appear anywhere in the task string (after checkbox)
  private static contextRegex = /(?:^|\s)(@\w+)/;
  private static projectRegex = /(?:^|\s)(\+\w+)/;
  private static dueDateRegex = /due:(\d{4}-\d{2}-\d{2})\b/i;
  // More specific capture for dates, e.g., YYYY-MM-DD HH:MM:SS or YYYY-MM-DD
  private static capturedDateRegex = /\(Captured:\s*([^)]+)\)/i;
  private static completedDateRegex = /\(Completed:\s*([^)]+)\)/i;
  // Regex to find any other parenthesized metadata
  private static additionalMetadataRegex = /\((?!Captured:|Completed:)([^)]+)\)/i;


  public static parse(rawText: string, defaultLineNumber?: number): TaskItem | null {
    const lineMatch = rawText.match(this.taskLineRegex);
    if (!lineMatch) {
      return null;
    }

    const isCompleted = lineMatch[1].toLowerCase() === 'x';
    let descriptionContent = lineMatch[2].trim(); // This is the content after "- [ ] "

    let context: string | null = null;
    let project: string | null = null;
    let dueDate: string | null = null;
    let capturedDate: string | null = null;
    let completedDate: string | null = null;
    let additionalMetadata: string | null = null;

    // Extract and remove known metadata from descriptionContent
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

    // Clean up multiple spaces that might be left after removals
    descriptionContent = descriptionContent.replace(/\s\s+/g, ' ').trim();

    // Generate an ID. Using a hash of rawText for consistency if the line doesn't change.
    // If line number is provided and unique, it could also be part of an ID scheme.
    const id = defaultLineNumber ? `line-${defaultLineNumber}` : crypto.createHash('md5').update(rawText).digest('hex');

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
    // This will reconstruct the string from the TaskItem object, ensuring consistent formatting.
    let parts: string[] = [];

    // Start with checkbox and core description
    let line = `- [${task.isCompleted ? 'x' : ' '}] `;

    let description = task.description;

    // Prepend context and project to the description if they exist, to ensure they are at the start
    // This also helps if the original description didn't have them but they were added to the TaskItem
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

    if (task.capturedDate) {
      line += ` (Captured: ${task.capturedDate})`;
    }

    if (task.completedDate) {
      line += ` (Completed: ${task.completedDate})`;
    }
    
    if (task.additionalMetadata) {
        line += ` (${task.additionalMetadata})`;
    }

    return line.replace(/\s\s+/g, ' ').trim(); // Clean up any double spaces
  }
} 