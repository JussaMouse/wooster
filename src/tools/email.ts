import nodemailer from 'nodemailer';
import { log, LogLevel } from '../logger';
import type { EmailConfig } from '../configLoader'; // Import EmailConfig

export interface EmailArgs {
  to: string;
  subject: string;
  body: string;
}

// It's better to have a specific placeholder for "self" that the agent can be instructed to use.
const SELF_EMAIL_PLACEHOLDER = 'SELF_EMAIL_RECIPIENT';

/**
 * Send an email using credentials and settings from EmailConfig.
 * Returns the SMTP response string on success.
 * @param args The email arguments (to, subject, body).
 * @param config The email configuration from AppConfig.
 */
export async function sendEmail(args: EmailArgs, config: EmailConfig): Promise<string> {
  const { to, subject, body } = args;
  log(LogLevel.INFO, 'Attempting to send email with tool: sendEmail', { to, subject, bodyLength: body.length });

  if (!config.enabled) {
    return 'Email functionality is disabled in the configuration.';
  }

  const woosterSendingAddress = config.sendingEmailAddress;
  if (!woosterSendingAddress) {
    log(LogLevel.ERROR, 'Wooster sending email address not configured in config.json (email.sendingEmailAddress)');
    return 'Wooster sending email address not configured. Cannot send email.';
  }

  let recipientEmail = to;
  if (to.toUpperCase() === SELF_EMAIL_PLACEHOLDER) {
    if (config.userPersonalEmailAddress) {
      recipientEmail = config.userPersonalEmailAddress;
      log(LogLevel.INFO, `Resolved recipient placeholder "${SELF_EMAIL_PLACEHOLDER}" to user's personal email: ${recipientEmail}`);
    } else {
      recipientEmail = woosterSendingAddress;
      log(LogLevel.INFO, `Resolved recipient placeholder "${SELF_EMAIL_PLACEHOLDER}" to Wooster's sending email (userPersonalEmailAddress not set): ${recipientEmail}`);
    }
  }

  if (!recipientEmail || !recipientEmail.includes('@')) {
    log(LogLevel.ERROR, `Invalid or unresolved recipient email address: "${recipientEmail}"`);
    return `Invalid or unresolved recipient email address: "${recipientEmail}"`;
  }

  let authConfig: any;
  if (config.emailAppPassword) {
    authConfig = { user: woosterSendingAddress, pass: config.emailAppPassword };
  } else {
    // Add OAuth2 logic here if you re-introduce those fields in EmailConfig
    // For now, only App Password is directly supported from the config structure.
    log(LogLevel.ERROR, 'Email app password not configured in config.json (email.emailAppPassword)');
    return 'Email sending requires an app password to be configured. OAuth2 not yet supported via this config.';
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail', // This might need to be configurable if supporting other services
    auth: authConfig,
  });

  const mailOptions = { from: woosterSendingAddress, to: recipientEmail, subject, text: body };

  log(LogLevel.INFO, `Attempting to send email: From: ${woosterSendingAddress}, To: ${recipientEmail}, Subject: ${subject}`);

  try {
    await transporter.sendMail(mailOptions);
    log(LogLevel.INFO, `Email sent successfully to ${recipientEmail}`);
    return `Email successfully sent to ${recipientEmail} with subject "${subject}".`;
  } catch (error: any) {
    log(LogLevel.ERROR, `Error sending email to ${recipientEmail}: ${error.message}`, { error });
    return `Failed to send email to ${recipientEmail}. Error: ${error.message}`;
  }
} 