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

    if (!globalAppConfig.tools.email.enabled) {
      log(LogLevel.INFO, "GmailPlugin: Email tool is disabled in configuration. Not providing sendEmail tool.");
      return [];
    }
    if (!globalAppConfig.tools.email.senderEmailAddress || !globalAppConfig.tools.email.emailAppPassword) {
      log(LogLevel.WARN, "GmailPlugin: Email sender address or app password not configured. sendEmail tool will not be effective.");
    }

    const emailTool = new DynamicTool({
      name: "sendEmail",
      description: "Sends an email. The input to this tool MUST be a single JSON object string with the following keys: 'to' (string: recipient email address or the exact string 'SELF_EMAIL_RECIPIENT' for your configured personal email), 'subject' (string: email subject line), and 'body' (string: email content). Example: {\"to\": \"example@example.com\", \"subject\": \"Hello\", \"body\": \"Hi there!\"}",
      func: async (toolInput: string | Record<string, any>) => {
        if (!globalAppConfig.tools.email.enabled) {
          return "Email tool is disabled in configuration.";
        }
        if (!globalAppConfig.tools.email.senderEmailAddress) {
          log(LogLevel.ERROR, "sendEmail tool (via GmailPlugin): Wooster sending email address not configured.");
          return "Email tool cannot be used: Wooster sending email address not configured.";
        }

        let parsedArgs: Record<string, any>;
        if (typeof toolInput === 'string') {
          try {
            parsedArgs = JSON.parse(toolInput);
          } catch (e) {
            return "Invalid input for sendEmail tool: Input string is not valid JSON. Expected an object with 'to', 'subject', 'body'.";
          }
        } else if (typeof toolInput === 'object' && toolInput !== null) {
          parsedArgs = toolInput; // If Langchain already parsed it (e.g. from OpenAI tools format)
        } else {
          return "Invalid input type for sendEmail tool. Expected a JSON string or an object with 'to', 'subject', 'body'.";
        }

        // Check if the actual arguments are nested under an "input" key, which some agent setups might do.
        // However, the OpenAI tools agent should provide the arguments directly.
        const finalArgs: EmailArgs = (parsedArgs.input && typeof parsedArgs.input === 'object' && Object.keys(parsedArgs).length === 1)
                                    ? parsedArgs.input as EmailArgs 
                                    : parsedArgs as EmailArgs;

        if (!finalArgs.to || !finalArgs.subject || !finalArgs.body) {
          log(LogLevel.WARN, `sendEmail tool: Missing 'to', 'subject', or 'body'. Input was: ${JSON.stringify(toolInput)}, Parsed as: ${JSON.stringify(parsedArgs)}, Final Args: ${JSON.stringify(finalArgs)}`);
          return `Invalid input for sendEmail tool: Missing 'to', 'subject', or 'body'. Ensure these are direct properties.`;
        }
        
        return sendEmailFunction(finalArgs, globalAppConfig.tools.email);
      },
    });
    return [emailTool];
  }
};

export default GmailPlugin; 