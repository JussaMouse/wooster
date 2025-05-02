import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import type { Plugin } from '../pluginManager'

/**
 * A plugin that sends each assistant response to your email.
 * Uses Gmail SMTP via OAuth2 to avoid simple password and reduce spam risk.
 */
const emailPlugin: Plugin = {
  name: 'email',
  onAssistantResponse: async (response: string) => {
    // Ensure email configuration is present
    const from = process.env.EMAIL_ADDRESS
    const to = process.env.EMAIL_TO ?? from
    if (!from || !to) {
      console.warn('Email plugin: EMAIL_ADDRESS or EMAIL_TO not set; skipping email')
      return
    }
    // Skip automatic emails if explicitly disabled
    const autoSend = process.env.EMAIL_AUTOSEND
    if (autoSend !== undefined && autoSend.toLowerCase() === 'false') {
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

    // Create transporter with chosen auth
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: authConfig,
      logger: true,
      debug: true,
    })

    // If using OAuth2, log token events for debugging
    if (!appPassword) {
      transporter.on('token', (info: any) => {
        console.log('Email plugin: Generated OAuth2 token:', info)
      })
    }

    // Prepare email options
    const mailOptions = {
      from,
      to,
      subject: 'Jeeves says:',
      text: response,
    }

    // Send email
    try {
      const info = await transporter.sendMail(mailOptions)
      console.log(`Email plugin: Email sent: ${info.response}`)
    } catch (error) {
      console.error('Email plugin: Failed to send email:', error)
    }
  },
}

export default emailPlugin 