/**
 * Arguments for sending an email via the Gmail plugin.
 */
export interface GmailPluginEmailArgs {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
}

/**
 * Result of an email sending operation from the Gmail plugin.
 */
export interface GmailPluginSendEmailResult {
  success: boolean;
  message: string;
  messageId?: string;
  error?: any;
} 