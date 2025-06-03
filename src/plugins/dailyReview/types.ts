export interface ProjectActionItem {
  projectName: string;
  actions: string[];
}

export interface DailyReviewData {
  greeting: string;
  calendarEventsSummary?: string;
  projectActions?: ProjectActionItem[];
  weatherSummary?: string;
  previousDayHealthLog?: string;
  inspirationalQuote?: string;
  chineseWordOfTheDay?: { char: string; pinyin: string; translation: string };
  closing?: string;
}

// Types for the functions the daily review plugin expects for its dependencies.
// These might be provided by other plugins (Weather, Calendar) in the future.
export type GetWeatherForecastType = () => Promise<string>;
export type GetCalendarEventsType = () => Promise<string>;

// --- New User Configuration ---
export interface DailyReviewUserConfig {
  scheduleCron: string; // User-defined cron string
  isDailyReviewEnabled: boolean; // Overall toggle for the daily review
  hasCompletedInitialSetup: boolean; // Added this flag
  deliveryChannels: {
    email: {
      enabled: boolean;
      recipient?: string; // Defaults to GMAIL_USER_PERSONAL_EMAIL_ADDRESS if not set
    };
    discord?: { // Optional Discord channel
      enabled: boolean;
      webhookUrl?: string;
    };
    // Future: telegram: { enabled: boolean; chatId?: string; };
  };
  contentModules: {
    calendar: boolean;
    projectActions: boolean;
    weather: boolean;
    healthLog: boolean;
    inspirationalQuote: boolean;
    chineseWordOfTheDay: boolean;
    // Add more as they become available
  };
} 