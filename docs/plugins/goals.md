# Goals Plugin

Track and manage long-term goals with milestones and progress tracking.

## Overview

The Goals plugin helps you achieve long-term objectives by:
- Setting goals with categories and deadlines
- Breaking goals into trackable milestones
- Monitoring progress with visual indicators
- Providing goal summaries and reviews

## Configuration

Enable in `.env`:
```bash
PLUGIN_GOALS_ENABLED=true
```

Data is stored in SQLite at `database/goals.sqlite3`.

## Tools

### create_goal
Create a new goal to track.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | string | Yes | Title of the goal |
| description | string | No | Detailed description |
| category | string | No | Category (health, finance, career, personal, learning, relationships, other) |
| targetDate | string | No | Target completion date (ISO or natural language) |
| measureUnit | string | No | Unit of measurement (e.g., "lbs", "pages", "$") |
| targetValue | number | No | Target numeric value |
| currentValue | number | No | Starting value (default: 0) |

**Examples:**
```
> Create a goal to "Learn MLX" in the learning category with deadline end of March
Created goal: "Learn MLX"
├─ Category: Learning
├─ Deadline: March 31, 2026
├─ Progress: 0%
└─ Status: Active

> Create a health goal to "Lose 20 lbs" by June
Created goal: "Lose 20 lbs"
├─ Category: Health
├─ Deadline: June 1, 2026
├─ Target: 20 lbs
├─ Current: 0 lbs
└─ Progress: 0%
```

### list_goals
List all goals with progress.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| category | string | No | Filter by category |
| status | string | No | Filter by status (active, completed, abandoned) |
| includeCompleted | boolean | No | Include completed goals (default: false) |

**Example:**
```
> Show my goals

Active Goals:
┌─────────────────────┬──────────┬──────────┬───────────────┬──────────────┐
│ Goal                │ Category │ Progress │ Deadline      │ Milestones   │
├─────────────────────┼──────────┼──────────┼───────────────┼──────────────┤
│ Learn MLX           │ Learning │ ████░░ 40% │ Mar 31      │ 2/5 done     │
│ Lose 20 lbs         │ Health   │ ██░░░░ 25% │ Jun 1       │ 1/4 done     │
│ Save $10,000        │ Finance  │ ███░░░ 60% │ Dec 31      │ 3/3 done     │
└─────────────────────┴──────────┴──────────┴───────────────┴──────────────┘
```

### goal_details
Get detailed information about a specific goal.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| goalTitle | string | Yes | Title of the goal |

**Example:**
```
> Tell me about my MLX learning goal

Learn MLX
├─ Category: Learning
├─ Description: Master Apple's MLX framework for local AI
├─ Status: Active
├─ Created: January 1, 2026
├─ Deadline: March 31, 2026 (81 days remaining)
├─ Progress: 40%
│
├─ Milestones:
│   ✓ Complete MLX quickstart tutorial
│   ✓ Run first local model
│   ○ Build custom training script
│   ○ Deploy to mlx-box
│   ○ Write documentation
│
└─ Recent Activity:
    - Jan 8: Completed "Run first local model"
    - Jan 5: Completed "Complete MLX quickstart tutorial"
    - Jan 1: Goal created
```

### add_milestone
Add a milestone to an existing goal.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| goalTitle | string | Yes | Title of the goal |
| description | string | Yes | Milestone description |
| dueDate | string | No | Due date for this milestone |
| order | number | No | Position in milestone list |

**Example:**
```
> Add milestone "Integrate with Wooster" to my MLX goal
Added milestone to "Learn MLX":
└─ ○ Integrate with Wooster
```

### complete_milestone
Mark a milestone as completed.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| goalTitle | string | Yes | Title of the goal |
| milestoneDescription | string | Yes | Description of the milestone to complete |
| notes | string | No | Notes about completion |

**Example:**
```
> Complete the "Build custom training script" milestone for my MLX goal
✓ Completed milestone: "Build custom training script"
Goal "Learn MLX" is now 60% complete!
```

### update_goal_progress
Update numeric progress on a goal.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| goalTitle | string | Yes | Title of the goal |
| currentValue | number | Yes | New current value |
| notes | string | No | Notes about this update |

**Example:**
```
> Update my weight loss goal to 5 lbs lost
Updated "Lose 20 lbs":
├─ Previous: 0 lbs
├─ Current: 5 lbs
├─ Target: 20 lbs
└─ Progress: 25% ▓▓░░░░░░
```

### complete_goal
Mark a goal as completed.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| goalTitle | string | Yes | Title of the goal |
| notes | string | No | Completion notes or reflection |

**Example:**
```
> I've achieved my savings goal!
🎉 Congratulations! Goal "Save $10,000" marked as completed!
├─ Started: January 1, 2026
├─ Completed: September 15, 2026
├─ Duration: 258 days
└─ Final value: $10,000
```

### goal_summary
Get a summary of all goals and progress.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| period | 'month' \| 'quarter' \| 'year' | No | Summary period |

**Example:**
```
> Give me a goal summary

2026 Goal Summary:
├─ Total goals: 5
├─ Completed: 1 (20%)
├─ Active: 3
├─ Abandoned: 1
│
├─ Progress by Category:
│   ├─ Learning: 40% average
│   ├─ Health: 25% average
│   └─ Finance: 100% (completed!)
│
├─ Upcoming Deadlines:
│   ├─ "Learn MLX" - Mar 31 (81 days)
│   └─ "Lose 20 lbs" - Jun 1 (143 days)
│
└─ Suggested Focus:
    Your "Lose 20 lbs" goal is falling behind pace.
    Consider breaking it into weekly milestones.
```

## Database Schema

```sql
-- Goals table
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL,
  status TEXT DEFAULT 'active',  -- active, completed, abandoned
  targetDate TEXT,
  measureUnit TEXT,
  targetValue REAL,
  currentValue REAL DEFAULT 0,
  createdAt TEXT NOT NULL,
  completedAt TEXT,
  abandonedAt TEXT,
  notes TEXT
);

-- Milestones table
CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  goalId TEXT NOT NULL,
  description TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  dueDate TEXT,
  completedAt TEXT,
  orderIndex INTEGER,
  notes TEXT,
  FOREIGN KEY (goalId) REFERENCES goals(id)
);

-- Progress entries (for tracking changes over time)
CREATE TABLE goal_progress (
  id TEXT PRIMARY KEY,
  goalId TEXT NOT NULL,
  value REAL NOT NULL,
  notes TEXT,
  recordedAt TEXT NOT NULL,
  FOREIGN KEY (goalId) REFERENCES goals(id)
);
```

## Goal Categories

| Category | Description | Example Goals |
|----------|-------------|---------------|
| health | Physical and mental wellness | Lose weight, Exercise regularly, Improve sleep |
| finance | Money and financial security | Save $X, Pay off debt, Invest monthly |
| career | Professional development | Get promotion, Learn new skill, Start business |
| personal | Personal growth and development | Read X books, Learn language, Meditation practice |
| learning | Education and skill acquisition | Complete course, Master framework, Get certification |
| relationships | Social and family connections | Quality time with family, Meet new people |
| other | Anything else | |

## Best Practices

1. **SMART Goals**: Make goals Specific, Measurable, Achievable, Relevant, Time-bound
2. **Break it down**: Large goals should have 3-7 milestones
3. **Regular reviews**: Check `goal_summary` weekly
4. **Celebrate wins**: Completing milestones should feel rewarding
5. **Adjust as needed**: It's okay to modify goals based on new information
6. **Link to habits**: Connect goals to daily habits for consistent progress
