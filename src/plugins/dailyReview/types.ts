import { TaskItem } from '../../types/task';

export interface DailyReviewUserConfig {
  scheduleCron: string;
  isDailyReviewEnabled: boolean;
  hasCompletedInitialSetup: boolean;
  deliveryChannels: {
    email: {
      enabled: boolean;
      recipient?: string;
    };
    signal?: {
      enabled: boolean;
      to?: string;       // optional override recipient
      groupId?: string;  // optional group id
    };
    discord?: { // Optional Discord channel
      enabled: boolean;
      webhookUrl?: string;
    };
    // Future: telegram: { enabled: boolean; chatId?: string; };
  };
  contentModules: {
    calendar: boolean;
    // projectActions: boolean; // Old field for actions.txt
    nextActions: boolean; // New field for next_actions.md
    weather: boolean;
    healthLog: boolean;
    inspirationalQuote: boolean;
    chineseWordOfTheDay: boolean;
    // Add more as they become available
  };
} 

// Removed ProjectActionItem as it's related to the old actions.txt logic

export interface DailyReviewData {
  greeting: string;
  calendarEventsSummary?: string;
  // projectActions?: ProjectActionItem[]; // Old field
  nextActionsList?: TaskItem[]; // New field for tasks from next_actions.md
  weatherSummary?: string;
  previousDayHealthLog?: string;
  inspirationalQuote?: string;
  chineseWordOfTheDay?: {
    word?: string;
    pinyin?: string;
    translation?: string;
  };
  closing: string;
}

// For services injected by other plugins
export type GetWeatherForecastType = () => Promise<string>;

// Types for the functions the daily review plugin expects for its dependencies.
// These might be provided by other plugins (Weather, Calendar) in the future.
export type GetCalendarEventsType = () => Promise<string>; 