import { DynamicTool } from "@langchain/core/tools";
import { z } from 'zod'; // Import Zod
import { AppConfig } from "../configLoader";
import { WoosterPlugin } from "../pluginTypes";
import { log, LogLevel } from "../logger";
import { sendEmail as sendEmailFunction, EmailArgs } from "../tools/email"; // The actual email sending logic

let globalAppConfig: AppConfig;

// Define Zod schema for email arguments
const emailArgsSchema = z.object({
  to: z.string().describe("Recipient email address or the exact string 'SELF_EMAIL_RECIPIENT' to use your configured personal email address."),
  subject: z.string().describe("The subject line of the email."),
  body: z.string().describe("The main content/body of the email."),
});

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
      // Still provide the tool, but it will error out if used without full config, which is fine.
    }

    const emailTool = new DynamicTool({
      name: "sendEmail",
      description: "Sends an email. Expects a single JSON string argument. The JSON string should parse into an object with required keys: 'to' (string - recipient email or 'SELF_EMAIL_RECIPIENT'), 'subject' (string), and 'body' (string). Example JSON string: '{\"to\":\"user@example.com\",\"subject\":\"Hello\",\"body\":\"Hi there!\"}'",
      // schema: emailArgsSchema, // Schema is not used here; parsing is manual.
      func: async (toolInput: string) => {
        log(LogLevel.DEBUG, "sendEmail plugin func: Received toolInput (string expected):", typeof toolInput, toolInput);

        if (!globalAppConfig.tools.email.enabled) {
          return "Email tool is disabled in configuration.";
        }
        if (!globalAppConfig.tools.email.senderEmailAddress || !globalAppConfig.tools.email.emailAppPassword) {
            log(LogLevel.ERROR, "sendEmail tool (via GmailPlugin): Wooster sending email address or app password not configured.");
            return "Email tool cannot be used: Wooster sending email address or app password not configured.";
        }

        let argsObject: any;
        try {
          if (typeof toolInput !== 'string') {
            throw new Error(`Expected a string input, but received type ${typeof toolInput}. Value: ${JSON.stringify(toolInput)}`);
          }
          argsObject = JSON.parse(toolInput);
        } catch (e: any) {
          log(LogLevel.ERROR, "sendEmail: Failed to parse input string to JSON", { input: toolInput, error: e.message });
          return `Error: Invalid input. Expected a single JSON string. ${e.message}`;
        }

        let parsedArgs: z.infer<typeof emailArgsSchema>;
        try {
          parsedArgs = emailArgsSchema.parse(argsObject);
        } catch (e: any) {
          log(LogLevel.ERROR, "sendEmail: Zod validation failed for parsed arguments", { args: argsObject, error: e.errors });
          const errorMessages = e.errors.map((err: any) => `${err.path.join('.')} - ${err.message}`).join(', ');
          return `Error: Invalid arguments in JSON. ${errorMessages}. Please ensure to, subject, and body are provided correctly.`;
        }
        
        // Proceed with sending the email using the validated parsedArgs
        return sendEmailFunction(parsedArgs, globalAppConfig.tools.email);
      },
    });
    return [emailTool];
  }
};

export default GmailPlugin; 