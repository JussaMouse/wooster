import { DynamicTool } from "@langchain/core/tools";
import { AppConfig } from "../configLoader";
import { WoosterPlugin } from "../pluginTypes";
import { log, LogLevel } from "../logger";
import { sendEmail as sendEmailFunction, EmailArgs } from "../tools/email"; // The actual email sending logic

let globalAppConfig: AppConfig;

const GmailPlugin: WoosterPlugin = {
  name: "GmailPlugin",
  version: "0.1.0",
  description: "A plugin that provides tools for interacting with Gmail, such as sending emails.",

  initialize: async (config: AppConfig) => {
    globalAppConfig = config;
    log(LogLevel.INFO, `GmailPlugin initialized. Email sending configured: ${config.tools.email.enabled}`);
  },

  getAgentTools: () => {
    if (!globalAppConfig) {
      log(LogLevel.ERROR, "GmailPlugin: AppConfig not initialized. Cannot provide tools.");
      return [];
    }

    // Only provide the tool if email is enabled in the config
    if (!globalAppConfig.tools.email.enabled) {
      log(LogLevel.INFO, "GmailPlugin: Email tool is disabled in configuration. Not providing sendEmail tool.");
      return [];
    }
    if (!globalAppConfig.tools.email.senderEmailAddress || !globalAppConfig.tools.email.emailAppPassword) {
      log(LogLevel.WARN, "GmailPlugin: Email sender address or app password not configured. sendEmail tool will not be effective.");
      // We still provide the tool; it will return an error message when used if misconfigured.
    }

    const emailTool = new DynamicTool({
      name: "sendEmail",
      description: "Sends an email. Input must be an object with keys: 'to' (recipient email address or 'SELF_EMAIL_RECIPIENT' for your configured personal email), 'subject' (email subject line), and 'body' (email content).",
      func: async (toolInput: string | Record<string, any>) => {
        // This function logic is similar to what was in AgentExecutorService
        // but now it uses the globalAppConfig obtained during plugin initialization.
        if (!globalAppConfig.tools.email.enabled) {
          return "Email tool is disabled in configuration."; // Should be caught by the check above, but good for safety
        }
        if (!globalAppConfig.tools.email.senderEmailAddress) {
          log(LogLevel.ERROR, "sendEmail tool (via GmailPlugin): Wooster sending email address not configured.");
          return "Email tool cannot be used: Wooster sending email address not configured.";
        }

        let args: EmailArgs;
        if (typeof toolInput === 'string') {
          try {
            args = JSON.parse(toolInput) as EmailArgs;
          } catch (e) {
            return "Invalid input for sendEmail tool: Input string is not valid JSON. Expected an object with 'to', 'subject', 'body'.";
          }
        } else if (typeof toolInput === 'object' && toolInput !== null) {
          args = toolInput as EmailArgs;
        } else {
          return "Invalid input type for sendEmail tool. Expected a JSON string or an object with 'to', 'subject', 'body'.";
        }

        if (!args.to || !args.subject || !args.body) {
          return "Invalid input for sendEmail tool: Missing 'to', 'subject', or 'body' in the input object.";
        }
        
        // Call the original sendEmail function from ../tools/email.ts, passing the EmailConfig from globalAppConfig
        return sendEmailFunction(args, globalAppConfig.tools.email);
      },
    });
    return [emailTool];
  }
};

export default GmailPlugin; 