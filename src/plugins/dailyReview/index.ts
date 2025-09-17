import fs from 'fs/promises';
import path from 'path';
import { DynamicTool, StructuredTool } from 'langchain/tools';
import { z } from 'zod';
import { log, LogLevel } from '../../logger';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices, EmailService } from '../../types/plugin';
import { ScheduledTaskSetupOptions } from '../../types/scheduler';
import { TaskItem } from '../../types/task';
import type { DailyReviewData, GetWeatherForecastType, DailyReviewUserConfig } from './types';
import type { ListCalendarEventsService } from '../gcal/types';
import type { GmailPluginEmailArgs } from '../gmail/types';
import type { PersonalHealthService } from '../personalHealth/types.ts';

// Define an interface for the service instance we expect
interface IGetOpenNextActionsService {
  execute(filters?: any, sortOptions?: any): Promise<TaskItem[]>;
}

// const PROJECTS_DIR = path.join(__dirname, '../../../projects'); // No longer used by this plugin
const USER_CONFIG_DIR = path.join(process.cwd(), 'config');
const USER_CONFIG_FILE_PATH = path.join(USER_CONFIG_DIR, 'dailyReview.json');

class DailyReviewPluginDefinition implements WoosterPlugin {
  static readonly pluginName = "dailyReview";
  static readonly version = "1.1.0";
  static readonly description = "Provides a daily review summary including calendar, next actions from next_actions.md, and weather. Schedules a daily email.";

  readonly name = DailyReviewPluginDefinition.pluginName;
  readonly version = DailyReviewPluginDefinition.version;
  readonly description = DailyReviewPluginDefinition.description;

  private coreServices!: CoreServices;
  public appConfig!: AppConfig;
  public userConfig: DailyReviewUserConfig | null = null;

  private dailyReviewAgentToolInstance!: DynamicTool;
  private getDailyReviewHelpToolInstance!: DynamicTool;

  private logMsg(level: LogLevel, message: string, metadata?: object) {
    if (this.coreServices && this.coreServices.log) {
      this.coreServices.log(level, `[${DailyReviewPluginDefinition.pluginName} Plugin v${DailyReviewPluginDefinition.version}] ${message}`, metadata);
    } else {
      console.log(`[${level}][${DailyReviewPluginDefinition.pluginName} Plugin v${DailyReviewPluginDefinition.version}] ${message}`, metadata || '');
    }
  }
  
  private getDefaultUserConfig(): DailyReviewUserConfig {
    const defaultCron = (this.appConfig?.plugins?.dailyReview as any)?.scheduleCronExpression || 
                        this.appConfig?.dailyReview?.scheduleCronExpression || 
                        "30 7 * * *";
    const defaultEmailRecipient = this.appConfig?.gmail?.userPersonalEmailAddress || undefined;

    return {
      scheduleCron: defaultCron,
      isDailyReviewEnabled: false,
      hasCompletedInitialSetup: false,
      deliveryChannels: {
        email: {
          enabled: false,
          recipient: defaultEmailRecipient,
        },
      },
      contentModules: {
        calendar: false,
        nextActions: true,
        weather: false,
        healthLog: false,
        inspirationalQuote: false,
        chineseWordOfTheDay: false,
      },
    };
  }

  private async loadDailyReviewConfig(): Promise<void> {
    let isNewConfig = false;
    try {
      await fs.mkdir(USER_CONFIG_DIR, { recursive: true });
      const data = await fs.readFile(USER_CONFIG_FILE_PATH, 'utf-8');
      this.userConfig = JSON.parse(data) as DailyReviewUserConfig;
      this.logMsg(LogLevel.INFO, 'User config loaded successfully.', { path: USER_CONFIG_FILE_PATH });
      
      if (this.userConfig && typeof (this.userConfig.contentModules as any).projectActions === 'boolean') {
        this.logMsg(LogLevel.INFO, 'Migrating old projectActions config to nextActions.');
        this.userConfig.contentModules.nextActions = (this.userConfig.contentModules as any).projectActions;
        delete (this.userConfig.contentModules as any).projectActions;
      }

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logMsg(LogLevel.INFO, 'No user config file found. Initializing with default.', { path: USER_CONFIG_FILE_PATH });
        this.userConfig = this.getDefaultUserConfig();
        isNewConfig = true;
      } else {
        this.logMsg(LogLevel.ERROR, 'Error loading user config. Using default.', { error: error.message, path: USER_CONFIG_FILE_PATH });
        this.userConfig = this.getDefaultUserConfig();
      }
    }
    
    if (!this.userConfig) { 
        this.logMsg(LogLevel.ERROR, 'User config is null after load/default. Using emergency default.');
        this.userConfig = this.getDefaultUserConfig();
        isNewConfig = true;
    }

    let configModifiedSinceLoad = false;
    if (isNewConfig) {
        this.logMsg(LogLevel.INFO, 'Performing first-time setup for content modules based on detected services.');
        if (this.coreServices?.getService("getWeatherForecastFunction")) {
            if (this.userConfig.contentModules.weather === false) { 
                this.logMsg(LogLevel.INFO, 'Weather service detected. Auto-enabling weather content module for new config.');
                this.userConfig.contentModules.weather = true;
                configModifiedSinceLoad = true;
            }
        }
        if (this.coreServices?.getService("ListCalendarEventsService")) {
            if (this.userConfig.contentModules.calendar === false) { 
                this.logMsg(LogLevel.INFO, 'Calendar service detected. Auto-enabling calendar content module for new config.');
                this.userConfig.contentModules.calendar = true;
                configModifiedSinceLoad = true;
            }
        }
        if (this.coreServices?.getService("PersonalHealthService")) {
            if (this.userConfig.contentModules.healthLog === false) { 
                this.logMsg(LogLevel.INFO, 'PersonalHealthService detected. Auto-enabling healthLog content module for new config.');
                this.userConfig.contentModules.healthLog = true;
                configModifiedSinceLoad = true;
            }
        }
        if (this.coreServices?.getService("GetOpenNextActionsService")) {
            if (this.userConfig.contentModules.nextActions === false) {
                this.logMsg(LogLevel.INFO, 'NextActions service detected. Auto-enabling nextActions content module for new config.');
                this.userConfig.contentModules.nextActions = true;
                configModifiedSinceLoad = true;
            }
        }
        if (configModifiedSinceLoad) { 
            this.userConfig.hasCompletedInitialSetup = true; 
        }
    }
    
    let migrationOccurred = false;
    try {
      const rawConfigData = await fs.readFile(USER_CONFIG_FILE_PATH, 'utf-8');
      const rawParsedConfig = JSON.parse(rawConfigData);
      if (rawParsedConfig.contentModules && typeof rawParsedConfig.contentModules.projectActions === 'boolean') {
        migrationOccurred = true;
      }
    } catch (e) { /* ignore if file not found or parse error, isNewConfig handles new files */ }

    if (configModifiedSinceLoad || migrationOccurred) {
      await this.saveDailyReviewConfig();
    }
  }

  private async saveDailyReviewConfig(): Promise<void> {
    if (!this.userConfig) {
      this.logMsg(LogLevel.WARN, 'Attempted to save null user config. Skipping.');
      return;
    }
    if (this.userConfig.contentModules && (this.userConfig.contentModules as any).projectActions !== undefined) {
        delete (this.userConfig.contentModules as any).projectActions;
    }
    try {
      await fs.mkdir(USER_CONFIG_DIR, { recursive: true });
      const data = JSON.stringify(this.userConfig, null, 2);
      await fs.writeFile(USER_CONFIG_FILE_PATH, data, 'utf-8');
      this.logMsg(LogLevel.INFO, 'User config saved successfully.', { path: USER_CONFIG_FILE_PATH });
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, 'Error saving user config.', { error: error.message, path: USER_CONFIG_FILE_PATH });
    }
  }

  private async getDailyReviewContentInternal(): Promise<DailyReviewData> {
    if (!this.coreServices) {
      this.logMsg(LogLevel.ERROR, "Critical Error: Core services not available.");
      return { 
        greeting: "Hello! Wooster here. I had a little trouble brewing your daily review (core services missing).", 
        calendarEventsSummary: undefined, 
        nextActionsList: undefined, 
        weatherSummary: undefined, 
        previousDayHealthLog: undefined,
        inspirationalQuote: undefined,
        chineseWordOfTheDay: undefined,
        closing: "Hope you have a great day anyway!" 
      };
    }
    this.logMsg(LogLevel.INFO, 'Generating daily review content structure...');
    const userCfg = this.userConfig || this.getDefaultUserConfig();
  
    let calendarData: string | undefined = undefined;
    if (userCfg.contentModules.calendar) {
      const getCalendarEventsFunc = this.coreServices.getService("ListCalendarEventsService") as ListCalendarEventsService | undefined;
      if (getCalendarEventsFunc) {
        try {
          const eventsResult = await getCalendarEventsFunc();
          if (typeof eventsResult === 'string' && eventsResult.toLowerCase() !== 'no upcoming events found.' && eventsResult.trim() !== '') {
            calendarData = "🗓️ Today's Events:\n" + eventsResult;
          } else if (Array.isArray(eventsResult) && eventsResult.length > 0) {
            calendarData = "🗓️ Today's Events:\n" + eventsResult.map(event => `  - ${event.summary} (${new Date(event.start?.dateTime || event.start?.date || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`).join('\n');
          } else {
            calendarData = "🗓️ No upcoming events found for today. More time for action! ✨";
          }
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, "Error fetching calendar events.", { error: error.message });
          calendarData = "🗓️ Oops! Couldn't fetch calendar events.";
        }
      } else {
          this.logMsg(LogLevel.WARN, "ListCalendarEventsService service not found.");
          calendarData = "🗓️ Calendar service not available.";
      }
    }
  
    let fetchedNextActions: TaskItem[] | undefined = undefined;
    if (userCfg.contentModules.nextActions) {
        const nextActionsService = this.coreServices.getService("GetOpenNextActionsService") as IGetOpenNextActionsService | undefined;
        if (nextActionsService) {
            try {
                const tasks = await nextActionsService.execute({ status: 'open' });
                if (tasks && tasks.length > 0) {
                    fetchedNextActions = tasks;
                    this.logMsg(LogLevel.INFO, 'Fetched next actions for daily review.', { count: tasks.length });
                } else {
                    this.logMsg(LogLevel.INFO, 'No open next actions found for daily review.');
                }
            } catch (error: any) {
                this.logMsg(LogLevel.ERROR, "Error fetching next actions for daily review.", { error: error.message });
            }
        } else {
            this.logMsg(LogLevel.WARN, "GetOpenNextActionsService not found. Cannot fetch next actions.");
        }
    }
  
    let weatherData: string | undefined = undefined;
    if (userCfg.contentModules.weather) {
      const getWeatherForecastFunc = this.coreServices.getService("getWeatherForecastFunction") as GetWeatherForecastType | undefined;
      if (getWeatherForecastFunc) {
        try {
          const forecast = await getWeatherForecastFunc();
          weatherData = forecast ? `🌦️ Weather Today: ${forecast}` : "🌦️ Couldn't get the weather details, but I hope it's nice!";
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, "Error fetching weather forecast via service.", { error: error.message });
          weatherData = "🌦️ Oops! Weather forecast is hiding.";
        }
      } else {
          this.logMsg(LogLevel.WARN, "getWeatherForecastFunction service not found.");
          weatherData = "🌦️ Weather service not available.";
      }
    }
    
    let previousDayHealthLogData: string | undefined = undefined;
    if (userCfg.contentModules.healthLog) {
        const healthService = this.coreServices.getService("PersonalHealthService") as PersonalHealthService | undefined;
        if (healthService) {
            try {
                const yesterdayStr = getYesterdayDateString();
                const healthEvents = await healthService.getHealthEvents({ date: yesterdayStr, sort: 'asc' });
                
                if (healthEvents && healthEvents.length > 0) {
                    previousDayHealthLogData = `🏃 Yesterday's Fitness Log (${yesterdayStr}):\n` + healthEvents.map((event: string) => `  - ${event.substring(11)}`).join('\n');
                } else {
                    previousDayHealthLogData = `🏃 No health events logged for ${yesterdayStr}. A fresh start today?`;
                }
                this.logMsg(LogLevel.INFO, 'Previous day health log fetched via PersonalHealthService.', { date: yesterdayStr, count: healthEvents?.length || 0 });
            } catch (error: any) {
                this.logMsg(LogLevel.ERROR, "Error fetching health log from PersonalHealthService.", { error: error.message });
                previousDayHealthLogData = "🏃 Oops! Couldn't fetch yesterday's health log.";
            }
        } else {
            this.logMsg(LogLevel.WARN, "PersonalHealthService service not found.");
            previousDayHealthLogData = "🏃 Health log service not available.";
        }
    }

    let quoteData: string | undefined = undefined;
    if (userCfg.contentModules.inspirationalQuote) {
        const quotes = [
            "The secret of getting ahead is getting started. - Mark Twain",
            "The best time to plant a tree was 20 years ago. The second best time is now. - Chinese Proverb",
            "Your limitation—it's only your imagination."
        ];
        quoteData = `💡 Thought for the day: "${quotes[Math.floor(Math.random() * quotes.length)]}"`;
    }

    let chineseWord: DailyReviewData['chineseWordOfTheDay'] = undefined;
    if (userCfg.contentModules.chineseWordOfTheDay) {
        const words = [ { word: "你好", pinyin: "nǐ hǎo", translation: "Hello" }, { word: "谢谢", pinyin: "xièxie", translation: "Thank you" }];
        chineseWord = words[Math.floor(Math.random() * words.length)];
        chineseWord = chineseWord ? { word: `🇨🇳 ${chineseWord.word}`, pinyin: chineseWord.pinyin, translation: chineseWord.translation } : undefined;
    }

    return {
      greeting: "👋 Good morning! Here's your Wooster Daily Briefing:",
      calendarEventsSummary: calendarData,
      nextActionsList: fetchedNextActions,
      weatherSummary: weatherData,
      previousDayHealthLog: previousDayHealthLogData,
      inspirationalQuote: quoteData,
      chineseWordOfTheDay: chineseWord,
      closing: "Make today amazing! ✨ - Wooster"
    };
  }

  private formatReviewDataToText(data: DailyReviewData): string {
    let text = `${data.greeting}\n\n`;
    if (data.calendarEventsSummary) text += `${data.calendarEventsSummary}\n\n`;

    if (data.nextActionsList && data.nextActionsList.length > 0) {
      text += "📌 Your Next Actions:\n";
      data.nextActionsList.forEach(task => {
        let taskPrefix = "";
        if (task.context) taskPrefix += `${task.context} `;
        if (task.project && task.project.toLowerCase() !== '+home') taskPrefix += `[${task.project.substring(1)}] `;
        text += `  - ${taskPrefix}${task.description}${task.dueDate ? ' (due: ' + task.dueDate + ')' : ''}\n`;
      });
      text += "\n";
    } else if (this.userConfig?.contentModules.nextActions) {
      text += "📌 No open next actions right now. Great job, or time to plan! 🎉\n\n";
    }

    if (data.weatherSummary) text += `${data.weatherSummary}\n\n`;
    if (data.previousDayHealthLog) text += `${data.previousDayHealthLog}\n\n`;
    if (data.inspirationalQuote) text += `${data.inspirationalQuote}\n\n`;

    if (data.chineseWordOfTheDay && data.chineseWordOfTheDay.word) {
      text += `🇨🇳 Chinese Word: ${data.chineseWordOfTheDay.word} (${data.chineseWordOfTheDay.pinyin}) - ${data.chineseWordOfTheDay.translation}\n\n`;
    }
    text += data.closing;
    return text;
  }

  private formatReviewDataToHtml(data: DailyReviewData): string {
    // Helper to escape HTML entities
    const escapeHtml = (unsafe: string): string => 
      unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    let html = `<div style="font-family: Arial, sans-serif; line-height: 1.6;">`;
    html += `<h2 style="color: #2c3e50;">${escapeHtml(data.greeting)}</h2>`;

    if (data.calendarEventsSummary) {
      html += `<div style="margin-bottom: 20px; padding: 10px; background-color: #f9f9f9; border-left: 3px solid #3498db;">`;
      html += `<h3 style="margin-top: 0; color: #3498db;">🗓️ Calendar</h3><p>${data.calendarEventsSummary.replace(/\n/g, "<br>")}</p>`;
      html += `</div>`;
    }

    if (data.nextActionsList && data.nextActionsList.length > 0) {
      html += `<div style="margin-bottom: 20px; padding: 10px; background-color: #f9f9f9; border-left: 3px solid #f39c12;">`;
      html += `<h3 style="margin-top: 0; color: #f39c12;">📌 Your Next Actions</h3><ul>`;
      data.nextActionsList.forEach(task => {
        let taskPrefix = "";
        if (task.context) taskPrefix += `<em>${escapeHtml(task.context)}</em> `;
        if (task.project && task.project.toLowerCase() !== '+home') taskPrefix += `<strong>[${escapeHtml(task.project.substring(1))}]</strong> `;
        const dueString = task.dueDate ? ` <small>(due: ${escapeHtml(task.dueDate)})</small>` : '';
        html += `<li>${taskPrefix}${escapeHtml(task.description)}${dueString}</li>`;
      });
      html += "</ul></div>";
    } else if (this.userConfig?.contentModules.nextActions) {
      html += `<div style="margin-bottom: 20px; padding: 10px; background-color: #f9f9f9; border-left: 3px solid #2ecc71;">`;
      html += `<h3 style="margin-top: 0; color: #2ecc71;">📌 Next Actions</h3><p>No open next actions right now. Great job, or time to plan! 🎉</p>`;
      html += `</div>`;
    }

    if (data.weatherSummary) {
      html += `<div style="margin-bottom: 20px; padding: 10px; background-color: #f9f9f9; border-left: 3px solid #1abc9c;">`;
      html += `<h3 style="margin-top: 0; color: #1abc9c;">🌦️ Weather</h3><p>${data.weatherSummary.replace(/\n/g, "<br>")}</p>`;
      html += `</div>`;
    }
    if (data.previousDayHealthLog) {
      html += `<div style="margin-bottom: 20px; padding: 10px; background-color: #f9f9f9; border-left: 3px solid #9b59b6;">`;
      html += `<h3 style="margin-top: 0; color: #9b59b6;">🏃 Fitness Log</h3><p>${data.previousDayHealthLog.replace(/\n/g, "<br>")}</p>`;
      html += `</div>`;
    }
    if (data.inspirationalQuote) {
      html += `<div style="margin-bottom: 20px; padding: 10px; background-color: #f0f9ff; border-left: 3px solid #5dade2;">`;
      html += `<h3 style="margin-top: 0; color: #5dade2;">💡 Thought for the Day</h3><p><em>${escapeHtml(data.inspirationalQuote)}</em></p>`;
      html += `</div>`;
    }
    if (data.chineseWordOfTheDay && data.chineseWordOfTheDay.word) {
      html += `<div style="margin-bottom: 20px; padding: 10px; background-color: #fff9f0; border-left: 3px solid #e67e22;">`;
      html += `<h3 style="margin-top: 0; color: #e67e22;">🇨🇳 Chinese Word</h3><p>${escapeHtml(data.chineseWordOfTheDay.word)} (${escapeHtml(data.chineseWordOfTheDay.pinyin || '')}) - ${escapeHtml(data.chineseWordOfTheDay.translation || '')}</p>`;
      html += `</div>`;
    }
    html += `<p style="color: #7f8c8d; font-size: 0.9em;">${escapeHtml(data.closing)}</p>`;
    html += `</div>`;
    return html;
  }

  private async sendDailyReviewEmail(): Promise<void> {
    if (!this.userConfig || !this.userConfig.isDailyReviewEnabled || !this.userConfig.deliveryChannels.email.enabled) {
      this.logMsg(LogLevel.INFO, 'Daily review email not sent due to user configuration (disabled overall or email channel disabled).');
      return;
    }

    const emailService = this.coreServices.getService("EmailService") as EmailService | undefined;
    if (!emailService) {
      this.logMsg(LogLevel.ERROR, "EmailService not available. Cannot send daily review email.");
      return;
    }

    const recipient = this.userConfig.deliveryChannels.email.recipient || this.appConfig?.gmail?.userPersonalEmailAddress;
    if (!recipient) {
      this.logMsg(LogLevel.ERROR, "No recipient configured for daily review email (checked dailyReview.json and GMAIL_USER_PERSONAL_EMAIL_ADDRESS).");
      return;
    }

    try {
      this.logMsg(LogLevel.INFO, 'Preparing to send daily review email.');
      const reviewData = await this.getDailyReviewContentInternal();
      const subject = "✨ Your Wooster Daily Briefing! ✨";
      const htmlBody = this.formatReviewDataToHtml(reviewData);
      // const textBody = this.formatReviewDataToText(reviewData); // Optional: for multipart

      const emailArgs: GmailPluginEmailArgs = {
        to: recipient,
        subject: subject,
        body: htmlBody, // Send HTML body
        // htmlBody: htmlBody, // If sending multipart
      };

      await emailService.send(emailArgs);
      this.logMsg(LogLevel.INFO, `Daily review email sent successfully to ${recipient}.`);
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, "Failed to send daily review email.", { error: error.message, stack: error.stack });
    }
  }

  private async sendDailyReviewSignal(): Promise<void> {
    if (!this.userConfig || !this.userConfig.isDailyReviewEnabled || !this.userConfig.deliveryChannels.signal?.enabled) {
      this.logMsg(LogLevel.INFO, 'Daily review Signal not sent due to user configuration (disabled overall or signal channel disabled).');
      return;
    }

    const signalService = this.coreServices.getService("SignalService") as { send: (msg: string, opts?: { to?: string; groupId?: string }) => Promise<void> } | undefined;
    if (!signalService) {
      this.logMsg(LogLevel.ERROR, "SignalService not available. Cannot send daily review via Signal.");
      return;
    }

    try {
      this.logMsg(LogLevel.INFO, 'Preparing to send daily review via Signal.');
      const reviewData = await this.getDailyReviewContentInternal();
      const textBody = this.formatReviewDataToText(reviewData);
      const opts = {
        to: this.userConfig.deliveryChannels.signal?.to,
        groupId: this.userConfig.deliveryChannels.signal?.groupId,
      };
      await signalService.send(textBody, opts);
      this.logMsg(LogLevel.INFO, 'Daily review sent via Signal.');
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, 'Failed to send daily review via Signal.', { error: error.message, stack: error.stack });
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.appConfig = config;
    this.coreServices = services;
    await this.loadDailyReviewConfig();
    this.logMsg(LogLevel.INFO, "Plugin initialized.");

    // Instantiate the tool for getting the daily review content
    this.dailyReviewAgentToolInstance = new DynamicTool({
      name: "get_daily_review",
      description: "Generates and returns the current daily review content as a JSON string based on user's settings. If not configured, prompts to check help.",
      func: async () => {
        this.logMsg(LogLevel.DEBUG, "get_daily_review tool executed.");
        const userCfg = this.userConfig || this.getDefaultUserConfig();
        if (!userCfg.isDailyReviewEnabled && !userCfg.hasCompletedInitialSetup) {
            return JSON.stringify({
                message: "Your Daily Review is not yet enabled or fully configured. To get started, ask Wooster: 'help with daily review' or 'what is the daily review?'",
                status: "not_configured"
            });
        }
        const data = await this.getDailyReviewContentInternal();
        return JSON.stringify(data);
      }
    });

    // Instantiate the help tool
    this.getDailyReviewHelpToolInstance = new DynamicTool({
      name: "get_daily_review_help",
      description: "Provides detailed help and current configuration status for the Daily Review plugin, including content modules, delivery channels, and scheduling.",
      func: async () => {
        this.logMsg(LogLevel.DEBUG, "get_daily_review_help tool executed.");
        const cfg = this.userConfig || this.getDefaultUserConfig();

        let helpText = `
**Wooster Daily Review Configuration & Help**

**Current Schedule:** \`${cfg.scheduleCron}\` (Enabled: ${cfg.isDailyReviewEnabled})
**Initial Setup Completed:** ${cfg.hasCompletedInitialSetup}

**Content Modules (what's in your review):**
`;
        for (const key of Object.keys(cfg.contentModules) as Array<keyof DailyReviewUserConfig['contentModules']>) {
          let moduleDescription = "";
          switch (key) {
            case 'calendar': moduleDescription = "(Events from your primary calendar via Calendar plugin)"; break;
            case 'nextActions': moduleDescription = "(Tasks from your main \`next_actions.md\` file)"; break;
            case 'weather': moduleDescription = "(Forecast for your configured city via Weather plugin)"; break;
            case 'healthLog': moduleDescription = "(Summary of yesterday's health events from the Personal Health plugin)"; break;
            case 'inspirationalQuote': moduleDescription = "(A daily dose of inspiration)"; break;
            case 'chineseWordOfTheDay': moduleDescription = "(Learn a new Chinese word)"; break;
            default: moduleDescription = "(Unknown module)";
          }
          helpText += `  - ${key}: ${cfg.contentModules[key] ? '✅ Enabled' : '❌ Disabled'} ${moduleDescription}\n`;
        }

        helpText += `
**Delivery Channels (how you get your review):**
`;
        if (cfg.deliveryChannels.email || this.coreServices?.getService("EmailService")) {
          const emailCfg = cfg.deliveryChannels.email;
          helpText += `  - Email: ${emailCfg.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
          if (emailCfg.enabled) {
            helpText += `    - Recipient: ${emailCfg.recipient || this.appConfig?.gmail?.userPersonalEmailAddress || '(Not Set - Defaults to GMAIL_USER_PERSONAL_EMAIL_ADDRESS env var)'}\n`;
          }
        }

        if (cfg.deliveryChannels.discord || this.coreServices?.getService("DiscordService")) {
            const discordCfg = (cfg.deliveryChannels as any).discord;
            helpText += `
  *   **Discord Delivery (\`discord\`):** (Requires a Discord Plugin/Service - Coming Soon!)
      - Enabled: ${discordCfg?.enabled ? '✅' : '❌'}
      - Channel ID: ${discordCfg?.channelId || '(Not Set)'}
`;
        }

        helpText += `
To configure, edit \`config/dailyReview.json\`. 
Wooster automatically creates this file with defaults if it's missing. 
It checks for available services (Calendar, Weather, etc.) on first setup to auto-enable relevant modules.
`;
        return helpText;
      }
    });

    // Example of checking for the GetOpenNextActionsService during initialization
    const nextActionsServiceCheck = this.coreServices.getService("GetOpenNextActionsService") as IGetOpenNextActionsService | undefined;
    if (!nextActionsServiceCheck && this.userConfig?.contentModules.nextActions) {
        this.logMsg(LogLevel.WARN, "'GetOpenNextActionsService' not found during initialization, but the 'nextActions' module is enabled. Next actions might not appear in the review if NextActionsPlugin loads later.");
    }
  }

  async shutdown(): Promise<void> {
    this.logMsg(LogLevel.INFO, "Plugin shutdown.");
  }

  getAgentTools?(): any[] {
    const tools: any[] = [];
    if (this.dailyReviewAgentToolInstance) {
      tools.push(this.dailyReviewAgentToolInstance);
    }
    if (this.getDailyReviewHelpToolInstance) {
      tools.push(this.getDailyReviewHelpToolInstance);
    }
    return tools;
  }

  getScheduledTaskSetups?(): ScheduledTaskSetupOptions | ScheduledTaskSetupOptions[] | undefined {
    let isEnabled = false;
    let effectiveSchedule = this.getDefaultUserConfig().scheduleCron;
    let scheduleSource = "Plugin Default";

    if (this.userConfig) {
      const emailEnabled = this.userConfig.deliveryChannels.email?.enabled ?? false;
      const signalEnabled = this.userConfig.deliveryChannels.signal?.enabled ?? false;
      isEnabled = this.userConfig.isDailyReviewEnabled && (emailEnabled || signalEnabled);
      
      if (this.userConfig.isDailyReviewEnabled) {
        scheduleSource = "User Config: dailyReview.json (isDailyReviewEnabled=true)";
        if (this.userConfig.scheduleCron) {
          effectiveSchedule = this.userConfig.scheduleCron;
        }
      } else {
        scheduleSource = "User Config: dailyReview.json (isDailyReviewEnabled=false)";
      }
      
      if (!emailEnabled && !signalEnabled && this.userConfig.isDailyReviewEnabled) {
        scheduleSource += " (All delivery channels disabled in dailyReview.json)";
      }
    } else {
      scheduleSource = "Error: User config not loaded";
      isEnabled = false;
    }
    
    const appConfigDefaultCron = this.appConfig?.dailyReview?.scheduleCronExpression;
    if (this.userConfig && !this.userConfig.scheduleCron && appConfigDefaultCron) {
        effectiveSchedule = appConfigDefaultCron;
        if (scheduleSource === "User Config: dailyReview.json (isDailyReviewEnabled=true)") {
            scheduleSource = "AppConfig: dailyReview.scheduleCronExpression (via User Config)";
        }
    }

    if (!isEnabled) {
      this.logMsg(LogLevel.INFO, "Daily review task not scheduled: disabled by user configuration or all delivery channels disabled.");
    } else {
      this.logMsg(LogLevel.INFO, `Daily review task will be scheduled. Effective Cron: ${effectiveSchedule}, Source: ${scheduleSource}`);
    }

    // A single scheduled task that, when fired, will deliver via any enabled channels (Signal and/or Email)
    const deliverDailyReview = async () => {
      await Promise.allSettled([
        this.sendDailyReviewSignal(),
        this.sendDailyReviewEmail(),
      ]);
    };

    return {
      taskKey: "dailyReview.send",
      description: "Sends the Daily Review via configured delivery channels (Signal, Email).",
      defaultScheduleExpression: this.getDefaultUserConfig().scheduleCron,
      effectiveScheduleExpression: effectiveSchedule,
      isEnabledByPlugin: isEnabled,
      functionToExecute: deliverDailyReview,
      executionPolicy: 'RUN_ONCE_PER_PERIOD_CATCH_UP'
    };
  }
}

function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default DailyReviewPluginDefinition; 