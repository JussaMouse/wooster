# Insights Plugin

Proactive suggestions and pattern recognition for productivity improvement.

## Overview

The Insights plugin analyzes your usage patterns and provides:
- Weekly productivity insights
- Habit formation suggestions based on behavior
- Organization recommendations
- Session context ("where we left off")
- Conversation recall across sessions

## Configuration

Enable in `.env`:
```bash
PLUGIN_INSIGHTS_ENABLED=true

# Memory system (required for full functionality)
MEMORY_EPISODIC_ENABLED=true
MEMORY_SEMANTIC_ENABLED=true
```

## Tools

### weekly_insights
Generate comprehensive weekly insights.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| includeSuggestions | boolean | No | Include actionable suggestions (default: true) |
| includePatterns | boolean | No | Include detected patterns (default: true) |

**Example:**
```
> Give me weekly insights

📊 Weekly Insights (Jan 6-12, 2026)

Patterns Detected:
├─ 🌅 You're most productive between 9-11 AM
├─ 📚 You frequently discuss MLX and AI topics
├─ 💪 You tend to skip exercise on meeting-heavy days
└─ 📝 You capture ideas most often on Tuesday and Thursday

Habit Opportunities:
├─ "Morning deep work" - You naturally focus early; make it official
├─ "AI learning" - Your interest suggests a daily learning habit
└─ "Meeting-day exercise" - Schedule workouts before meetings

Suggestions:
├─ Block 9-11 AM for deep work (matches your peak productivity)
├─ Create a "MLX Learning" project to organize your AI notes
├─ Consider a "2-minute exercise" habit for meeting days
└─ Review your Tuesday/Thursday ideas on Friday

Productivity Score: 78/100 📈 (+5 from last week)
```

### suggest_habits
Get habit suggestions based on your patterns.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| maxSuggestions | number | No | Maximum suggestions to return (default: 5) |
| categories | string[] | No | Filter by habit categories |

**Example:**
```
> What habits should I consider based on my patterns?

Suggested Habits Based on Your Behavior:

1. 🧘 "Morning Reflection" (High confidence: 92%)
   You naturally review your day each morning. Formalize this!
   Suggested: Daily at 8:00 AM

2. 📖 "AI Reading" (High confidence: 87%)
   You read AI content 5+ times per week already.
   Suggested: Daily, 30 minutes

3. 💻 "Code Review" (Medium confidence: 71%)
   You often discuss code quality - track your reviews.
   Suggested: Weekly on Friday

4. 🏃 "Active Break" (Medium confidence: 68%)
   You mention fatigue after long sessions. Try movement breaks.
   Suggested: Daily, during lunch
```

### organization_tips
Get suggestions for better organization.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| focus | string | No | Focus area (projects, files, tasks, calendar) |

**Example:**
```
> Any organization tips for me?

📁 Organization Suggestions:

Projects:
├─ You have 15 items in inbox.md - schedule inbox processing
├─ "MLX" and "AI Learning" topics overlap - consider merging
└─ Project "Old Website" hasn't been touched in 30 days - archive?

Tasks:
├─ 5 overdue next actions - review and reschedule
├─ Your "Waiting For" list has 3 stale items
└─ Consider weekly review for GTD maintenance

Calendar:
├─ Meeting density is highest on Wednesday (5+ meetings)
├─ No blocked time for deep work this week
└─ Consider batching similar meetings

Files:
├─ 12 files in projects/home/ haven't been accessed in 60 days
└─ Your notes directory could use subdirectories by topic
```

### session_context
Get context from previous sessions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| detailed | boolean | No | Include full conversation summaries (default: false) |

**Example:**
```
> Where did we leave off?

📍 Session Context

Last Session (Yesterday, 4:30 PM):
├─ Topic: Setting up mlx-box for local inference
├─ Completed: Downloaded Qwen3 models, configured ports
├─ Sentiment: Productive and positive
└─ Pending: Test thinking model with code agent

Pending Follow-ups:
├─ Test code generation with thinking model
├─ Update mlx-box configuration for router service
└─ Review vector store performance

Recent Topics:
├─ MLX and local AI (8 conversations)
├─ Habit tracking setup (3 conversations)
└─ Wooster development (5 conversations)

Suggested Starting Points:
├─ "Let's test the thinking model now"
├─ "Show me the mlx-box status"
└─ "What habits did we set up?"
```

### recall_conversations
Search through past conversations.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | What to search for |
| maxResults | number | No | Maximum results (default: 5) |
| dateRange | string | No | Filter by date range |

**Example:**
```
> What did we discuss about vector stores?

🔍 Conversations about "vector stores":

1. January 8, 2026 (2 days ago)
   "We discussed replacing brute-force search with HNSW.
   You decided to use hnswlib-node for O(log n) queries."
   
2. January 5, 2026 (5 days ago)
   "Analyzed the performance bottleneck in SimpleFileVectorStore.
   Found it was re-computing embeddings on every load."
   
3. January 3, 2026 (1 week ago)
   "Initial discussion about memory system upgrades.
   You mentioned wanting faster startup times."
```

### add_user_fact
Explicitly add a fact to your semantic profile.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| fact | string | Yes | The fact to remember |
| category | string | No | Category (preference, habit, goal, relationship, schedule, skill, other) |
| confidence | number | No | How certain (0-1, default: 1.0 for explicit facts) |

**Example:**
```
> Remember that I prefer dark mode in all applications
✓ Added to your profile:
├─ Category: Preference
├─ Fact: Prefers dark mode in all applications
└─ Source: Explicit (you told me)
```

## Memory System Components

### Episodic Memory

Stores conversation summaries with semantic search:

```typescript
interface Episode {
  id: string;
  timestamp: Date;
  summary: string;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  actionsTaken: string[];
  pendingFollowups: string[];
}
```

### Semantic Profile

Stores structured facts about you:

```typescript
interface UserFact {
  category: 'preference' | 'habit' | 'goal' | 'relationship' | 'schedule' | 'skill' | 'other';
  key: string;
  value: any;
  confidence: number; // 0-1
  source: 'explicit' | 'inferred';
  lastUpdated: Date;
}
```

### Pattern Types

The system detects these pattern types:

| Type | Description | Example |
|------|-------------|---------|
| habit_candidate | Consistent behavior that could become a habit | "Reviews inbox every morning" |
| productivity_peak | Times when you're most productive | "Most focused 9-11 AM" |
| topic_cluster | Frequently discussed topics | "Often discusses MLX, Python, AI" |
| goal_suggestion | Potential goals based on interests | "Interested in learning Rust" |
| organization | Suggestions for better organization | "inbox.md has 20+ items" |
| automation | Opportunities for automation | "Repeatedly exports calendar" |

## Privacy & Data

All insights data is stored locally:
- `database/memory/episodes.json` - Conversation summaries
- `database/memory/semantic_profile.json` - User facts
- `database/memory/patterns.json` - Detected patterns

No data is sent to external services (unless you're using cloud LLMs).

## Best Practices

1. **Regular check-ins**: Ask for `weekly_insights` every Monday
2. **Act on suggestions**: The system learns from what you implement
3. **Explicit facts**: Tell Wooster important preferences directly
4. **Session continuity**: Start with "where did we leave off?" after breaks
5. **Trust the patterns**: High-confidence patterns are usually accurate
