// src/plugins/personalHealth/types.ts

// Initially focused on workout, can be expanded
export type HealthEntryType = 
  | 'workout' 
  | 'meal'
  | 'symptom'
  | 'measurement' // e.g., weight, blood pressure
  | 'sleep_log'
  | 'mood'
  | 'hydration'
  | 'medication'
  | 'other';

export interface HealthLogEntry {
  id?: number;
  date: string; // YYYY-MM-DD
  entryType: HealthEntryType;
  content: string; // For workout: description; for meal: items; for symptom: description, etc.
  // Common optional fields, can be specialized further by entryType in UI or logic
  durationMinutes?: number; 
  calories?: number;
  notes?: string;
  createdAt?: string; // ISO 8601 timestamp
  // Fields from previous FitnessLogEntry that might be useful for some HealthEntryTypes
  distanceKm?: number; 
  reps?: number;
  sets?: number;
  weightKg?: number;
}

export interface PersonalHealthService {
  /**
   * Adds a new entry to the health log.
   * For now, primarily for "date + workout description".
   */
  addWorkoutEntry(date: string, description: string): HealthLogEntry;

  // Generic addEntry for future flexibility
  addGenericEntry(entry: Omit<HealthLogEntry, 'id' | 'createdAt'>): HealthLogEntry;

  /**
   * Retrieves entries, can be filtered.
   */
  getEntries(options: {
    date?: string;
    startDate?: string;
    endDate?: string;
    entryType?: HealthEntryType;
    limit?: number;
  }): HealthLogEntry[];
  
  /**
   * Retrieves the most recent entry, optionally filtered by type.
   * For now, Daily Review will use this to get the latest 'workout'.
   */
  getLatestEntry(entryType?: HealthEntryType): HealthLogEntry | null;

  /**
   * Provides the latest workout entry's date and content for the daily review.
   */
  getLatestWorkoutSummaryForReview(): { date: string; content: string; } | null;

  /**
   * Adds or updates a daily workout entry with a new exercise detail.
   * If an entry for the date exists, appends to content; otherwise, creates a new entry.
   */
  upsertDailyWorkoutEntry(date: string, exerciseDetail: string): HealthLogEntry;
} 