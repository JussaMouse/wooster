# Wooster's Daily Review

## 1. Purpose

Wooster's Daily Review is an automated feature designed to provide you with a consolidated and engaging overview of your day each morning. It's delivered via email, helping you stay organized and informed about your schedule, priorities, and local weather.

## 2. Content & Structure

The Daily Review email is styled by Wooster with a touch of personality and "cuteness" to make your morning check-in a little more enjoyable. The information is presented in the following order:

### a. Today's Calendar Events
   - Lists events scheduled for the current day.
   - Fetched from your primary Google Calendar.

### b. Next Actions List
   - Highlights tasks from your active projects.
   - Compiled from `actions.txt` files. The list prioritizes actions as follows:
     1.  **Always Included:** Actions from `projects/home/actions.txt` (if the file exists and contains actions).
     2.  **Additional Actions:** Actions from the `actions.txt` files of the **3 most recently modified project directories**.
   - Project directories are expected to be under the `projects/` folder (e.g., `projects/my_novel/`).
   - For non-home projects, the "most recently modified" status is determined by the last modification timestamp of the project's main Markdown file (e.g., `projects/my_novel/my_novel.md`). If a `[projectName].md` file doesn't exist in the project's root, that project might not be correctly considered for recency.
   - Each line in an `actions.txt` file is treated as a distinct action item.
   - Actions in the email will be clearly associated with their respective project names.

### c. Weather Forecast
   - Provides the current weather for your configured city.
   - Includes:
     - Temperature (in Celsius and Fahrenheit).
     - Current weather conditions (e.g., "clear sky", "light rain").
     - The day's chance of rain percentage (derived from OpenWeatherMap's 5-day/3-hour forecast data, representing the probability of precipitation).

### d. Daily Review Schedule (Optional)
   - **Environment Variable:** `DAILY_REVIEW_SCHEDULE_CRON`
   - **Description:** Allows you to customize the cron schedule for when the Daily Review email is sent. If not set, it defaults to 6:30 AM daily (`"30 6 * * *"`).
   - **Example:** `DAILY_REVIEW_SCHEDULE_CRON="0 7 * * MON-FRI"` (to send at 7:00 AM on weekdays)

### e. Project `actions.txt` Files
   - **Location:** Create an `actions.txt` file in the root directory of any project for which you want to track actions (e.g., `projects/your_project_name/actions.txt`).
   - **Format:** List one action item per line.

## 3. Email Format & Style

- The email is HTML formatted for a richer presentation.
- Wooster is encouraged to use a creative and friendly style, potentially including emojis, to make the Daily Review engaging. The specific design elements might vary from day to day for a pleasant surprise.

## 4. Configuration Requirements

To enable and correctly receive the Daily Review, ensure the following are configured:

### a. Recipient Email Address
   - **Environment Variable:** `TOOLS_EMAIL_USER_PERSONAL_EMAIL_ADDRESS` (from the Email Tool configuration)
   - **Description:** The email address where Wooster will send your Daily Review. This is the same variable used by the Email Tool for the `SELF_EMAIL_RECIPIENT` placeholder.
   - **Example:** `TOOLS_EMAIL_USER_PERSONAL_EMAIL_ADDRESS="your_personal_email@example.com"`

### b. Email Sending Capabilities
   - **Environment Variables:**
     - `TOOLS_EMAIL_SENDER_EMAIL_ADDRESS` (Wooster's sending email, e.g., your Gmail address)
     - `GMAIL_APP_PASSWORD` (If using Gmail, the app password for Wooster)
   - **Description:** These are required for Wooster to send any emails, including the Daily Review. Refer to the main email tool configuration for details.

### c. Weather Tool Configuration
   - **Environment Variables:**
     - `WEATHER_CITY`
     - `OPENWEATHERMAP_API_KEY`
   - **Description:** Essential for fetching the weather forecast. Refer to the Weather Tool documentation for setup.

### d. Daily Review Schedule (Optional)
   - **Environment Variable:** `DAILY_REVIEW_SCHEDULE_CRON`
   - **Description:** Allows you to customize the cron schedule for when the Daily Review email is sent. If not set, it defaults to 6:30 AM daily (`"30 6 * * *"`).
   - **Example:** `DAILY_REVIEW_SCHEDULE_CRON="0 7 * * MON-FRI"` (to send at 7:00 AM on weekdays)

### e. Project `actions.txt` Files
   - **Location:** Create an `actions.txt` file in the root directory of any project for which you want to track actions (e.g., `projects/your_project_name/actions.txt`).
   - **Format:** List one action item per line.

## 5. Triggering Mechanism

- The Daily Review is primarily designed to be an **automated email sent once per day in the morning**.
- It is managed by Wooster's `SchedulerService` as a `DIRECT_FUNCTION` task.
  - **Task Key:** `system.dailyReview.sendEmail`
  - **Default Schedule:** Typically configured to run daily at 6:30 AM (cron expression: `"30 6 * * *"`). This can be overridden by setting the `DAILY_REVIEW_SCHEDULE_CRON` environment variable. The schedule is seeded via logic in `src/index.ts`.
  - **Execution Policy:** `RUN_ONCE_PER_PERIOD_CATCH_UP`. This policy ensures that:
    - If Wooster is running at 6:30 AM, the review is sent.
    - If Wooster is started *after* 6:30 AM on a given day, and the review has not yet been sent for that day, the `SchedulerService` will trigger it as part of its catch-up process.
    - It aims to send the review exactly once per day.
- (Future Enhancement) A REPL command (e.g., `send daily review`) may be added to trigger the Daily Review manually on demand.

## 6. Dependencies

This feature relies on:
- Google Calendar integration (for calendar events).
- The `get_weather_forecast` tool (for weather information).
- Email sending functionality (via the email plugin/tool).
- File system access (to find projects and read `actions.txt` files).
- The `SchedulerService`, which handles the registration, scheduling, and execution of the Daily Review as a `DIRECT_FUNCTION` task based on its defined `task_key`, schedule expression, and execution policy. 