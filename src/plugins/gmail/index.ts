import nodemailer from 'nodemailer';
import { z } from 'zod'; // For potential future input validation for the tool
import { StructuredTool } from 'langchain/tools'; // Changed back to StructuredTool
import { AppConfig } from '../../configLoader'; // For AppConfig type
import { WoosterPlugin, CoreServices, EmailService } from '../../types/plugin';
import { LogLevel } from '../../logger'; // Import LogLevel
import type { GmailPluginEmailArgs, GmailPluginSendEmailResult } from './types';
import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'; // Refined import path

// Placeholder for self-email, defined within the plugin
const SELF_EMAIL_PLACEHOLDER = 'SELF_EMAIL_RECIPIENT';

// Define the Zod schema for the send_email tool's input
const sendEmailSchema = z.object({
  to: z.string().describe("The recipient's email address. Can be a comma-separated list for multiple recipients."),
  subject: z.string().describe("The subject of the email."),
  body: z.string().describe("The main content/body of the email."),
  isHtml: z.boolean().optional().describe("Set to true if the body content is HTML. Defaults to false (plain text).")
});

type SendEmailSchemaType = z.infer<typeof sendEmailSchema>;

// Define the new Structured Tool class, extending StructuredTool
class SendEmailStructuredTool extends StructuredTool {
  // `lc_name` is not typically needed when extending StructuredTool directly with these properties
  // It's more for dynamic tool registration or complex inheritance scenarios.

  name = "send_email";
  description = "Sends an email with the specified 'to', 'subject', and 'body'. Optionally, 'isHtml' can be set for HTML emails.";
  schema = sendEmailSchema; // This is the Zod schema for the input arguments
  
  private pluginInstance: GmailPluginDefinition;

  constructor(pluginInstance: GmailPluginDefinition) {
    super();
    this.pluginInstance = pluginInstance;
  }

  protected async _call(args: SendEmailSchemaType, runManager?: CallbackManagerForToolRun): Promise<string> { // Added runManager
    this.pluginInstance.logMsg(LogLevel.DEBUG, "send_email tool executed (SendEmailStructuredTool).", { args });
    try {
      // The 'args' object is already parsed by LangChain according to the 'schema'
      const result = await this.pluginInstance.send(args); // No need to cast if SendEmailSchemaType is compatible with GmailPluginEmailArgs
      return JSON.stringify(result);
    } catch (error: any) {
      this.pluginInstance.logMsg(LogLevel.ERROR, "SendEmailStructuredTool: Error processing or sending email.", { error: error.message, inputArgs: args });
      return JSON.stringify({ success: false, message: `Error processing email arguments or sending: ${error.message}` });
    }
  }
}

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
  private sendEmailToolInstance!: SendEmailStructuredTool;

  // Renamed logMsg to avoid conflict with Tool's internal properties if any, and to be specific to plugin
  public logMsg(level: LogLevel, message: string, metadata?: object) { // Made public for the tool
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

    this.sendEmailToolInstance = new SendEmailStructuredTool(this);
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

  getAgentTools?(): SendEmailStructuredTool[] { // Return type made more specific
    if (this.isConfigured() && this.sendEmailToolInstance) {
      this.logMsg(LogLevel.DEBUG, 'Providing send_email tool because plugin is configured.');
      return [this.sendEmailToolInstance]; 
    }
    this.logMsg(LogLevel.DEBUG, 'Not providing send_email tool because plugin is not configured or tool not initialized.');
    return [];
  }
}

export default GmailPluginDefinition; 