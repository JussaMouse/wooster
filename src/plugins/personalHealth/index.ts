import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { DynamicTool } from 'langchain/tools';
import { LogLevel } from '../../logger';
import { PersonalHealthService, HealthSummaryOptions, GetHealthLogLinesOptions, HealthReportOptions } from './types';
import { appendHealthEvent, getHealthLogLines, setPaths, writeHealthReport } from './fileManager';
import { ScheduledTaskSetupOptions } from '../../types/scheduler';
import path from 'path'; // Import path module
import * as fs from 'fs'; // Import fs for ensureDirExists
// import * as chrono from 'chrono-node'; // Future: for natural language date parsing

const DEFAULT_SUMMARY_LINES = 5;
const HUMAN_READABLE_REPORT_FILENAME = 'health.md';
const DEFAULT_HEALTH_DIR = './health/'; // Default directory for health files

class PersonalHealthPluginDefinition implements WoosterPlugin, PersonalHealthService {
  static readonly pluginName = "personalHealth";
  static readonly version = '2.1.0';
  static readonly description = 'Manages personal health data by logging events to a configurable health directory.';

  readonly name = PersonalHealthPluginDefinition.pluginName;
  readonly version = PersonalHealthPluginDefinition.version;
  readonly description = PersonalHealthPluginDefinition.description;
  
  private coreServices!: CoreServices;
  private appConfig!: AppConfig;
  private workspaceRoot!: string;
  private healthDir!: string;

  private logMsg(level: LogLevel, message: string, metadata?: object) {
    if (this.coreServices && this.coreServices.log) {
      this.coreServices.log(level, `[${PersonalHealthPluginDefinition.pluginName} Plugin v${PersonalHealthPluginDefinition.version}] ${message}`, metadata);
    } else {
      // Fallback if coreServices or log is not yet available (e.g. very early init)
      console.log(`[${level}][${PersonalHealthPluginDefinition.pluginName} Plugin v${PersonalHealthPluginDefinition.version}] ${message}`, metadata || '');
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.coreServices = services;
    this.appConfig = config;
    this.workspaceRoot = process.cwd();
    this.logMsg(LogLevel.INFO, `Initializing...`);

    this.healthDir = config.personalHealth?.healthDir ?? DEFAULT_HEALTH_DIR;
    this.logMsg(LogLevel.INFO, `Using health directory: ${this.healthDir}`);

    setPaths(this.workspaceRoot, this.healthDir); // Pass both workspace and specific health dir
    this.logMsg(LogLevel.INFO, `Paths for health log file manager configured.`);

    this.ensureDirExists(this.getFullPath(this.healthDir));

    this.coreServices.registerService('PersonalHealthService', this);
    this.logMsg(LogLevel.INFO, `Service 'PersonalHealthService' registered.`);
  }

  private getFullPath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
        return relativePath;
    }
    return path.join(this.workspaceRoot, relativePath);
  }

  private ensureDirExists(dirPath: string): void {
    // dirPath here is expected to be an absolute path or resolvable from cwd by getFullPath if called with relative.
    // However, ensureDirExists is called with getFullPath(this.healthDir), which is already absolute.
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      this.logMsg(LogLevel.INFO, `Created directory ${dirPath}`);
    }
  }

  async logHealthEvent(text: string): Promise<void> {
    if (!text || text.trim() === '') {
      this.logMsg(LogLevel.WARN, `logHealthEvent called with empty text.`);
      return Promise.resolve();
    }

    try {
      await appendHealthEvent(text);
      this.logMsg(LogLevel.INFO, `Health event logged: ${text}`);
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, `Error logging health event: ${text}`, { error: error.message });
      throw error;
    }
  }

  async getHealthEvents(options?: GetHealthLogLinesOptions): Promise<string[]> {
    this.logMsg(LogLevel.DEBUG, `getHealthEvents called`, { options });
    try {
      const effectiveOptions = { sort: 'desc' as 'desc' | 'asc', ...options }; 
      return await getHealthLogLines(effectiveOptions);
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, `Error in getHealthEvents`, { error: error.message });
      return [];
    }
  }

  async getLatestHealthSummaryForReview(options?: HealthSummaryOptions): Promise<string | null> {
    this.logMsg(LogLevel.DEBUG, `getLatestHealthSummaryForReview called`, { options });
    const linesToFetch = options?.numberOfLines || DEFAULT_SUMMARY_LINES;
    const filterText = options?.containsText;
    const sortOrder = options?.sort || 'desc'; 

    try {
      const relevantLines = await getHealthLogLines({
        limit: linesToFetch,
        containsText: filterText,
        sort: sortOrder,
      });

      if (relevantLines.length === 0) {
        if (filterText) {
          return `No recent health entries found containing "${filterText}".`;
        }
        return "No recent health entries found.";
      }
      return relevantLines.join('\n'); 
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, `Error in getLatestHealthSummaryForReview`, { error: error.message });
      return "Error retrieving health summary.";
    }
  }

  async generateHealthReport(options?: HealthReportOptions): Promise<string> {
    this.logMsg(LogLevel.INFO, `Generating health report...`, { options });
    try {
      const allEvents = await getHealthLogLines({ sort: 'asc' });

      const reportFilePath = this.getFullPath(path.join(this.healthDir, HUMAN_READABLE_REPORT_FILENAME));

      if (allEvents.length === 0) {
        // Use template literal for multi-line string
        await writeHealthReport(`# Personal Health Log\n\nNo health events recorded yet.`, reportFilePath);
        this.logMsg(LogLevel.INFO, `No health events to report. Empty report generated at ${reportFilePath}`);
        return `Health report generated. No events. Report at: ${reportFilePath}`;
      }

      const eventsByDate: Record<string, string[]> = {};
      allEvents.forEach(eventLine => {
        const dateKey = eventLine.substring(0, 10); 
        const timeAndText = eventLine.substring(11); 
        if (!eventsByDate[dateKey]) {
          eventsByDate[dateKey] = [];
        }
        eventsByDate[dateKey].push(timeAndText);
      });

      // Use template literals for multi-line string construction
      let reportContent = `# Personal Health Log\n\n`;
      const sortedDates = Object.keys(eventsByDate).sort().reverse(); 
      
      for (const date of sortedDates) {
        reportContent += `## ${date}\n`;
        eventsByDate[date].forEach(entry => {
          reportContent += `- ${entry}\n`;
        });
        reportContent += `\n`; // Add an extra newline after each day's entries
      }
      
      // const reportPath = `${this.appConfig.fileSystem.basePath}/${HUMAN_READABLE_REPORT_FILENAME}`; // Old way
      await writeHealthReport(reportContent.trim(), reportFilePath); // trim potential trailing newline from content
      this.logMsg(LogLevel.INFO, `Health report successfully generated at ${reportFilePath}`);
      return `Health report generated successfully. Report at: ${reportFilePath}`;

    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, `Error generating health report`, { error: error.message });
      throw new Error(`Failed to generate health report: ${error.message}`);
    }
  }

  getAgentTools?(): DynamicTool[] {
    const logHealthTool = new DynamicTool({
      name: "logHealthEvent",
      description: "Logs a health-related event (e.g., 'ran 3 miles', 'slept 8 hours', 'mood: energetic'). The entry will be timestamped with the current local time.",
      func: async (input: string): Promise<string> => {
        try {
          await this.logHealthEvent(input);
          return `Health event "${input}" logged successfully.`;
        } catch (error: any) {
          // Log using the class method for consistency, though it might be redundant if logHealthEvent already logged
          this.logMsg(LogLevel.ERROR, `Error in logHealthEvent tool execution for input: ${input}`, { error: error.message });
          return `Error logging health event: ${error.message || 'Unknown error'}`;
        }
      },
    });

    const generateReportTool = new DynamicTool({
      name: "generateHealthReport",
      description: "Generates a human-readable health report (health.md) by processing the raw health event logs. The report groups entries by date.",
      func: async (): Promise<string> => {
        try {
          // We can pass options here in the future if needed based on user input
          return await this.generateHealthReport();
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, "Error in generateHealthReport tool execution", { error: error.message });
          return `Error generating health report: ${error.message || 'Unknown error'}`;
        }
      },
    });

    return [logHealthTool, generateReportTool];
  }

  getScheduledTaskSetups?(): ScheduledTaskSetupOptions | ScheduledTaskSetupOptions[] | undefined {
    const envVarToggle = process.env.PLUGIN_PERSONALHEALTH_DAILY_MARKDOWN_ENABLED;
    let isEnabled = true;
    let configSource = "Plugin Default (Enabled)";

    if (envVarToggle && envVarToggle.toLowerCase() === 'false') {
      this.logMsg(LogLevel.INFO, `Scheduled daily report generation is DISABLED via PLUGIN_PERSONALHEALTH_DAILY_MARKDOWN_ENABLED environment variable.`);
      // We still return the definition so it can be listed in the manifest as "Defined but Disabled"
      isEnabled = false;
      configSource = "Env: PLUGIN_PERSONALHEALTH_DAILY_MARKDOWN_ENABLED=false";
    } else if (envVarToggle && envVarToggle.toLowerCase() === 'true') {
      this.logMsg(LogLevel.INFO, `Scheduled daily report generation is ENABLED via PLUGIN_PERSONALHEALTH_DAILY_MARKDOWN_ENABLED environment variable.`);
      configSource = "Env: PLUGIN_PERSONALHEALTH_DAILY_MARKDOWN_ENABLED=true";
    } else {
      this.logMsg(LogLevel.INFO, `Scheduled daily report generation is ENABLED (PLUGIN_PERSONALHEALTH_DAILY_MARKDOWN_ENABLED is not set, defaults to enabled).`);
      // Default state, configSource remains "Plugin Default (Enabled)"
    }

    const defaultSchedule = "0 5 * * *";
    let effectiveSchedule = defaultSchedule;
    let scheduleSource = "Plugin Default";

    const appConfigSchedule = (this.appConfig?.plugins?.personalHealth as any)?.dailyReportCron;
    if (appConfigSchedule) {
      effectiveSchedule = appConfigSchedule;
      scheduleSource = "AppConfig: plugins.personalHealth.dailyReportCron";
      if (configSource.startsWith("Env:")) { // Env var for enable/disable takes precedence for source clarity if it also influences schedule implicitly
        configSource = `${configSource} (Schedule: ${scheduleSource})`;
      } else {
        configSource = scheduleSource; // If only schedule is from AppConfig
      }
    }

    this.logMsg(LogLevel.INFO, `Setting up scheduled task for health report. Effective Cron: ${effectiveSchedule}, Enabled: ${isEnabled}, Source: ${configSource}`);

    return {
      taskKey: "personalHealth.generateDailyReport",
      description: "Generates the daily health.md report from health_events.log.md.",
      defaultScheduleExpression: defaultSchedule, // The plugin's hardcoded default
      effectiveScheduleExpression: effectiveSchedule, // Calculated schedule
      isEnabledByPlugin: isEnabled, // Calculated enabled status
      scheduleConfigSource: configSource, // How schedule/enabled status was derived
      functionToExecute: async (payload: any) => { 
        try {
          await this.generateHealthReport(); // Call original function, ignore string result
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, `Error during scheduled health report generation.`, { error: error.message });
          // Optionally, rethrow or handle as per scheduler error policies
        }
      },
      executionPolicy: "RUN_ONCE_PER_PERIOD_CATCH_UP",
      initialPayload: {} 
    };
  }
}

export default PersonalHealthPluginDefinition; 