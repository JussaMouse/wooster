import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import type { Plugin } from '../pluginManager'

/**
 * A plugin that sends each assistant response to your email.
 * Uses Gmail SMTP via OAuth2 to avoid simple password and reduce spam risk.
 */

// State for explicit email requests
let pendingEmailContent: string | null = null

const emailPlugin: Plugin = {
  name: 'email',
  // Capture explicit 'send me an email' commands
  onUserInput: (input: string) => {
    const m = input.match(/^(?:send|email)\s+(?:me\s+)?(?:an\s+)?email\s*(?:that\s+says\s*)?(.+)$/i)
    if (m) {
      pendingEmailContent = m[1].trim() || 'Test email'
      console.log('Email plugin: Queued email content:', pendingEmailContent)
    }
    return input
  },
  onAssistantResponse: async (response: string) => {
    if (!pendingEmailContent) return
    // Ensure email configuration is present
    const from = process.env.EMAIL_ADDRESS
    const to = process.env.EMAIL_TO ?? from
    if (!from || !to) {
      console.warn('Email plugin: EMAIL_ADDRESS or EMAIL_TO not set; skipping email')
      pendingEmailContent = null
      return
    }
    // Determine auth method: use app password if provided, otherwise OAuth2
    const appPassword = process.env.EMAIL_APP_PASSWORD
    let authConfig: any
    if (appPassword) {
      authConfig = { user: from, pass: appPassword }
      console.log('Email plugin: Using SMTP auth with app password')
    } else {
      authConfig = {
        type: 'OAuth2',
        user: from,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      }
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: authConfig,
      logger: true,
      debug: true,
    })

    if (!appPassword) {
      transporter.on('token', (info: any) => {
        console.log('Email plugin: Generated OAuth2 token:', info)
      })
    }

    const mailOptions = {
      from,
      to,
      subject: 'Wooster says:',
      text: pendingEmailContent,
    }
    pendingEmailContent = null

    try {
      const info = await transporter.sendMail(mailOptions)
      console.log(`Email plugin: Email sent: ${info.response}`)
    } catch (error) {
      console.error('Email plugin: Failed to send email:', error)
    }
  },
}

export default emailPlugin 