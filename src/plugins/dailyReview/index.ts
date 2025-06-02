import fs from 'fs/promises';
import path from 'path';
import { DynamicTool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { log, LogLevel } from '../../logger';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices, EmailService } from '../../types/plugin';
import { ScheduledTaskSetupOptions } from '../../types/scheduler';
import type { DailyReviewData, ProjectActionItem, GetWeatherForecastType, GetCalendarEventsType, DailyReviewUserConfig } from './types';
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
        fitnessLog: false,
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
    
    if (!this.userConfig) { // Should ideally not be reached if getDefaultUserConfig is robust
        this.logMsg(LogLevel.ERROR, 'User config is null after load/default. Using emergency default.');
        this.userConfig = this.getDefaultUserConfig();
        isNewConfig = true; // Treat as new if it was unexpectedly null
    }

    let configModified = false;

    // 1. Auto-populate delivery channels (for both new and existing configs if channel missing)
    if (this.coreServices?.getService("EmailService")) {
      if (!this.userConfig.deliveryChannels.email) {
        this.logMsg(LogLevel.INFO, 'EmailService detected. Adding default email channel to Daily Review config.');
        this.userConfig.deliveryChannels.email = {
          enabled: false, 
          recipient: this.appConfig.gmail?.userPersonalEmailAddress || undefined,
        };
        configModified = true;
      }
    }
    // Future: Add Discord, Telegram service checks here similarly

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
      if (this.coreServices?.getService("getCalendarEventsFunction")) {
        if (this.userConfig.contentModules.calendar === false) { 
            this.logMsg(LogLevel.INFO, 'Calendar service detected. Auto-enabling calendar content module for new config.');
            this.userConfig.contentModules.calendar = true;
            configModified = true;
        }
      }
      // Auto-enable fitnessLog if PersonalHealthService is available
      if (this.coreServices?.getService("personalHealthService")) {
        if (this.userConfig.contentModules.fitnessLog === false) { 
            this.logMsg(LogLevel.INFO, 'PersonalHealthService detected. Auto-enabling fitnessLog content module for new config.');
            this.userConfig.contentModules.fitnessLog = true;
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
      return { greeting: "Error: Daily review content generation failed (core services missing).", calendarEventsSummary: "- Error -", projectActions: [], weatherSummary: "- Error -", fitnessLogSummary: undefined, closing: "" };
    }
    this.logMsg(LogLevel.INFO, 'Generating daily review content structure...');
    const userCfg = this.userConfig || this.getDefaultUserConfig();
  
    let calendarData = "- (Not enabled or service not available)";
    if (userCfg.contentModules.calendar) {
      const getCalendarEventsFunc = this.coreServices.getService("getCalendarEventsFunction") as GetCalendarEventsType | undefined;
      if (getCalendarEventsFunc) {
        try {
          calendarData = await getCalendarEventsFunc();
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, "Error fetching calendar events.", { error: error.message });
          calendarData = "- Error fetching calendar events.";
        }
      } else {
          this.logMsg(LogLevel.WARN, "getCalendarEventsFunction service not found.");
      }
    }
  
    let projActions: ProjectActionItem[] = [];
    if (userCfg.contentModules.projectActions) {
        const nextActionsService = this.coreServices.NextActionsService;
        if (nextActionsService) {
            try {
                const rawActions = await nextActionsService.getAggregatedActions(false); 
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
    
    let fitnessLogSummaryData: { date: string; content: string; } | undefined = undefined;
    if (userCfg.contentModules.fitnessLog) {
        const healthService = this.coreServices.getService("personalHealthService") as PersonalHealthService | undefined;
        if (healthService) {
            try {
                const summaryObject = healthService.getLatestWorkoutSummaryForReview(); 
                if (summaryObject) {
                    fitnessLogSummaryData = summaryObject;
                    this.logMsg(LogLevel.INFO, 'Fitness log summary fetched via PersonalHealthService.', { date: summaryObject.date });
                } else {
                    this.logMsg(LogLevel.INFO, 'No fitness log entry found for today via PersonalHealthService.');
                }
            } catch (error: any) {
                this.logMsg(LogLevel.ERROR, "Error fetching fitness log from PersonalHealthService.", { error: error.message });
            }
        } else {
            this.logMsg(LogLevel.WARN, "PersonalHealthService not found. Cannot fetch fitness log.");
        }
    }

    const reviewData: DailyReviewData = {
        greeting: "Good morning! Here is your daily review from Wooster:",
        calendarEventsSummary: calendarData,
        projectActions: projActions,
        weatherSummary: weatherData,
        fitnessLogSummary: fitnessLogSummaryData,
        closing: "Have a productive day!"
    };
    this.logMsg(LogLevel.INFO, 'Daily review data structure generated.');
    return reviewData;
  }

  private formatReviewDataToHtml(data: DailyReviewData): string {
    const today = new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
    let html = `
      <html><head><style>
      body { font-family: sans-serif; line-height: 1.6; margin: 20px; color: #333; }
      h1 { color: #2c3e50; font-size: 24px; }
      h2 { color: #34495e; font-size: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 30px; }
      ul { list-style-type: none; padding-left: 0; }
      li { margin-bottom: 8px; }
      .project-actions strong { color: #2980b9; }
      .weather { margin-top: 20px; padding: 10px; background-color: #f9f9f9; border-radius: 5px; }
      .fitness-log { margin-top: 20px; padding: 10px; background-color: #e8f5e9; border-radius: 5px; }
      .fitness-log .date-prefix { font-style: italic; color: #555; font-size: 0.9em; }
      .footer { margin-top: 30px; font-size: 12px; color: #7f8c8d; }
      </style></head><body>
      <h1>Wooster's Daily Review</h1>
      <p>${data.greeting.replace(/\n/g, "<br>")}</p>
    `;
    if (this.userConfig?.contentModules.calendar) {
        html += `<h2>Today's Calendar Events</h2><div>${data.calendarEventsSummary.replace(/\n/g, "<br>")}</div>`;
    }
    if (this.userConfig?.contentModules.projectActions) {
        html += `<h2>Next Actions</h2>`;
        if (data.projectActions && data.projectActions.length > 0) {
            data.projectActions.forEach(pa => {
            html += `<div class="project-actions"><strong>${pa.projectName}:</strong><ul>`;
            pa.actions.forEach(action => { html += `<li>- ${action}</li>`; });
            html += `</ul></div>`;
            });
        } else {
            html += "<p>No specific actions found.</p>";
        }
    }
    if (this.userConfig?.contentModules.weather) {
        html += `<div class="weather"><h2>Weather Forecast</h2><p>${data.weatherSummary.replace(/\n/g, "<br>")}</p></div>`;
    }

    if (this.userConfig?.contentModules.fitnessLog && data.fitnessLogSummary && data.fitnessLogSummary.content) {
        html += `<div class="fitness-log"><h2>Latest Fitness Log</h2><p><span class="date-prefix">For ${data.fitnessLogSummary.date}:</span><br>${data.fitnessLogSummary.content.replace(/\n/g, "<br>")}</p></div>`;
    }
    
    html += `<p class="footer">${data.closing.replace(/\n/g, "<br>")}</p></body></html>`;
    return html;
  }

  private async sendDailyReviewEmail(): Promise<void> {
    if (!this.coreServices || !this.userConfig) {
      this.logMsg(LogLevel.ERROR, "Cannot send daily review: core services or user config not available.");
      return;
    }
    if (!this.userConfig.isDailyReviewEnabled || !this.userConfig.deliveryChannels.email.enabled) {
      this.logMsg(LogLevel.INFO, "Daily review email not sent: disabled by user configuration.");
    return;
  }
  
    const emailService = this.coreServices.getService("EmailService") as EmailService | undefined;
  if (!emailService) {
      this.logMsg(LogLevel.ERROR, "EmailService not found. Cannot send daily review email.");
    return;
  }

    const recipientEmail = this.userConfig.deliveryChannels.email.recipient || this.appConfig.gmail?.userPersonalEmailAddress;
  if (!recipientEmail) {
      this.logMsg(LogLevel.WARN, "User personal email address (recipient) not set. Cannot send daily review.");
    return;
  }

    this.logMsg(LogLevel.INFO, "Attempting to generate and send daily review email...");
  try {
      const reviewData = await this.getDailyReviewContentInternal();
      const emailHtmlBody = this.formatReviewDataToHtml(reviewData);
    const today = new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
    const subject = `Wooster's Daily Review - ${today}`;

      const emailArgs: GmailPluginEmailArgs = {
      to: recipientEmail,
      subject: subject,
      body: emailHtmlBody,
      isHtml: true,
    };

      this.logMsg(LogLevel.DEBUG, "Sending daily review email via EmailService...", { to: recipientEmail, subject });
    const sendResult = await emailService.send(emailArgs);
    
    if (sendResult.success) {
        this.logMsg(LogLevel.INFO, `Daily review email sent successfully to ${recipientEmail}. Message ID: ${sendResult.messageId}`);
    } else {
        this.logMsg(LogLevel.ERROR, `Failed to send daily review email to ${recipientEmail}.`, { error: sendResult.message, details: sendResult.error });
    }
  } catch (error: any) {
      this.logMsg(LogLevel.ERROR, "Unexpected error generating or sending daily review email.", { error: error.message, stack: error.stack });
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

This file is created automatically with default values when the plugin first runs or if it's missing.
You can edit this file directly to customize your Daily Review.

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
            case 'fitnessLog': moduleDescription = "(Latest workout summary from the Personal Health plugin)"; break;
            case 'inspirationalQuote': moduleDescription = "(Daily wisdom - Coming Soon!)"; break;
            case 'chineseWordOfTheDay': moduleDescription = "(Learn a new word - Coming Soon!)"; break;
            default: moduleDescription = "(User-defined module)";
          }
          helpText += `    *   **\`${moduleKey}\`**: \`${isEnabled}\` ${moduleDescription}\\n`;
        }

        helpText += `
*   **\`deliveryChannels\`** (object):
    *   Configures how and where the daily review is delivered.
    *   Channels are auto-detected based on installed plugins/services that provide delivery capabilities.
`;

        if (Object.keys(cfg.deliveryChannels).length === 0) {
            helpText += "    *   No delivery channel services currently detected or configured.\\n";
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
    if (!this.userConfig || !this.userConfig.isDailyReviewEnabled || !this.userConfig.deliveryChannels.email.enabled) {
      this.logMsg(LogLevel.INFO, "Daily review email task not scheduled: disabled by user configuration or email channel disabled.");
      return undefined; // Do not schedule if not enabled by user or email is off
    }

    const schedule = this.userConfig.scheduleCron || 
                     this.appConfig?.dailyReview?.scheduleCronExpression || 
                     this.getDefaultUserConfig().scheduleCron; // Ultimate fallback
    
    this.logMsg(LogLevel.INFO, `Daily review email task will be scheduled with cron: ${schedule}`);
    return {
      taskKey: "dailyReview.sendEmail",
      description: "Sends the Daily Review email based on user configuration.",
      defaultScheduleExpression: schedule, 
      // configKeyForSchedule is less relevant now as we read directly from userConfig
      functionToExecute: this.sendDailyReviewEmail.bind(this), // Bind 'this' context
      executionPolicy: "RUN_ONCE_PER_PERIOD_CATCH_UP",
      initialPayload: {}
    };
  }
}

export default new DailyReviewPluginDefinition(); 