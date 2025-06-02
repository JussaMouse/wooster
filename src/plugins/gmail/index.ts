import nodemailer from 'nodemailer';
import { z } from 'zod'; // For potential future input validation for the tool
import { DynamicTool } from '@langchain/core/tools';
import { AppConfig } from '../../configLoader'; // For AppConfig type
import { WoosterPlugin, CoreServices, EmailService } from '../../types/plugin';
import { LogLevel } from '../../logger'; // Import LogLevel
import type { GmailPluginEmailArgs, GmailPluginSendEmailResult } from './types';

// Placeholder for self-email, defined within the plugin
const SELF_EMAIL_PLACEHOLDER = 'SELF_EMAIL_RECIPIENT';

let gmailPluginDefinitionInstance: GmailPluginDefinition | null = null;

// The actual email sending logic, now internal to the plugin
async function sendGmailInternal(args: GmailPluginEmailArgs): Promise<GmailPluginSendEmailResult> {
  if (!gmailPluginDefinitionInstance || !gmailPluginDefinitionInstance.isConfigured()) {
    console.error("GmailPlugin Internal: sendGmailInternal called but plugin not configured or instance not set.");
    return { success: false, message: "Email plugin not configured or instance not available.", messageId: undefined };
  }
  
  const core = gmailPluginDefinitionInstance.getInternalCoreServices();
  const senderEmail = gmailPluginDefinitionInstance.getSenderEmail();
  const appPassword = gmailPluginDefinitionInstance.getAppPassword();

  // isConfigured() ensures these are not null and core is not null.
  if (!core || !senderEmail || !appPassword) {
      // This should not be reached if isConfigured() is correct, but as a safeguard:
      console.error("GmailPlugin Internal: Null values after isConfigured check. This indicates an issue with isConfigured or getters.");
      return { success: false, message: "Internal configuration error.", messageId: undefined };
  }

  core.log(LogLevel.INFO, "GmailPlugin: Attempting to send email...", { to: args.to, subject: args.subject });

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: senderEmail, // Now senderEmail is confirmed string
      pass: appPassword, // Now appPassword is confirmed string
    },
  });

  const mailOptions: nodemailer.SendMailOptions = {
    from: senderEmail, // Now senderEmail is confirmed string
    to: args.to,
    subject: args.subject,
    text: args.isHtml ? undefined : args.body,
    html: args.isHtml ? args.body : undefined,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    core.log(LogLevel.INFO, `GmailPlugin: Email sent successfully to ${args.to}. Message ID: ${info.messageId}`);
    return { success: true, message: `Email sent successfully to ${args.to}`, messageId: info.messageId };
  } catch (error: any) {
    core.log(LogLevel.ERROR, `GmailPlugin: Failed to send email to ${args.to}`, { error: error.message, stack: error.stack });
    return { success: false, message: `Failed to send email: ${error.message}`, error, messageId: undefined };
  }
}

// Agent Tool Definition
const sendEmailTool = new DynamicTool({
  name: "send_email",
  description: "Sends an email. Input should be a JSON string with 'to', 'subject', and 'body'. 'isHtml' (boolean) is optional for HTML emails.",
  func: async (jsonInput: string) => {
    if (!gmailPluginDefinitionInstance) {
      return JSON.stringify({ success: false, message: "GmailPlugin instance not available for tool execution." });
    }
    const core = gmailPluginDefinitionInstance.getInternalCoreServices();
    try {
      const toolArgs = JSON.parse(jsonInput) as GmailPluginEmailArgs;
      if (!toolArgs.to || !toolArgs.subject || !toolArgs.body) {
        core?.log(LogLevel.WARN, "SendEmailTool: Invalid arguments. 'to', 'subject', and 'body' are required.", { args: toolArgs });
        return JSON.stringify({ success: false, message: "Invalid arguments. 'to', 'subject', and 'body' are required." });
      }
      const result = await gmailPluginDefinitionInstance.send(toolArgs);
      return JSON.stringify(result);
    } catch (error: any) {
      core?.log(LogLevel.ERROR, "SendEmailTool: Error processing or sending email.", { error: error.message, input: jsonInput });
      return JSON.stringify({ success: false, message: `Error processing email arguments or sending: ${error.message}` });
    }
  },
});

class GmailPluginDefinition implements WoosterPlugin, EmailService {
  readonly name = "gmail";
  readonly version = "1.0.0";
  readonly description = "Provides email sending capabilities via Gmail.";

  private senderEmailAddress: string | null = null;
  private emailAppPassword: string | null = null;
  private coreServicesInstance: CoreServices | null = null;

  constructor() {
    gmailPluginDefinitionInstance = this; // Make instance globally available in this module for tool func
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.coreServicesInstance = services;
    this.coreServicesInstance.log(LogLevel.INFO, `GmailPlugin (v${this.version}): Initializing...`);

    const gmailConfig = config.gmail;

    if (gmailConfig && gmailConfig.senderEmailAddress && gmailConfig.emailAppPassword) {
      this.senderEmailAddress = gmailConfig.senderEmailAddress;
      this.emailAppPassword = gmailConfig.emailAppPassword;
      
      services.registerService("EmailService", this);
      this.coreServicesInstance.log(LogLevel.INFO, "GmailPlugin: EmailService registered. Ready to send emails.");
    } else {
      this.coreServicesInstance.log(LogLevel.WARN, "GmailPlugin: Configuration for senderEmailAddress or emailAppPassword not found in config.gmail. Email functionality will be disabled.");
    }
  }

  // These helpers are fine for internal use by sendGmailInternal via the module-scoped instance
  public getSenderEmail(): string | null { return this.senderEmailAddress; }
  public getAppPassword(): string | null { return this.emailAppPassword; }
  public isConfigured(): boolean { return !!(this.senderEmailAddress && this.emailAppPassword && this.coreServicesInstance); }
  public getInternalCoreServices(): CoreServices | null { return this.coreServicesInstance; }

  async send(args: GmailPluginEmailArgs): Promise<GmailPluginSendEmailResult> {
    // Now sendGmailInternal will use the instance methods to get config and coreServices
    return sendGmailInternal(args);
  }

  getAgentTools?(): DynamicTool[] {
    if (this.isConfigured()) {
      this.coreServicesInstance?.log(LogLevel.DEBUG, 'GmailPlugin: Providing send_email tool because plugin is configured.');
      return [sendEmailTool]; 
    }
    this.coreServicesInstance?.log(LogLevel.DEBUG, 'GmailPlugin: Not providing send_email tool because plugin is not configured.');
    return [];
  }
}

export default new GmailPluginDefinition(); 