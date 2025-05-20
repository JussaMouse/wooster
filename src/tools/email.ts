import nodemailer from 'nodemailer';

export interface EmailArgs {
  to: string;
  subject: string;
  body: string;
}

const USER_PLACEHOLDERS = ['me', 'myemail', 'user@example.com', 'your-email@example.com', 'my email', "user's email", "your_email@example.com"];

/**
 * Send an email via Gmail SMTP (App Password or OAuth2).
 * Returns the SMTP response string on success.
 */
export async function sendEmail({ to, subject, body }: EmailArgs): Promise<string> {
  console.log(`sendEmail tool called with args: to="${to}", subject="${subject}", body="${body}"`);
  console.log(`sendEmail: process.env.USER_EMAIL_ADDRESS = "${process.env.USER_EMAIL_ADDRESS}"`);
  console.log(`sendEmail: process.env.EMAIL_ADDRESS (sender) = "${process.env.EMAIL_ADDRESS}"`);

  const from = process.env.EMAIL_ADDRESS;
  if (!from) throw new Error('Sender EMAIL_ADDRESS not set in .env');

  let recipientEmail = to;
  if (USER_PLACEHOLDERS.includes(to.toLowerCase())) {
    const userEmail = process.env.USER_EMAIL_ADDRESS;
    if (userEmail) {
      recipientEmail = userEmail;
      console.log(`Resolved recipient "${to}" to user email: ${recipientEmail}`);
    } else {
      throw new Error(`Recipient was "${to}", but USER_EMAIL_ADDRESS is not set in .env. Cannot determine recipient.`);
    }
  }

  // Validate recipientEmail (simple check for @ sign)
  if (!recipientEmail || !recipientEmail.includes('@')) {
    throw new Error(`Invalid or unresolved recipient email address: "${recipientEmail}"`);
  }

  const appPassword = process.env.EMAIL_APP_PASSWORD;
  let authConfig: any;
  if (appPassword) {
    authConfig = { user: from, pass: appPassword };
  } else {
    // Ensure all OAuth2 ENV vars are present if this path is taken
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
      throw new Error('OAuth2 credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN) are not fully set in .env, and EMAIL_APP_PASSWORD is also missing.');
    }
    authConfig = {
      type: 'OAuth2',
      user: from,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    };
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: authConfig,
  });

  const mailOptions = { from, to: recipientEmail, subject, text: body };

  console.log(`Attempting to send email: From: ${from}, To: ${recipientEmail}, Subject: ${subject}`);
  const info = await transporter.sendMail(mailOptions);
  console.log('Email sent successfully. SMTP Response:', info.response);
  return info.response;
} 