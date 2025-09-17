# Wooster's Daily Review

## 1. Purpose

Wooster's Daily Review is an automated feature designed to provide you with a consolidated and engaging overview of your day each morning. It's delivered via Signal or email (configurable), helping you stay organized and informed about your schedule, priorities, and local weather.

## 2. Content & Structure

The Daily Review email is styled by Wooster with a touch of personality and "cuteness" to make your morning check-in a little more enjoyable. The information is presented in the following order:

### a. Today's Calendar Events
   - Lists events scheduled for the current day.
   - Fetched from your primary Google Calendar (requires Calendar plugin).

### b. Next Actions List
   - Displays your open tasks directly from your main `next_actions.md` file.
   - This list is fetched via the `NextActionsPlugin` (specifically, a service it provides, like `GetOpenNextActionsService`).
   - Tasks will be shown with their descriptions, and may include context (e.g., `@home`), project (e.g., `+Chores`), and due dates if specified in `next_actions.md`.
   - This provides a comprehensive view of all your current next actions as defined in your central GTD task list.

### c. Weather Forecast
   - Provides the current weather for your configured city (requires Weather plugin).
   - Includes:
     - Temperature (in Celsius and Fahrenheit).
     - Current weather conditions (e.g., "clear sky", "light rain").
     - The day's chance of rain percentage (derived from OpenWeatherMap's 5-day/3-hour forecast data, representing the probability of precipitation).

### d. Latest Fitness Log
   - Summarizes your most recent workout entry from the Personal Health plugin (requires Personal Health plugin).
   - Includes the date and content of the workout.

## 3. Delivery & Format

- **Signal:** Plain text message formatted for readability.
- **Email:** HTML formatted for a richer presentation.
- Wooster uses a friendly style, with emojis where appropriate.

## 4. Configuration Requirements

To enable and correctly receive the Daily Review, ensure the following are configured:

### a. User Preferences File (`config/dailyReview.json`)

This file, located at `config/dailyReview.json` in your Wooster project root, stores your personal settings for the Daily Review. This includes:
*   Which content modules are active (e.g., `calendar`, `weather`, `healthLog`, `nextActions`).
*   Delivery channel preferences (e.g., Signal and/or email settings).
*   The `scheduleCron` expression for when the review is generated and sent. The default schedule if not otherwise configured is **7:30 AM daily** (`"30 7 * * *"`).

*   **Initial Setup:** Upon first use, or if you wish to reset your settings, you should copy the provided example configuration:
    ```bash
    cp config/dailyReview.example.json config/dailyReview.json
    ```
    Then, edit the `config/dailyReview.json` file to customize your preferences. The `config/dailyReview.example.json` file serves as a template and is tracked by Git, while your `config/dailyReview.json` is ignored by Git to keep your personal settings local.
*   **Automatic Creation:** If `config/dailyReview.json` does not exist when Wooster starts, the Daily Review plugin will automatically create it with default values. It may also auto-enable certain content modules (like Weather, Calendar, or Fitness Log) if their underlying services/plugins are detected, and set `hasCompletedInitialSetup` to `true`.
*   **Key Settings:** Refer to the output of the "get_daily_review_help" agent tool for a detailed list of all configurable settings within this file and their current values.

### b. Signal Delivery (recommended)
   - Enable the Signal plugin and configure `.env`:
     - `SIGNAL_CLI_NUMBER` (required), optionally `SIGNAL_TO` or `SIGNAL_GROUP_ID`.
   - In `config/dailyReview.json`, enable the Signal channel and (optionally) override the recipient:
     ```json
     {
       "deliveryChannels": {
         "signal": {
           "enabled": true,
           "to": "+1555YOURPERSONALNUMBER",
           "groupId": ""
         }
       }
     }
     ```
   - If both `to` and `groupId` are empty, Daily Review goes to the dedicated account's Note‑to‑Self (not your personal phone).

### c. Recipient Email Address (for Email Delivery)
   - The primary way to set the recipient for email delivery is via the `recipient` field within the `email` channel settings in `config/dailyReview.json`.
   - If this field is not set or is an empty string in `config/dailyReview.json`, the system defaults to using the value of the **`GMAIL_USER_PERSONAL_EMAIL_ADDRESS`** environment variable from your `.env` file.
   - **Example `.env` entry:** `GMAIL_USER_PERSONAL_EMAIL_ADDRESS="your_personal_email@example.com"`

### d. Email Sending Capabilities (for Email Delivery)
   - **Environment Variables:**
     - `GMAIL_USER_EMAIL_ADDRESS` (Wooster's sending email, e.g., your Gmail address used by the Gmail Plugin)
     - `GMAIL_APP_PASSWORD` (If using Gmail, the app password for Wooster, associated with `GMAIL_USER_EMAIL_ADDRESS`)
   - **Description:** These are required for Wooster to send any emails, including the Daily Review. Refer to the Gmail Plugin or general email tool configuration for details.

### e. Weather Tool Configuration (for Weather Module)
   - **Environment Variables:**
     - `WEATHER_CITY`
     - `OPENWEATHERMAP_API_KEY`
   - **Description:** Essential for fetching the weather forecast if the weather module is enabled. Refer to the Weather Tool/Plugin documentation for setup.

### f. Daily Review Schedule
   - The schedule for when the Daily Review email is generated and sent is primarily configured via the `scheduleCron` setting within the `config/dailyReview.json` file.
   - The default value used by the plugin when creating a new configuration is `"30 7 * * *"` (7:30 AM daily).
   - You can customize this cron expression in `config/dailyReview.json` to change the timing.
   - An environment variable `DAILY_REVIEW_SCHEDULE_CRON` or settings in the main `appConfig` (e.g., `appConfig.dailyReview.scheduleCronExpression`) might influence the *initial default value* that gets written into `config/dailyReview.json` if the file is being created for the first time and those `appConfig` values exist. However, once `config/dailyReview.json` exists, the `scheduleCron` value within it is the definitive source for the plugin's scheduling. Changes to this file are read by the plugin on startup or reload.

## 5. Triggering Mechanism

- The Daily Review is designed to be an **automated message sent once per day** (via Signal and/or email) according to the schedule in `config/dailyReview.json`.
- It is managed by Wooster's `SchedulerService`.
  - **Task Key:** `dailyReview.send` (as returned by the plugin's `getScheduledTaskSetups` method).
  - **Schedule:** Defined by the `scheduleCron` setting in `config/dailyReview.json`.
  - **Execution Policy:** `RUN_ONCE_PER_PERIOD_CATCH_UP`. This policy ensures that:
    - If Wooster is running at the scheduled time, the review is sent.
    - If Wooster is started *after* the scheduled time on a given day, and the review has not yet been sent for that day, the `SchedulerService` will trigger it as part of its catch-up process.
    - It aims to send the review exactly once per scheduled period.
- (Future Enhancement) A REPL command or agent tool could be added to trigger the Daily Review manually on demand.

## 6. Dependencies

This feature, depending on enabled content modules, relies on:
- The `config/dailyReview.json` file for its core configuration.
- **Signal Delivery:**
    - Signal plugin enabled and configured (`SIGNAL_CLI_NUMBER`, optional `SIGNAL_TO`/`SIGNAL_GROUP_ID`).
- **Email Delivery:**
    - Email Service (e.g., Gmail Plugin) and credentials in `.env`.
- **Calendar Events:**
    - A Calendar Service/Function (e.g., `getCalendarEventsFunction` provided by a Calendar Plugin).
- **Weather Forecast:**
    - A Weather Service/Function (e.g., `getWeatherForecastFunction` provided by a Weather Plugin).
    - Correctly configured weather API key and city in `.env`.
- **Next Actions List:**
    - The `NextActionsPlugin` must provide a service (e.g., `GetOpenNextActionsService`) that allows fetching all open tasks (`TaskItem[]`) from the `next_actions.md` file.
- **Latest Fitness Log:**
    - The `PersonalHealthService` (provided by the Personal Health Plugin).
- **Core System:**
    - The `SchedulerService` for automated execution. 