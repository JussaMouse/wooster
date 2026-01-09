# Habits Plugin

Track and manage habits with streaks, reminders, and statistics.

## Overview

The Habits plugin helps you build and maintain positive habits by:
- Tracking daily, weekly, or monthly habits
- Maintaining streak counts for motivation
- Providing statistics and completion rates
- Categorizing habits for organization

## Configuration

Enable in `.env`:
```bash
PLUGIN_HABITS_ENABLED=true
```

Data is stored in SQLite at `database/habits.sqlite3`.

## Tools

### create_habit
Create a new habit to track.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Name of the habit (e.g., "Morning meditation") |
| description | string | No | Optional description |
| frequency | 'daily' \| 'weekly' \| 'monthly' | No | How often (default: daily) |
| targetDays | number[] | No | For weekly: 0-6 (0=Sunday). For monthly: 1-31 |
| category | string | No | Category like "health", "productivity", "learning" |
| reminderTime | string | No | Reminder time in HH:MM format |

**Examples:**
```
> Create a habit called "Morning meditation" that's daily
Created habit "Morning meditation" (daily)
Current streak: 0

> Create a weekly habit "Deep work session" for Monday, Wednesday, and Friday
Created habit "Deep work session" (weekly on Mon, Wed, Fri)
```

### check_in_habit
Mark a habit as completed for today (or a specific date).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| habitName | string | Yes | Name of the habit to check in |
| date | string | No | Date to check in (ISO format, default: today) |
| notes | string | No | Optional notes about this completion |

**Examples:**
```
> Check in to meditation
✓ Checked in to "Morning meditation"
Streak: 5 days! 🔥

> Check in to meditation for yesterday
✓ Checked in to "Morning meditation" for 2026-01-08
```

### list_habits
List all habits with their current status.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| category | string | No | Filter by category |
| showCompleted | boolean | No | Include archived habits (default: false) |

**Example:**
```
> Show my habits

Active Habits:
┌─────────────────────────┬───────────┬────────┬──────────────┐
│ Habit                   │ Frequency │ Streak │ Today        │
├─────────────────────────┼───────────┼────────┼──────────────┤
│ Morning meditation      │ daily     │ 5 🔥   │ ✓ completed  │
│ Deep work session       │ weekly    │ 3      │ ○ due today  │
│ Read 30 minutes         │ daily     │ 0      │ ○ not done   │
└─────────────────────────┴───────────┴────────┴──────────────┘
```

### habit_status
Get detailed status for a specific habit.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| habitName | string | Yes | Name of the habit |

**Example:**
```
> How am I doing with meditation?

Morning meditation
├─ Frequency: Daily
├─ Current streak: 5 days
├─ Longest streak: 12 days
├─ Total completions: 45
├─ Completion rate (30d): 87%
├─ Last completed: Today at 7:30 AM
└─ Category: Health
```

### habit_stats
Get overall habit statistics.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| period | 'week' \| 'month' \| 'year' | No | Time period (default: month) |

**Example:**
```
> Show my habit stats for this month

January 2026 Habit Summary:
├─ Active habits: 5
├─ Total check-ins: 89
├─ Overall completion rate: 78%
├─ Best streak: "Morning meditation" (12 days)
├─ Most consistent: "Read 30 minutes" (92%)
└─ Needs attention: "Exercise" (45%)
```

### update_habit
Modify an existing habit.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| habitName | string | Yes | Current name of the habit |
| newName | string | No | New name |
| description | string | No | New description |
| frequency | string | No | New frequency |
| category | string | No | New category |
| reminderTime | string | No | New reminder time |

### delete_habit
Archive or permanently delete a habit.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| habitName | string | Yes | Name of the habit to delete |
| permanent | boolean | No | Permanently delete (default: archive) |

## Database Schema

```sql
-- Habits table
CREATE TABLE habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  frequency TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
  targetDays TEXT,         -- JSON array
  streak INTEGER DEFAULT 0,
  longestStreak INTEGER DEFAULT 0,
  category TEXT,
  reminderTime TEXT,
  createdAt TEXT NOT NULL,
  archivedAt TEXT,
  UNIQUE(name)
);

-- Check-ins table
CREATE TABLE habit_checkins (
  id TEXT PRIMARY KEY,
  habitId TEXT NOT NULL,
  date TEXT NOT NULL,      -- YYYY-MM-DD
  notes TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (habitId) REFERENCES habits(id),
  UNIQUE(habitId, date)
);
```

## Streak Logic

- **Daily habits**: Streak increments for consecutive days. Missing a day resets to 0.
- **Weekly habits**: Streak increments for completing all target days in a week.
- **Monthly habits**: Streak increments for completing all target days in a month.

Streaks are calculated automatically when checking in and displayed with 🔥 emoji for motivation.

## Best Practices

1. **Start small**: Begin with 1-2 habits, then add more as they become automatic
2. **Be specific**: "Read for 30 minutes" is better than "Read more"
3. **Stack habits**: "After morning coffee, meditate for 10 minutes"
4. **Review regularly**: Use `habit_stats` weekly to track progress
5. **Don't break the chain**: The streak counter is a powerful motivator
