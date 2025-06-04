import nodemailer from 'nodemailer';
import { z } from 'zod'; // For potential future input validation for the tool
import { DynamicTool } from 'langchain/tools';
import { AppConfig } from '../../configLoader'; // For AppConfig type
import { WoosterPlugin, CoreServices, EmailService } from '../../types/plugin';
import { LogLevel } from '../../logger'; // Import LogLevel
import type { GmailPluginEmailArgs, GmailPluginSendEmailResult } from './types';

// Placeholder for self-email, defined within the plugin
const SELF_EMAIL_PLACEHOLDER = 'SELF_EMAIL_RECIPIENT';

class GmailPluginDefinition implements WoosterPlugin, EmailService {
  static readonly pluginName = "gmail";
  static readonly version = "1.0.0";
  static readonly description = "Provides email sending capabilities via Gmail.";

  readonly name = GmailPluginDefinition.pluginName;
  readonly version = GmailPluginDefinition.version;
  readonly description = GmailPluginDefinition.description;

  private senderEmailAddress: string | null = null;
  private emailAppPassword: string | null = null;
  private coreServicesInstance: CoreServices | null = null;
  private sendEmailToolInstance!: DynamicTool; // Instance property for the tool

  private logMsg(level: LogLevel, message: string, metadata?: object) {
    if (this.coreServicesInstance && this.coreServicesInstance.log) {
      this.coreServicesInstance.log(level, `[${GmailPluginDefinition.pluginName} Plugin v${GmailPluginDefinition.version}] ${message}`, metadata);
    } else {
      console.log(`[${level}][${GmailPluginDefinition.pluginName} Plugin v${GmailPluginDefinition.version}] ${message}`, metadata || '');
    }
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.coreServicesInstance = services;
    this.logMsg(LogLevel.INFO, `Initializing...`);

    const gmailConfig = config.gmail;

    if (gmailConfig && gmailConfig.senderEmailAddress && gmailConfig.emailAppPassword) {
      this.senderEmailAddress = gmailConfig.senderEmailAddress;
      this.emailAppPassword = gmailConfig.emailAppPassword;
      
      services.registerService("EmailService", this);
      this.logMsg(LogLevel.INFO, "EmailService registered. Ready to send emails.");
    } else {
      this.logMsg(LogLevel.WARN, "Configuration for senderEmailAddress or emailAppPassword not found in config.gmail. Email functionality will be disabled.");
    }

    // Define the tool here so it has access to 'this'
    this.sendEmailToolInstance = new DynamicTool({
      name: "send_email",
      description: "Sends an email. Input should be a JSON string with 'to', 'subject', and 'body'. 'isHtml' (boolean) is optional for HTML emails.",
      func: async (jsonInput: string) => {
        this.logMsg(LogLevel.DEBUG, "send_email tool executed.", { input: jsonInput});
        try {
          const toolArgs = JSON.parse(jsonInput) as GmailPluginEmailArgs;
          if (!toolArgs.to || !toolArgs.subject || !toolArgs.body) {
            this.logMsg(LogLevel.WARN, "SendEmailTool: Invalid arguments. 'to', 'subject', and 'body' are required.", { args: toolArgs });
            return JSON.stringify({ success: false, message: "Invalid arguments. 'to', 'subject', and 'body' are required." });
          }
          // Directly call the instance's send method, which calls the private _sendGmailInternal
          const result = await this.send(toolArgs); 
          return JSON.stringify(result);
        } catch (error: any) {
          this.logMsg(LogLevel.ERROR, "SendEmailTool: Error processing or sending email.", { error: error.message, input: jsonInput });
          return JSON.stringify({ success: false, message: `Error processing email arguments or sending: ${error.message}` });
        }
      },
    });
  }

  // Helper methods, now private as they are internal details
  private getSenderEmail(): string | null { return this.senderEmailAddress; }
  private getAppPassword(): string | null { return this.emailAppPassword; }
  private isConfigured(): boolean { return !!(this.senderEmailAddress && this.emailAppPassword && this.coreServicesInstance); }

  // Make the actual sending logic a private method
  private async _sendGmailInternal(args: GmailPluginEmailArgs): Promise<GmailPluginSendEmailResult> {
    if (!this.isConfigured()) {
        this.logMsg(LogLevel.ERROR, "_sendGmailInternal called but plugin not configured.");
        return { success: false, message: "Email plugin not configured.", messageId: undefined };
    }
    
    // isConfigured() ensures these are not null.
    const senderEmail = this.getSenderEmail()!;
    const appPassword = this.getAppPassword()!;
  
    this.logMsg(LogLevel.INFO, "Attempting to send email...", { to: args.to, subject: args.subject });
  
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: appPassword,
      },
    });
  
    const mailOptions: nodemailer.SendMailOptions = {
      from: senderEmail,
      to: args.to,
      subject: args.subject,
      text: args.isHtml ? undefined : args.body,
      html: args.isHtml ? args.body : undefined,
    };
  
    try {
      const info = await transporter.sendMail(mailOptions);
      this.logMsg(LogLevel.INFO, `Email sent successfully to ${args.to}. Message ID: ${info.messageId}`);
      return { success: true, message: `Email sent successfully to ${args.to}`, messageId: info.messageId };
    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, `Failed to send email to ${args.to}`, { error: error.message, stack: error.stack });
      return { success: false, message: `Failed to send email: ${error.message}`, error, messageId: undefined };
    }
  }

  // Public send method for the EmailService interface
  async send(args: GmailPluginEmailArgs): Promise<GmailPluginSendEmailResult> {
    return this._sendGmailInternal(args);
  }

  getAgentTools?(): DynamicTool[] {
    if (this.isConfigured() && this.sendEmailToolInstance) { // Check if tool instance exists
      this.logMsg(LogLevel.DEBUG, 'Providing send_email tool because plugin is configured.');
      return [this.sendEmailToolInstance]; 
    }
    this.logMsg(LogLevel.DEBUG, 'Not providing send_email tool because plugin is not configured or tool not initialized.');
    return [];
  }
}

export default GmailPluginDefinition; 