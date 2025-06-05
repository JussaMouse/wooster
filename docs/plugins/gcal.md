# Wooster GCal Plugin (gcal)

**Version:** 1.3.0

This document provides details about the GCal plugin for Wooster, which integrates with Google Calendar.

## 1. Purpose

The GCal plugin allows Wooster to:
- Read events from your Google Calendar.
- Create new events in your Google Calendar. Wooster configures these events to include a 15-minute email reminder and ensures that Google Calendar sends invitation/update notifications to all attendees.
- Optionally, automatically add a configured default email address as an attendee to all created events, ensuring they receive notifications.

This functionality enables features like including calendar summaries in the Daily Review and allowing the agent to manage your schedule.

## 2. Provided Agent Tools

The GCal plugin provides the following tools for the Wooster agent:

-   **`get_calendar_events`**
    -   **Description**: Provides a summary of today's (or a specified range of) calendar events. Optional input: JSON string with ListEventsOptions (timeMin, timeMax, maxResults, q, etc.). Returns raw event data as JSON string.
    -   **Usage**: The agent can use this to fetch upcoming appointments or check for conflicts.

-   **`create_calendar_event`**
    -   **Description**: Creates a new event in Google Calendar. Input must be a JSON string with CreateEventOptions (summary, startDateTime, endDateTime are required). Returns created event data as JSON string.
    -   **Usage**: The agent can use this to schedule new meetings or reminders based on user requests.

## 3. Configuration

To use the GCal plugin, you need to configure Google OAuth 2.0 credentials. This typically involves:

1.  Creating a project in the Google Cloud Platform Console.
2.  Enabling the Google Calendar API for that project.
3.  Setting up OAuth 2.0 consent screen information.
4.  Creating OAuth 2.0 client ID and client secret credentials.
5.  Authorizing your application to obtain an initial refresh token.

These credentials need to be added to your Wooster `.env` file:

```env
# --- Google Plugin Settings (General, Calendar, Gmail) ---
PLUGIN_GCAL_ENABLED=true
# ... other Google general settings ...

# --- Google Calendar Specific --- (Values from your Google Cloud Project)
GOOGLE_CALENDAR_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
GOOGLE_CALENDAR_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
GOOGLE_CALENDAR_REFRESH_TOKEN="YOUR_INITIAL_GOOGLE_REFRESH_TOKEN"
GOOGLE_CALENDAR_ID="primary" # Or the specific calendar ID you want Wooster to use
GOOGLE_CALENDAR_DEFAULT_ATTENDEE_EMAIL="your_email@example.com" # Optional: If set, this email will be added as an attendee to all events Wooster creates
```

Refer to Google's official documentation for detailed steps on creating OAuth credentials.

## 4. Troubleshooting

### a. `invalid_grant` Error

**Symptom:**
Your Wooster logs show an error similar to:
`GCalPlugin: Failed to list Google Calendar events: { error: 'invalid_grant' }`

**Cause:**
This error from Google indicates that the refresh token Wooster is using to access your Google Calendar is no longer valid. This can happen if:
- The token was revoked from your Google account settings.
- The token expired (rare for refresh tokens, but possible).
- Your Google account password changed, and sessions were invalidated.
- Too many refresh tokens were issued for the same client ID/user.

**Solution: Obtain a New Refresh Token via OAuth 2.0 Playground**

You can get a new refresh token without needing to change your OAuth Client ID or Secret.

1.  **Go to OAuth 2.0 Playground:**
    *   Open your web browser and navigate to: `https://developers.google.com/oauthplayground`

2.  **Configure OAuth 2.0 (Step 1 on Playground - Gear Icon):
    *   In the top right, click the gear icon (OAuth 2.0 configuration).
    *   Select **"Use your own OAuth credentials"**.
    *   Enter your existing **OAuth Client ID** and **OAuth Client Secret** (these are the same ones Wooster is currently configured with, likely found in your `.env` file under `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`).
    *   Click "Close".

3.  **Select & Authorize APIs (Step 1 on Playground - Main Area):
    *   Scroll down the list of Google APIs.
    *   Find and expand **"Calendar API v3"**.
    *   Select the necessary scope(s). For Wooster's typical calendar operations, `https://www.googleapis.com/auth/calendar.events` (to read/write events) is usually sufficient. If you previously used `https://www.googleapis.com/auth/calendar`, you might stick with that to ensure all permissions are covered.
    *   Click the blue **"Authorize APIs"** button.

4.  **Google Sign-In & Consent:**
    *   You'll be redirected to a Google sign-in page. Sign in with the Google account whose calendar Wooster needs to access.
    *   Grant consent on the following screen.

5.  **Exchange Authorization Code for Tokens (Step 2 on Playground):
    *   After consent, you'll be redirected back to the OAuth Playground.
    *   An "Authorization code" will be pre-filled.
    *   Click the blue **"Exchange authorization code for tokens"** button.

6.  **Get Your New Refresh Token:**
    *   On the right side, a new **Refresh token** will be displayed (along with an Access token).
    *   **Copy this new `Refresh token` value.**

7.  **Update Your Wooster Configuration:**
    *   Open your Wooster project's `.env` file.
    *   Replace the old `GOOGLE_CALENDAR_REFRESH_TOKEN` value with the new one you just copied.
    *   Save the file.

8.  **Restart Wooster:**
    *   Stop and restart your Wooster application to apply the change.

Wooster should now be able to access your Google Calendar successfully. 