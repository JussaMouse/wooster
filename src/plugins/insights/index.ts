import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { log, LogLevel } from '../../logger';
import { getPatternService, PatternService, Pattern, WeeklyInsights } from '../../services/analytics/PatternService';
import { getSessionState, SessionState, initializeSessionState } from '../../services/memory/SessionState';
import { AppConfig } from '../../configLoader';

let patternService: PatternService;
let sessionState: SessionState | null = null;

/**
 * Plugin metadata
 */
export const pluginName = 'insights';
export const pluginDescription = 'Proactive suggestions and pattern recognition for productivity improvement';

/**
 * Initialize the insights plugin
 */
export async function initialize(appConfig: AppConfig): Promise<void> {
  patternService = getPatternService();
  
  try {
    sessionState = await initializeSessionState(appConfig);
    log(LogLevel.INFO, `[insights] Plugin initialized with session state`);
  } catch (error) {
    log(LogLevel.WARN, `[insights] Could not initialize session state`, { error });
    log(LogLevel.INFO, `[insights] Plugin initialized without session state`);
  }
}

/**
 * Get agent tools provided by this plugin
 */
export function getAgentTools(): DynamicStructuredTool[] {
  return [
    weeklyInsightsTool,
    suggestHabitsTool,
    organizationTipsTool,
    sessionContextTool,
    recallConversationsTool,
    addUserFactTool
  ];
}

/**
 * Tool: Get weekly insights
 */
const weeklyInsightsTool = new DynamicStructuredTool({
  name: 'weekly_insights',
  description: 'Get weekly insights about productivity patterns, habit opportunities, and organization suggestions',
  schema: z.object({}),
  func: async () => {
    try {
      const summary = await patternService.formatInsightsSummary();
      return summary || 'Not enough data yet to generate insights. Keep using Wooster and check back later!';
    } catch (error: any) {
      log(LogLevel.ERROR, `[insights] Failed to get weekly insights`, { error });
      return `Error getting insights: ${error.message}`;
    }
  }
});

/**
 * Tool: Get habit suggestions based on patterns
 */
const suggestHabitsTool = new DynamicStructuredTool({
  name: 'suggest_habits',
  description: 'Get suggestions for new habits based on detected behavior patterns',
  schema: z.object({}),
  func: async () => {
    try {
      const insights = await patternService.getWeeklyInsights();
      
      if (insights.habitOpportunities.length === 0) {
        return 'No habit suggestions yet. As I learn more about your routines, I\'ll suggest habits that might work for you!';
      }

      const lines = ['## 🔄 Suggested Habits', ''];
      lines.push('Based on patterns I\'ve noticed in our conversations:', '');

      for (const pattern of insights.habitOpportunities) {
        lines.push(`### ${pattern.title}`);
        lines.push(pattern.description);
        if (pattern.suggestion) {
          lines.push(`**Action:** ${pattern.suggestion}`);
        }
        lines.push('');
      }

      lines.push('To track any of these, just say "add habit [name]"!');
      
      return lines.join('\n');
    } catch (error: any) {
      log(LogLevel.ERROR, `[insights] Failed to suggest habits`, { error });
      return `Error getting suggestions: ${error.message}`;
    }
  }
});

/**
 * Tool: Get organization tips
 */
const organizationTipsTool = new DynamicStructuredTool({
  name: 'organization_tips',
  description: 'Get suggestions for better organizing your projects, notes, and life areas',
  schema: z.object({}),
  func: async () => {
    try {
      const insights = await patternService.getWeeklyInsights();
      
      const tips = [
        ...insights.organizationTips,
        ...insights.automationIdeas
      ];

      if (tips.length === 0) {
        return 'No organization suggestions yet. Keep chatting with me about your projects and interests!';
      }

      const lines = ['## 📁 Organization Suggestions', ''];

      if (insights.topTopics.length > 0) {
        lines.push(`**Your main focus areas:** ${insights.topTopics.join(', ')}`, '');
      }

      for (const tip of tips.slice(0, 5)) {
        const emoji = tip.type === 'automation' ? '⚡' : 
                      tip.type === 'goal_suggestion' ? '🎯' : '📁';
        lines.push(`${emoji} **${tip.title}**`);
        if (tip.suggestion) {
          lines.push(`   ${tip.suggestion}`);
        }
        lines.push('');
      }

      return lines.join('\n');
    } catch (error: any) {
      log(LogLevel.ERROR, `[insights] Failed to get organization tips`, { error });
      return `Error getting tips: ${error.message}`;
    }
  }
});

/**
 * Tool: Get session context (where we left off)
 */
const sessionContextTool = new DynamicStructuredTool({
  name: 'session_context',
  description: 'Get context from previous sessions - what was discussed, pending follow-ups, and relevant user facts',
  schema: z.object({}),
  func: async () => {
    try {
      if (!sessionState) {
        return 'Session memory not yet initialized. This will improve over time!';
      }

      const prompt = await sessionState.getSessionPrompt();
      
      if (!prompt.trim()) {
        return 'This is our first conversation! I\'ll remember our interactions for next time.';
      }

      return prompt;
    } catch (error: any) {
      log(LogLevel.ERROR, `[insights] Failed to get session context`, { error });
      return `Error getting session context: ${error.message}`;
    }
  }
});

/**
 * Tool: Recall past conversations
 */
const recallConversationsTool = new DynamicStructuredTool({
  name: 'recall_conversations',
  description: 'Search and recall past conversations about a specific topic',
  schema: z.object({
    query: z.string().describe('Topic or keywords to search for in past conversations')
  }),
  func: async ({ query }) => {
    try {
      if (!sessionState) {
        return 'Session memory not yet initialized.';
      }

      const episodes = await sessionState.recallRelevant(query, 5);
      
      if (episodes.length === 0) {
        return `I don't recall any conversations about "${query}". We may not have discussed this before.`;
      }

      const lines = [`## Conversations about "${query}"`, ''];
      
      for (const episode of episodes) {
        const timeAgo = formatTimeAgo(episode.timestamp);
        lines.push(`### ${timeAgo}`);
        lines.push(episode.summary);
        if (episode.topics.length > 0) {
          lines.push(`*Topics: ${episode.topics.join(', ')}*`);
        }
        if (episode.actionsTaken.length > 0) {
          lines.push(`*Actions: ${episode.actionsTaken.slice(0, 2).join(', ')}*`);
        }
        lines.push('');
      }

      return lines.join('\n');
    } catch (error: any) {
      log(LogLevel.ERROR, `[insights] Failed to recall conversations`, { error });
      return `Error recalling conversations: ${error.message}`;
    }
  }
});

/**
 * Tool: Add a fact about the user
 */
const addUserFactTool = new DynamicStructuredTool({
  name: 'remember_fact',
  description: 'Remember a fact about the user for future reference',
  schema: z.object({
    category: z.enum(['preference', 'habit', 'goal', 'relationship', 'schedule', 'interest']).describe('Category of the fact'),
    key: z.string().describe('Short key/name for the fact (e.g., "coffee", "wake_time")'),
    value: z.string().describe('The value or detail to remember')
  }),
  func: async ({ category, key, value }) => {
    try {
      if (!sessionState) {
        return 'Session memory not yet initialized.';
      }

      await sessionState.addFact(category, key, value, {
        confidence: 0.9,
        source: 'explicit'
      });

      return `✅ I'll remember that! (${category}: ${key} = ${value})`;
    } catch (error: any) {
      log(LogLevel.ERROR, `[insights] Failed to add fact`, { error });
      return `Error remembering fact: ${error.message}`;
    }
  }
});

/**
 * Format time ago
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

/**
 * Cleanup plugin resources
 */
export async function cleanup(): Promise<void> {
  if (sessionState) {
    await sessionState.dispose();
  }
}

export { PatternService, getPatternService };
