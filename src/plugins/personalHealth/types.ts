import type { GetHealthLogLinesOptions as FileManagerLogLinesOptions } from './fileManager';

// Explicitly define GetHealthLogLinesOptions here for the service layer,
// possibly extending or aligning with FileManagerLogLinesOptions.
export interface GetHealthLogLinesOptions extends FileManagerLogLinesOptions {
  // No additional service-specific options for now, but structure allows it.
  // The `sort` option is inherited from FileManagerLogLinesOptions.
}

/**
 * Options for retrieving the latest health summary for review.
 */
export interface HealthSummaryOptions {
  /**
   * Number of recent lines to consider for the summary.
   * Defaults to a small number like 5 if not specified.
   */
  numberOfLines?: number;
  /**
   * Optional text to filter for lines containing this text 
   * (e.g., "workout", "run") before picking the latest ones.
   */
  containsText?: string;
  /**
   * Optional sort order for the lines before picking the summary.
   * Defaults to descending (newest first) if not specified by underlying getHealthEvents.
   */
  sort?: 'asc' | 'desc'; 
}

/**
 * Options for generating the health report.
 * (Currently empty, but provides a structure for future enhancements like date ranges.)
 */
export interface HealthReportOptions {
  // Example: targetDate?: string; // YYYY-MM-DD
  // Example: period?: 'daily' | 'weekly';
}

export interface PersonalHealthService {
  /**
   * Logs a new health-related event as a timestamped string (current time) to health.md.
   * @param text The free-form text describing the health event.
   */
  logHealthEvent(text: string): Promise<void>;

  /**
   * Retrieves health log entries from health.md.
   * @param options Filtering and sorting options.
   * @returns A promise that resolves to an array of log entry strings.
   */
  getHealthEvents(options?: GetHealthLogLinesOptions): Promise<string[]>;

  /**
   * Gets a summary of the latest health events, typically for the daily review.
   * This might involve fetching the last few lines or specific types of recent entries.
   * @param options Options to control how many lines or what type of text to look for, and sorting.
   * @returns A promise that resolves to a string summary or null if no relevant entries are found.
   */
  getLatestHealthSummaryForReview(options?: HealthSummaryOptions): Promise<string | null>;

  /**
   * Generates a structured, human-readable health report (e.g., health.md)
   * from the raw health event logs.
   * @param options Options to control the report generation (e.g., date range).
   * @returns A promise that resolves to a string indicating the outcome (e.g., path to the report or success message).
   */
  generateHealthReport(options?: HealthReportOptions): Promise<string>;
} 