import * as fs from 'fs/promises';
import * as path from 'path';
import { log, LogLevel } from '../../logger'; // Assuming logger is 2 levels up

const HEALTH_LOG_FILENAME = 'health_events.log.md';
let coreWorkspacePath: string | undefined = undefined;
let configuredHealthBaseDir: string = '.'; // Default to current directory relative to workspace path

/**
 * Sets the workspace path and the base directory for health files.
 * The plugin\'s initialize method should call this.
 */
export function setPaths(workspacePath: string, healthBaseDir?: string | null): void {
    coreWorkspacePath = workspacePath;
    if (healthBaseDir && healthBaseDir.trim() !== '') {
        configuredHealthBaseDir = healthBaseDir;
        log(LogLevel.INFO, `[PersonalHealthFileManager] Health base directory set to: ${healthBaseDir}`);
    } else {
        // Keep default '.' or explicitly set a plugin-level default if desired
        log(LogLevel.INFO, `[PersonalHealthFileManager] Health base directory using default relative to workspace: ${configuredHealthBaseDir}`);
    }
}

function getHealthLogPath(): string {
    if (!coreWorkspacePath) {
        log(LogLevel.WARN, `[PersonalHealthFileManager] Workspace path not set, defaulting to process.cwd() for health log. This might be incorrect.`);
        // Fallback to process.cwd() + configuredHealthBaseDir might be process.cwd()/./filename or process.cwd()/health/filename
        return path.join(process.cwd(), configuredHealthBaseDir, HEALTH_LOG_FILENAME);
    }
    return path.join(coreWorkspacePath, configuredHealthBaseDir, HEALTH_LOG_FILENAME);
}

/**
 * Appends a new event to the health.md file.
 * Each event is prefixed with the current YYYY-MM-DD HH:MM:SS local timestamp.
 * @param text The content of the health event.
 */
export async function appendHealthEvent(text: string): Promise<void> {
    const eventDate = new Date(); // Always use current date and time

    const year = eventDate.getFullYear();
    const month = String(eventDate.getMonth() + 1).padStart(2, '0');
    const day = String(eventDate.getDate()).padStart(2, '0');
    const hours = String(eventDate.getHours()).padStart(2, '0');
    const minutes = String(eventDate.getMinutes()).padStart(2, '0');
    const seconds = String(eventDate.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    const entry = `${timestamp} ${text.trim()}\n\n`;
    const filePath = getHealthLogPath();

    try {
        await fs.appendFile(filePath, entry, 'utf-8');
        log(LogLevel.INFO, `[PersonalHealthFileManager] Appended event to ${HEALTH_LOG_FILENAME}`, { entry });
    } catch (error: any) {
        log(LogLevel.ERROR, `[PersonalHealthFileManager] Error appending to ${HEALTH_LOG_FILENAME}`, { error: error.message, filePath });
        // Consider creating the file/directory if it doesn't exist, or re-throw
        if (error.code === 'ENOENT') {
            try {
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.appendFile(filePath, entry, 'utf-8');
                log(LogLevel.INFO, `[PersonalHealthFileManager] Created ${HEALTH_LOG_FILENAME} and appended event.`, { entry });
            } catch (creationError: any) {
                log(LogLevel.ERROR, `[PersonalHealthFileManager] Error creating ${HEALTH_LOG_FILENAME} after initial ENOENT`, { error: creationError.message, filePath });
                throw creationError; // Re-throw critical error
            }
        } else {
            throw error; // Re-throw other errors
        }
    }
}

export interface GetHealthLogLinesOptions {
    date?: string;          // YYYY-MM-DD to filter by a specific date
    startDate?: string;     // YYYY-MM-DD
    endDate?: string;       // YYYY-MM-DD
    limit?: number;         // Max number of lines to return (most recent)
    containsText?: string;  // Filter lines containing this text (case-insensitive)
    sort?: 'asc' | 'desc';  // New option for sorting
}

/**
 * Reads lines from health.md, with optional filtering and sorting.
 * Returns an array of strings, each representing a log entry.
 */
export async function getHealthLogLines(options: GetHealthLogLinesOptions = {}): Promise<string[]> {
    const filePath = getHealthLogPath();
    let lines: string[] = [];

    try {
        const data = await fs.readFile(filePath, 'utf-8');
        lines = data.split(/\n\n|\n(?=\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/).filter(line => line.trim() !== ''); // Split by double newline or newline followed by a timestamp
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            log(LogLevel.INFO, `[PersonalHealthFileManager] ${HEALTH_LOG_FILENAME} not found, returning empty array.`);
            return []; // File doesn't exist, so no entries
        }
        log(LogLevel.ERROR, `[PersonalHealthFileManager] Error reading ${HEALTH_LOG_FILENAME}`, { error: error.message, filePath });
        throw error;
    }

    if (options.date) {
        lines = lines.filter(line => line.startsWith(options.date!));
    } else if (options.startDate || options.endDate) {
        lines = lines.filter(line => {
            const lineDateStr = line.substring(0, 10); // YYYY-MM-DD
            if (options.startDate && lineDateStr < options.startDate) return false;
            if (options.endDate && lineDateStr > options.endDate) return false;
            return true;
        });
    }

    if (options.containsText) {
        const searchText = options.containsText.toLowerCase();
        lines = lines.filter(line => line.toLowerCase().includes(searchText));
    }

    // Sorting (new)
    if (options.sort) {
        lines.sort((a, b) => {
            // Extract full timestamp YYYY-MM-DD HH:MM:SS (first 19 chars)
            const timestampA = a.substring(0, 19);
            const timestampB = b.substring(0, 19);
            if (options.sort === 'asc') {
                return timestampA.localeCompare(timestampB);
            }
            return timestampB.localeCompare(timestampA); // desc
        });
    }

    // Limit after sorting and filtering
    if (options.limit && lines.length > options.limit) {
        if (options.sort === 'asc') {
             lines = lines.slice(-options.limit); // if ascending, limit gives the latest by date
        } else { 
            lines = lines.slice(0, options.limit); // if descending (or default), limit gives the first N (latest by date if sorted desc)
        }
    }

    return lines;
}

/**
 * Writes the provided content to the specified health report file (e.g., health.md).
 * This will overwrite the file if it already exists.
 * @param reportContent The string content to write to the report.
 * @param reportFilePath The full path to the report file.
 */
export async function writeHealthReport(reportContent: string, reportFilePath: string): Promise<void> {
    try {
        // Ensure the directory exists, creating it if necessary.
        // This is important if reportFilePath might be in a non-existent directory (e.g. first run).
        const dir = path.dirname(reportFilePath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(reportFilePath, reportContent, 'utf-8');
        log(LogLevel.INFO, `[PersonalHealthFileManager] Successfully wrote health report to ${reportFilePath}`);
    } catch (error: any) {
        log(LogLevel.ERROR, `[PersonalHealthFileManager] Error writing health report to ${reportFilePath}`, { error: error.message });
        throw error; // Re-throw the error to be handled by the caller
    }
} 