# Tool: Send Email (`sendEmail`)

This document details the `sendEmail` tool available to Wooster's agent, provided by the `GmailPlugin`.

## 1. Purpose

The `sendEmail` tool, made available through the `GmailPlugin`, allows the agent to compose and send emails on behalf of the user. It handles constructing the email and interacting with the email sending service (currently configured for Gmail via Nodemailer).

## 2. Agent-Facing Description

When deciding to use this tool, the agent is provided with the following description:

```
Sends an email. Input must be an object with keys: 'to' (recipient email address or 'SELF_EMAIL_RECIPIENT' for your configured personal email), 'subject' (email subject line), and 'body' (email content).
```

## 3. Tool Name

`sendEmail`

## 4. Input Schema

- **Type**: `object` (or a JSON string that parses to this object)
- **Properties**:
    - `to`: 
        - Type: `string`
        - Description: The recipient's email address. Can also be the special placeholder string `SELF_EMAIL_RECIPIENT`, which will resolve to the user's configured personal email address (if `TOOLS_EMAIL_USER_PERSONAL_EMAIL_ADDRESS` is set in `.env`) or fallback to Wooster's sending address.
    - `subject`: 
        - Type: `string`
        - Description: The subject line of the email.
    - `body`:
        - Type: `string`
        - Description: The main content/body of the email.
- **Required**: `to`, `subject`, `body`
- **Example Agent Input** (as an object):
  ```json
  {
    "to": "example@example.com",
    "subject": "Meeting Follow-up",
    "body": "Hi team,\n\nJust a quick follow-up on today's meeting..."
  }
  ```
- **Example Agent Input** (as a JSON string):
  `"{\"to\":\"SELF_EMAIL_RECIPIENT\",\"subject\":\"Quick Reminder\",\"body\":\"Don't forget about the deadline tomorrow!\"}"`

## 5. Output Schema

- **Type**: `string`
- **Description**: A confirmation message indicating success (e.g., `"Email successfully sent to recipient@example.com with subject \"Hello\"."`) or an error message if the email failed to send (e.g., `"Failed to send email to recipient@example.com. Error: ..."`). Also returns messages if the tool is disabled or misconfigured.

## 6. Dependencies & Configuration

- **Plugin Provider**: `GmailPlugin` (from `src/plugins/gmailPlugin.ts`). This plugin must be active.
- **Underlying Service**: `nodemailer` (configured for Gmail service).
- **Core Logic Function**: `sendEmail(args: EmailArgs, config: EmailConfig)` (defined in `src/tools/email.ts`).
- **Tool Definition**: The `DynamicTool` instance for `sendEmail` is created and provided by `GmailPlugin` during its `getAgentTools()` method. This tool's `func` ultimately calls the core `sendEmail` logic, passing the necessary `EmailConfig` obtained during plugin initialization.
- **Environment Variables** (from `.env` - see `06 CONFIG.MD`):
    - `PLUGIN_GMAILPLUGIN_ENABLED`: Must be `true` (or not set, thus defaulting to true) for the `GmailPlugin` to load and potentially offer this tool.
    - `TOOLS_EMAIL_ENABLED`: Must be `true` for the `GmailPlugin` to actually provide the `sendEmail` tool to the agent and for it to be functional.
    - `TOOLS_EMAIL_SENDER_EMAIL_ADDRESS`: **Required if enabled**. The Gmail address Wooster will send emails from.
    - `TOOLS_EMAIL_EMAIL_APP_PASSWORD`: **Required if enabled**. The Google App Password for the sender email address.
    - `TOOLS_EMAIL_USER_PERSONAL_EMAIL_ADDRESS`: Optional. If provided, the agent can send emails to `SELF_EMAIL_RECIPIENT` which resolves to this address.

## 7. When to Use (Agent Guidance)

The agent should consider using this tool when:

- The user explicitly asks to send an email.
- The user asks to draft an email and then send it.
- As a fulfillment step for a task that logically concludes with sending an email (e.g., summarizing information and emailing it).

## 8. When NOT to Use

- For simply drafting an email without sending (the agent can draft text directly).
- If any required configuration (sender address, app password) is missing (the tool will return an error, but the agent should ideally be aware if possible, though this is hard to signal proactively through descriptions alone). 