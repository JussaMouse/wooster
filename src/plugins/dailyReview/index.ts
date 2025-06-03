import fs from 'fs/promises';
import path from 'path';
import { DynamicTool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { log, LogLevel } from '../../logger';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices, EmailService } from '../../types/plugin';
import { ScheduledTaskSetupOptions } from '../../types/scheduler';
import type { DailyReviewData, ProjectActionItem, GetWeatherForecastType, DailyReviewUserConfig } from './types';
import type { ListCalendarEventsService } from '../gcal/types';
import type { NextActionsService, NextActionItem } from '../nextActions/types';
import type { GmailPluginEmailArgs } from '../gmail/types';
import type { PersonalHealthService } from '../personalHealth/types';

const PROJECTS_DIR = path.join(__dirname, '../../../projects');
const USER_CONFIG_DIR = path.join(process.cwd(), 'config');
const USER_CONFIG_FILE_PATH = path.join(USER_CONFIG_DIR, 'dailyReview.json');

class DailyReviewPluginDefinition implements WoosterPlugin {
  readonly name = "dailyReview";
  readonly version = "1.0.0";
  readonly description = "Provides a daily review summary including calendar, project actions, and weather. Also schedules a daily email with this summary based on user configuration.";

  private coreServices!: CoreServices;
  public appConfig!: AppConfig;
  public userConfig: DailyReviewUserConfig | null = null;

  private dailyReviewAgentToolInstance!: DynamicTool;
  private getDailyReviewHelpToolInstance!: DynamicTool;

  private logMsg(level: LogLevel, message: string, metadata?: object) { // Renamed to avoid conflict with imported 'log'
    if (this.coreServices && this.coreServices.log) {
      this.coreServices.log(level, `[DailyReviewPlugin] ${message}`, metadata);
    } else {
      console.log(`[${level}][DailyReviewPlugin] ${message}`, metadata || '');
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
        projectActions: true,
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
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logMsg(LogLevel.INFO, 'No user config file found. Initializing with default.', { path: USER_CONFIG_FILE_PATH });
        this.userConfig = this.getDefaultUserConfig();
        isNewConfig = true; // Flag that this is a new configuration setup
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

    let configModified = false;

    // 1. Auto-populate delivery channels (for both new and existing configs if channel missing)
    // REMOVED: Block that checked for EmailService here
    // if (this.coreServices?.getService("EmailService")) { ... }
    // Users will need to ensure their dailyReview.json is configured for email if they want it,
    // or this auto-config can be revisited with a post-initialization hook later.

    // 2. Auto-enable content modules IF it's a new config AND services are present
    if (isNewConfig) {
      this.logMsg(LogLevel.INFO, 'Performing first-time setup for content modules based on detected services.');
      if (this.coreServices?.getService("getWeatherForecastFunction")) {
        if (this.userConfig.contentModules.weather === false) { 
            this.logMsg(LogLevel.INFO, 'Weather service detected. Auto-enabling weather content module for new config.');
            this.userConfig.contentModules.weather = true;
            configModified = true;
        }
      }
      if (this.coreServices?.getService("ListCalendarEventsService")) {
        if (this.userConfig.contentModules.calendar === false) { 
            this.logMsg(LogLevel.INFO, 'Calendar service detected. Auto-enabling calendar content module for new config.');
            this.userConfig.contentModules.calendar = true;
            configModified = true;
        }
      }
      // Auto-enable healthLog if PersonalHealthService is available
      if (this.coreServices?.getService("PersonalHealthService")) {
        if (this.userConfig.contentModules.healthLog === false) { 
            this.logMsg(LogLevel.INFO, 'PersonalHealthService detected. Auto-enabling healthLog content module for new config.');
            this.userConfig.contentModules.healthLog = true;
            configModified = true;
        }
      }
      // Note: projectActions is true by default in getDefaultUserConfig()
      if (configModified) { // If modules were auto-enabled, mark setup as potentially complete
        this.userConfig.hasCompletedInitialSetup = true; 
      }
    }

    if (configModified) {
      await this.saveDailyReviewConfig();
    }
  }

  private async saveDailyReviewConfig(): Promise<void> {
    if (!this.userConfig) {
      this.logMsg(LogLevel.WARN, 'Attempted to save null user config. Skipping.');
      return;
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
      this.logMsg(LogLevel.ERROR, "DailyReviewPlugin Critical Error: Core services not available.");
      return { 
        greeting: "Error: Daily review content generation failed (core services missing).", 
        calendarEventsSummary: "- Error -", 
        projectActions: [], 
        weatherSummary: "- Error -", 
        previousDayHealthLog: "- Error -",
        inspirationalQuote: "- Error -",
        chineseWordOfTheDay: undefined,
        closing: "" 
      };
    }
    this.logMsg(LogLevel.INFO, 'Generating daily review content structure...');
    const userCfg = this.userConfig || this.getDefaultUserConfig();
  
    let calendarData: string | undefined = "- (Not enabled or service not available)";
    if (userCfg.contentModules.calendar) {
      const getCalendarEventsFunc = this.coreServices.getService("ListCalendarEventsService") as ListCalendarEventsService | undefined;
      if (getCalendarEventsFunc) {
        try {
          const eventsResult = await getCalendarEventsFunc();
          if (typeof eventsResult === 'string') {
            calendarData = eventsResult;
          } else if (Array.isArray(eventsResult) && eventsResult.length > 0) {
            calendarData = "Today's Events:\n" + eventsResult.map(event => `  - ${event.summary} (${new Date(event.start?.dateTime || event.start?.date || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`).join('\n');
          } else {
            calendarData = "No upcoming events found.";
          }
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, "Error fetching calendar events.", { error: error.message });
          calendarData = "- Error fetching calendar events.";
        }
      } else {
          this.logMsg(LogLevel.WARN, "ListCalendarEventsService service not found.");
      }
    }
  
    let projActions: ProjectActionItem[] = [];
    if (userCfg.contentModules.projectActions) {
        const nextActionsService = this.coreServices.getService("NextActionsService") as NextActionsService | undefined;
        if (nextActionsService) {
            try {
                const rawActions: NextActionItem[] = await nextActionsService.getAggregatedActions(false);
                const actionMap = new Map<string, string[]>();
                rawActions.forEach(item => {
                    if (item.action.trim() !== '') {
                        const existing = actionMap.get(item.project);
                        if (existing) {
                            existing.push(item.action);
                        } else {
                            actionMap.set(item.project, [item.action]);
                        }
                    }
                });
                projActions = Array.from(actionMap.entries()).map(([projectName, actions]) => ({
                    projectName,
                    actions
                }));
                this.logMsg(LogLevel.INFO, 'Fetched project actions via NextActionsService.', { count: projActions.length });
            } catch (error: any) {
                this.logMsg(LogLevel.ERROR, "Error fetching project actions via NextActionsService.", { error: error.message });
                projActions = [{ projectName: "Error", actions: ["Could not fetch next actions due to service error."] }];
            }
        } else {
            this.logMsg(LogLevel.WARN, "NextActionsService not found. Cannot fetch project actions.");
            projActions = [{ projectName: "Service N/A", actions: ["NextActionsService not available."] }];
        }
    }
  
    let weatherData = "- (Not enabled or service not available)";
    if (userCfg.contentModules.weather) {
      const getWeatherForecastFunc = this.coreServices.getService("getWeatherForecastFunction") as GetWeatherForecastType | undefined;
      if (getWeatherForecastFunc) {
        try {
          weatherData = await getWeatherForecastFunc();
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, "Error fetching weather forecast via service.", { error: error.message });
          weatherData = "- Error fetching weather forecast.";
        }
      } else {
          this.logMsg(LogLevel.WARN, "getWeatherForecastFunction service not found.");
      }
    }
    
    let previousDayHealthLogData: string | undefined = "- (Not enabled or service not available)";
    if (userCfg.contentModules.healthLog) {
        const healthService = this.coreServices.getService("PersonalHealthService") as PersonalHealthService | undefined;
        if (healthService) {
            try {
                const yesterdayStr = getYesterdayDateString();
                const healthEvents = await healthService.getHealthEvents({ date: yesterdayStr, sort: 'asc' });
                
                if (healthEvents && healthEvents.length > 0) {
                    previousDayHealthLogData = `Summary for ${yesterdayStr}:\n` + healthEvents.map((event: string) => `  - ${event.substring(11)}`).join('\n');
                } else {
                    previousDayHealthLogData = `No health events logged for ${yesterdayStr}.`;
                }
                this.logMsg(LogLevel.INFO, 'Previous day health log fetched via PersonalHealthService.', { date: yesterdayStr, count: healthEvents?.length || 0 });
            } catch (error: any) {
                this.logMsg(LogLevel.ERROR, "Error fetching health log from PersonalHealthService.", { error: error.message });
                previousDayHealthLogData = "- Error fetching health log.";
            }
        } else {
            this.logMsg(LogLevel.WARN, "PersonalHealthService not found. Cannot fetch health log.");
        }
    }

    const reviewData: DailyReviewData = {
        greeting: "Good morning! Here is your daily review from Wooster:",
        calendarEventsSummary: calendarData,
        projectActions: projActions,
        weatherSummary: weatherData,
        previousDayHealthLog: previousDayHealthLogData,
        inspirationalQuote: userCfg.contentModules.inspirationalQuote ? "Fetch quote here..." : undefined,
        chineseWordOfTheDay: userCfg.contentModules.chineseWordOfTheDay ? { char: "字", pinyin: "zì", translation: "word" } : undefined,
        closing: "Have a productive day!"
    };
    this.logMsg(LogLevel.INFO, 'Daily review data structure generated.');
    return reviewData;
  }

  private formatReviewDataToText(data: DailyReviewData): string {
    let text = `${data.greeting}\n\n`;
    if (data.calendarEventsSummary) text += `Calendar:\n${data.calendarEventsSummary}\n\n`;
    if (data.projectActions && data.projectActions.length > 0) {
      text += "Project Actions:\n";
      data.projectActions.forEach(p => {
        text += `  ${p.projectName}:\n`;
        p.actions.forEach(a => text += `    - ${a}\n`);
      });
      text += "\n";
    }
    if (data.weatherSummary) text += `Weather:\n${data.weatherSummary}\n\n`;
    if (data.previousDayHealthLog) text += `Health Log:\n${data.previousDayHealthLog}\n\n`;
    if (data.inspirationalQuote) text += `Quote of the Day:\n${data.inspirationalQuote}\n\n`;
    if (data.chineseWordOfTheDay) {
      text += `Chinese Word of the Day: ${data.chineseWordOfTheDay.char} (${data.chineseWordOfTheDay.pinyin}) - ${data.chineseWordOfTheDay.translation}\n\n`;
    }
    text += data.closing;
    return text;
  }

  private formatReviewDataToHtml(data: DailyReviewData): string {
    let html = `<h2>${data.greeting}</h2>`;
    if (data.calendarEventsSummary) html += `<h3>Calendar:</h3><p>${data.calendarEventsSummary.replace(/\n/g, "<br>")}</p>`;
    if (data.projectActions && data.projectActions.length > 0) {
      html += "<h3>Project Actions:</h3><ul>";
      data.projectActions.forEach(p => {
        html += `<li><b>${p.projectName}:</b><ul>`;
        p.actions.forEach(a => html += `<li>${a}</li>`);
        html += "</ul></li>";
      });
      html += "</ul>";
    }
    if (data.weatherSummary) html += `<h3>Weather:</h3><p>${data.weatherSummary.replace(/\n/g, "<br>")}</p>`;
    if (data.previousDayHealthLog) html += `<h3>Health Log:</h3><p>${data.previousDayHealthLog.replace(/\n/g, "<br>")}</p>`;
    if (data.inspirationalQuote) html += `<h3>Quote of the Day:</h3><p><em>${data.inspirationalQuote}</em></p>`;
    if (data.chineseWordOfTheDay) {
      html += `<h3>Chinese Word of the Day:</h3><p>${data.chineseWordOfTheDay.char} (${data.chineseWordOfTheDay.pinyin}) - ${data.chineseWordOfTheDay.translation}</p>`;
    }
    html += `<p>${data.closing}</p>`;
    return html;
  }

  private async sendDailyReviewEmail(): Promise<void> {
    this.logMsg(LogLevel.INFO, 'Attempting to send daily review email...');
    if (!this.userConfig || !this.userConfig.deliveryChannels.email?.enabled || !this.userConfig.deliveryChannels.email.recipient) {
      this.logMsg(LogLevel.INFO, 'Email delivery for daily review is not enabled or recipient not set. Skipping.');
      return;
    }

    if (!this.coreServices) {
        this.logMsg(LogLevel.ERROR, "Cannot send daily review email: CoreServices not available.");
        return;
    }

    const emailService = this.coreServices.getService("EmailService") as EmailService | undefined;
    if (!emailService) {
      this.logMsg(LogLevel.ERROR, "EmailService not found when trying to send daily review. Email will not be sent.");
      return;
    }

    const reviewData = await this.getDailyReviewContentInternal();
    const htmlContent = this.formatReviewDataToHtml(reviewData);
    const recipient = this.userConfig.deliveryChannels.email.recipient;
    const subject = `Your Wooster Daily Review - ${new Date().toLocaleDateString()}`;

    const emailArgs: GmailPluginEmailArgs = {
      to: recipient,
      subject: subject,
      body: htmlContent,
      isHtml: true,
    };

    try {
      const result = await emailService.send(emailArgs);
      if (result.success) {
        this.logMsg(LogLevel.INFO, 'Daily review email sent successfully.', { recipient, messageId: result.messageId });
      } else {
        this.logMsg(LogLevel.ERROR, 'Failed to send daily review email.', { recipient, error: result.message });
      }
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, 'Exception while sending daily review email.', { recipient, error: error.message });
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.appConfig = config;
    this.coreServices = services;
    this.logMsg(LogLevel.INFO, `Initializing DailyReviewPlugin (v${this.version})...`);
    await this.loadDailyReviewConfig();

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
  },
});

    this.getDailyReviewHelpToolInstance = new DynamicTool({
      name: "get_daily_review_help",
      description: "Provides detailed help on configuring the Daily Review feature, including relevant config files and environment variables.",
      func: async () => {
        this.logMsg(LogLevel.DEBUG, "get_daily_review_help tool executed.");
        const cfg = this.userConfig || this.getDefaultUserConfig(); // Ensure we have a config object

        let helpText = `
**Wooster Daily Review - Configuration Guide**
---------------------------------------------

The Daily Review is a customizable summary designed to help you plan and stay informed.
Configuration is managed by editing the JSON configuration file and setting relevant environment variables.

**Primary Configuration File:** \`config/dailyReview.json\`

This file stores your personal settings for the Daily Review. It is not included in Git and will be created with default values if it doesn't exist.

**Initial Setup:**
To get started, or if you want to reset to a standard configuration, you can use the example file provided:
1. Copy the example configuration: \`cp config/dailyReview.example.json config/dailyReview.json\`
2. Customize \`config/dailyReview.json\` to your preferences.
   The \`config/dailyReview.example.json\` file serves as a template.

**Key Settings in \`config/dailyReview.json\`:**

*   **\`scheduleCron\`** (string):
    *   Defines when the daily review is automatically generated and delivered (if a delivery channel is enabled).
    *   Uses standard cron syntax (e.g., "0 8 * * *" for 8:00 AM daily).
    *   Current value: \`"${cfg.scheduleCron}"\`

*   **\`isDailyReviewEnabled\`** (boolean):
    *   Master switch to enable or disable the entire Daily Review feature.
    *   If \`false\`, the review won't be generated, and scheduled delivery won't occur.
    *   Current value: \`${cfg.isDailyReviewEnabled}\`

*   **\`hasCompletedInitialSetup\`** (boolean):
    *   Indicates if you have reviewed and saved your configuration at least once.
    *   Typically set to \`true\` automatically after the first successful save if you set a schedule or enable the review.
    *   You can manually set this to \`true\` in \`config/dailyReview.json\` once configured.
    *   Current value: \`${cfg.hasCompletedInitialSetup}\`

*   **\`contentModules\`** (object):
    *   Controls which sections appear in your daily review. Set to \`true\` to include, \`false\` to exclude.
`;

        for (const [moduleKey, isEnabled] of Object.entries(cfg.contentModules)) {
          let moduleDescription = "";
          switch (moduleKey) {
            case 'calendar': moduleDescription = "(Events from your primary calendar via Calendar plugin)"; break;
            case 'projectActions': moduleDescription = "(Next actions from actions.txt in 'home' and recent projects)"; break;
            case 'weather': moduleDescription = "(Forecast for your configured city via Weather plugin)"; break;
            case 'healthLog': moduleDescription = "(Summary of yesterday\'s health events from the Personal Health plugin)"; break;
            case 'inspirationalQuote': moduleDescription = "(Daily wisdom - Coming Soon!)"; break;
            case 'chineseWordOfTheDay': moduleDescription = "(Learn a new word - Coming Soon!)"; break;
            default: moduleDescription = "(User-defined module)";
          }
          helpText += `    *   **\`${moduleKey}\`**: \`${isEnabled}\` ${moduleDescription}\n`;
        }

        helpText += `
*   **\`deliveryChannels\`** (object):
    *   Configures how and where the daily review is delivered.
    *   Channels are auto-detected based on installed plugins/services that provide delivery capabilities.
`;

        if (Object.keys(cfg.deliveryChannels).length === 0) {
            helpText += "    *   No delivery channel services currently detected or configured.\n";
        }

        // Email Channel
        if (cfg.deliveryChannels.email || this.coreServices?.getService("EmailService")) {
          const emailCfg = cfg.deliveryChannels.email;
          helpText += `
    *   **Email Delivery (\`email\`):** (Requires Gmail Plugin and \`EmailService\`)
        *   **\`enabled\`** (boolean): Set to \`true\` to send the review via email.
            *   Current value: \`${emailCfg?.enabled ?? false}\`
        *   **\`recipient\`** (string, optional): Email address to send the review to.
            *   If not set, defaults to the \`GMAIL_USER_PERSONAL_EMAIL_ADDRESS\` from your \`.env\` file.
            *   Current value: \`"${emailCfg?.recipient || '(uses .env default)'}"\`
`;
    }
    
        // Placeholder for Discord
        if (cfg.deliveryChannels.discord || this.coreServices?.getService("DiscordService")) { // Assuming a "DiscordService"
            const discordCfg = cfg.deliveryChannels.discord; // Removed 'as any'
            helpText += `
    *   **Discord Delivery (\`discord\`):** (Requires a Discord Plugin/Service - Coming Soon!)
        *   **\`enabled\`** (boolean): Set to \`true\` to send via Discord.
            *   Current value: \`${discordCfg?.enabled ?? false}\`
        *   **\`webhookUrl\`** (string): The Discord webhook URL.
            *   Current value: \`"${discordCfg?.webhookUrl || '(not set)'}"\`
`;
        }
        // Add more delivery channels (Telegram, etc.) here as they are developed.

        helpText += `
**Relevant Environment Variables (\`.env\` file):**

These settings are configured in your main \`.env\` file at the root of the Wooster project.

*   **\`GMAIL_USER_PERSONAL_EMAIL_ADDRESS\`**:
    *   Used as the default recipient for email delivery if not specified in \`config/dailyReview.json\`.
    *   Current value: \`"${this.appConfig.gmail?.userPersonalEmailAddress || '(not set in .env or appConfig)'}"\`

*   **(Future) API Keys for Content Modules:**
    *   Some future content modules (e.g., a premium weather service, specific quote APIs) might require API keys to be set in the \`.env\` file. These will be documented as they are added.

**Applying Changes:**
*   Changes to \`config/dailyReview.json\` for content modules or delivery channel enablement/recipient usually take effect for the next generated review.
*   Changes to \`scheduleCron\` or enabling/disabling the entire review (\`isDailyReviewEnabled\`) typically require a Wooster restart for the scheduler to pick up the new settings.
*   Changes to \`.env\` variables always require a Wooster restart.

For any issues or to reset to defaults, you can delete \`config/dailyReview.json\`. It will be recreated on the next run.
`;
        return helpText.trim();
      }
    });

    this.logMsg(LogLevel.DEBUG, "Initialization complete. User config loaded. Agent tools instantiated.");
  }

  getAgentTools?(): any[] {
    const tools: any[] = [];
    if (this.dailyReviewAgentToolInstance) tools.push(this.dailyReviewAgentToolInstance);
    if (this.getDailyReviewHelpToolInstance) tools.push(this.getDailyReviewHelpToolInstance);
    return tools;
  }

  getScheduledTaskSetups?(): ScheduledTaskSetupOptions | ScheduledTaskSetupOptions[] | undefined {
    let isEnabled = false;
    let effectiveSchedule = this.getDefaultUserConfig().scheduleCron; // Fallback schedule
    let scheduleSource = "Plugin Default";

    if (this.userConfig) {
      isEnabled = this.userConfig.isDailyReviewEnabled && 
                  (this.userConfig.deliveryChannels.email?.enabled ?? false); // Ensure email channel is considered
      
      if (this.userConfig.isDailyReviewEnabled) {
        scheduleSource = "User Config: dailyReview.json (isDailyReviewEnabled=true)";
        if (this.userConfig.scheduleCron) {
          effectiveSchedule = this.userConfig.scheduleCron;
          // scheduleSource can be more specific if scheduleCron is from userConfig vs appConfig default
        }
      } else {
        scheduleSource = "User Config: dailyReview.json (isDailyReviewEnabled=false)";
      }
      
      if (!this.userConfig.deliveryChannels.email?.enabled && this.userConfig.isDailyReviewEnabled) {
        scheduleSource += " (Email delivery disabled in dailyReview.json)";
      }
    } else {
      // Should not happen if initialize ran correctly, but as a fallback:
      scheduleSource = "Error: User config not loaded";
      isEnabled = false;
    }
    
    // AppConfig can also provide a cron schedule, which userConfig might override or fall back to
    const appConfigDefaultCron = this.appConfig?.dailyReview?.scheduleCronExpression;
    if (this.userConfig && !this.userConfig.scheduleCron && appConfigDefaultCron) {
        // If userConfig exists but doesn't specify a cron, and appConfig has one
        effectiveSchedule = appConfigDefaultCron;
        if (scheduleSource === "User Config: dailyReview.json (isDailyReviewEnabled=true)") { // only if enabled by user
            scheduleSource = "AppConfig: dailyReview.scheduleCronExpression (via User Config)";
        }
    }

    if (!isEnabled) {
      this.logMsg(LogLevel.INFO, "Daily review email task not scheduled: disabled by user configuration or email channel disabled.");
      // Return definition so it can be listed as defined but disabled
    } else {
      this.logMsg(LogLevel.INFO, `Daily review email task will be scheduled. Effective Cron: ${effectiveSchedule}, Source: ${scheduleSource}`);
    }

    return {
      taskKey: "dailyReview.sendEmail",
      description: "Sends the Daily Review email based on user configuration.",
      defaultScheduleExpression: this.getDefaultUserConfig().scheduleCron, // Plugin's ultimate fallback default
      effectiveScheduleExpression: effectiveSchedule,
      isEnabledByPlugin: isEnabled,
      scheduleConfigSource: scheduleSource,
      functionToExecute: this.sendDailyReviewEmail.bind(this), 
      executionPolicy: "RUN_ONCE_PER_PERIOD_CATCH_UP",
      initialPayload: {}
    };
  }
}

// Helper function for date
function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default new DailyReviewPluginDefinition(); 