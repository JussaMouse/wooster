import { PersonalHealthService, HealthLogEntry, HealthEntryType } from './types';
import { 
    initializeDatabase as initDbSync,
    addHealthEntryToDb,
    getLatestHealthEntryFromDb,
    getHealthEntriesFromDb,
    upsertDailyWorkoutEntry
} from './db';
import { log, LogLevel } from '../../logger';
import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { DynamicTool } from "@langchain/core/tools";

export class PersonalHealthPlugin implements WoosterPlugin, PersonalHealthService {
    readonly name = 'PersonalHealthPlugin';
    readonly version = '1.0.0';
    readonly description = 'Manages personal health data, including workouts, meals, and other health-related events.';
    dependencies: string[] = []; 

    private isInitialized = false;
    private coreServices!: CoreServices;

    async initialize(config: AppConfig, services: CoreServices): Promise<void> {
        this.coreServices = services;
        log(LogLevel.INFO, `[PersonalHealthPlugin] Initializing PersonalHealthPlugin for agent.`);
        this.ensureInitialized();
        this.coreServices.registerService('personalHealthService', this);
    }

    private ensureInitialized(): void {
        if (!this.isInitialized) {
            initDbSync();
            this.isInitialized = true;
            log(LogLevel.INFO, '[PersonalHealthPlugin] Database Initialized.');
        }
    }

    addWorkoutEntry(date: string, description: string): HealthLogEntry {
        this.ensureInitialized();
        log(LogLevel.INFO, `[PersonalHealthPlugin] Adding workout entry for date: ${date}`);
        const entryData: Omit<HealthLogEntry, 'id' | 'createdAt'> = {
            date,
            entryType: 'workout',
            content: description,
        };
        try {
            const newEntry = addHealthEntryToDb(entryData);
            log(LogLevel.INFO, `[PersonalHealthPlugin] Workout entry added successfully for date: ${date}`, { id: newEntry.id });
            return newEntry;
        } catch (error) {
            log(LogLevel.ERROR, `[PersonalHealthPlugin] Error adding workout entry for date: ${date}`, { error });
            throw error;
        }
    }

    addGenericEntry(entry: Omit<HealthLogEntry, 'id' | 'createdAt'>): HealthLogEntry {
        this.ensureInitialized();
        log(LogLevel.INFO, `[PersonalHealthPlugin] Adding generic health entry of type: ${entry.entryType}`);
        try {
            const newEntry = addHealthEntryToDb(entry);
            log(LogLevel.INFO, `[PersonalHealthPlugin] Generic entry added successfully`, { id: newEntry.id, type: newEntry.entryType });
            return newEntry;
        } catch (error) {
            log(LogLevel.ERROR, `[PersonalHealthPlugin] Error adding generic entry`, { error, entryType: entry.entryType });
            throw error;
        }
    }

    getEntries(options: {
        date?: string;
        startDate?: string;
        endDate?: string;
        entryType?: HealthEntryType;
        limit?: number;
    }): HealthLogEntry[] {
        this.ensureInitialized();
        log(LogLevel.INFO, '[PersonalHealthPlugin] Getting health entries', { options });
        try {
            return getHealthEntriesFromDb(options);
        } catch (error) {
            log(LogLevel.ERROR, '[PersonalHealthPlugin] Error getting health entries', { error, options });
            throw error;
        }
    }

    getLatestEntry(entryType?: HealthEntryType): HealthLogEntry | null {
        this.ensureInitialized();
        log(LogLevel.INFO, `[PersonalHealthPlugin] Getting latest health entry${entryType ? ' of type: ' + entryType : ''}`);
        try {
            return getLatestHealthEntryFromDb(entryType);
        } catch (error) {
            log(LogLevel.ERROR, `[PersonalHealthPlugin] Error getting latest health entry${entryType ? ' of type: ' + entryType : ''}`, { error });
            throw error;
        }
    }

    getLatestWorkoutSummaryForReview(): { date: string; content: string; } | null {
        this.ensureInitialized();
        log(LogLevel.INFO, '[PersonalHealthPlugin] Getting latest workout summary for review.');
        try {
            const latestWorkout = getLatestHealthEntryFromDb('workout');
            if (latestWorkout && latestWorkout.date && latestWorkout.content) {
                log(LogLevel.INFO, '[PersonalHealthPlugin] Found latest workout for review.', { id: latestWorkout.id, date: latestWorkout.date });
                return { date: latestWorkout.date, content: latestWorkout.content };
            } else {
                log(LogLevel.INFO, '[PersonalHealthPlugin] No workout entries found or entry is incomplete for review.');
                return null;
            }
        } catch (error) {
            log(LogLevel.ERROR, '[PersonalHealthPlugin] Error getting latest workout summary for review', { error });
            throw error;
        }
    }

    upsertDailyWorkoutEntry(date: string, exerciseDetail: string): HealthLogEntry {
        this.ensureInitialized();
        log(LogLevel.INFO, `[PersonalHealthPlugin] Upserting daily workout entry for date: ${date}, detail: ${exerciseDetail}`);
        try {
            const entry = upsertDailyWorkoutEntry(date, exerciseDetail);
            log(LogLevel.INFO, `[PersonalHealthPlugin] Daily workout entry upserted successfully for date: ${date}`, { id: entry.id });
            return entry;
        } catch (error) {
            log(LogLevel.ERROR, `[PersonalHealthPlugin] Error upserting daily workout entry for date: ${date}`, { error, exerciseDetail });
            throw error;
        }
    }

    getAgentTools?(): DynamicTool[] {
        const logExerciseTool = new DynamicTool({
            name: "logExerciseToDailyFitnessLog",
            description: "Adds a specific exercise or activity to the current day's fitness log. For example, 'log pushups 10 reps' or 'log 30 minute run'. Use this to incrementally build up the day's workout log.",
            func: async (input: string): Promise<string> => {
                this.ensureInitialized();
                
                // Get current local date in YYYY-MM-DD format
                const currentDate = new Date();
                const year = currentDate.getFullYear();
                const month = (currentDate.getMonth() + 1).toString().padStart(2, '0'); // JavaScript months are 0-indexed
                const day = currentDate.getDate().toString().padStart(2, '0');
                const localToday = `${year}-${month}-${day}`;

                try {
                    const entry = this.upsertDailyWorkoutEntry(localToday, input);
                    const message = `Logged "${input}" to today's (${localToday}) fitness log. Current log: ${entry.content}`;
                    return Promise.resolve(message);
                } catch (error: any) {
                    log(LogLevel.ERROR, `[PersonalHealthPlugin] Error in logExerciseTool for input: "${input}"`, { error: error.message });
                    const errorMessage = `Error logging exercise: ${error.message}`;
                    return Promise.resolve(errorMessage);
                }
            },
        });
        return [logExerciseTool];
    }
}

const pluginInstance = new PersonalHealthPlugin();
export default pluginInstance; 