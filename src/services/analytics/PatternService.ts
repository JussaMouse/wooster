import { log, LogLevel } from '../../logger';
import { getEpisodicMemory, Episode } from '../memory/EpisodicMemory';
import { getSemanticProfile, UserFact } from '../memory/SemanticProfile';
import { getHabitService } from '../../plugins/habits/HabitService';
import { getGoalService } from '../../plugins/goals/GoalService';

/**
 * Detected pattern types
 */
export type PatternType = 
  | 'habit_candidate'      // Consistent behavior that could become a habit
  | 'productivity_peak'    // Times when user is most productive
  | 'topic_cluster'        // Frequently discussed topics
  | 'goal_suggestion'      // Potential goals based on interests
  | 'organization'         // Suggestions for better organization
  | 'automation';          // Opportunities for automation

/**
 * Detected pattern
 */
export interface Pattern {
  type: PatternType;
  title: string;
  description: string;
  confidence: number; // 0-1
  frequency: number; // How often this pattern occurs
  data: Record<string, unknown>;
  suggestion?: string;
  detectedAt: Date;
}

/**
 * Weekly insights summary
 */
export interface WeeklyInsights {
  patterns: Pattern[];
  suggestions: string[];
  habitOpportunities: Pattern[];
  organizationTips: Pattern[];
  automationIdeas: Pattern[];
  topTopics: string[];
  productivityScore: number;
}

/**
 * PatternService - Detects patterns in user behavior for proactive suggestions
 */
export class PatternService {
  private cachedPatterns: Pattern[] = [];
  private lastAnalysis: Date | null = null;
  private analysisInterval = 60 * 60 * 1000; // 1 hour

  constructor() {}

  /**
   * Analyze user patterns across all data sources
   */
  async analyzePatterns(): Promise<Pattern[]> {
    // Check if we need to re-analyze
    if (this.lastAnalysis && Date.now() - this.lastAnalysis.getTime() < this.analysisInterval) {
      return this.cachedPatterns;
    }

    const patterns: Pattern[] = [];
    const now = new Date();

    try {
      // Analyze episodic memory for topic patterns
      const topicPatterns = await this.analyzeTopicPatterns();
      patterns.push(...topicPatterns);

      // Analyze for habit candidates
      const habitPatterns = await this.analyzeHabitCandidates();
      patterns.push(...habitPatterns);

      // Analyze productivity patterns
      const productivityPatterns = await this.analyzeProductivityPatterns();
      patterns.push(...productivityPatterns);

      // Analyze for organization suggestions
      const orgPatterns = await this.analyzeOrganization();
      patterns.push(...orgPatterns);

      // Analyze for automation opportunities
      const autoPatterns = await this.analyzeAutomation();
      patterns.push(...autoPatterns);

      this.cachedPatterns = patterns;
      this.lastAnalysis = now;

      log(LogLevel.DEBUG, `PatternService: Detected ${patterns.length} patterns`);

    } catch (error) {
      log(LogLevel.WARN, `PatternService: Error analyzing patterns`, { error });
    }

    return patterns;
  }

  /**
   * Analyze topic patterns from episodic memory
   */
  private async analyzeTopicPatterns(): Promise<Pattern[]> {
    const patterns: Pattern[] = [];
    
    try {
      const episodicMemory = await getEpisodicMemory();
      const episodes = episodicMemory.getAllEpisodes();
      
      if (episodes.length < 5) return patterns;

      // Count topic frequencies
      const topicCounts = new Map<string, number>();
      for (const episode of episodes) {
        for (const topic of episode.topics) {
          topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
        }
      }

      // Find topics mentioned frequently
      const topTopics = Array.from(topicCounts.entries())
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      for (const [topic, count] of topTopics) {
        patterns.push({
          type: 'topic_cluster',
          title: `Frequent topic: ${topic}`,
          description: `You've discussed "${topic}" in ${count} conversations`,
          confidence: Math.min(0.9, count / 10),
          frequency: count,
          data: { topic, count, totalEpisodes: episodes.length },
          suggestion: `Consider creating a dedicated project or note collection for "${topic}"`,
          detectedAt: new Date()
        });
      }

    } catch (error) {
      log(LogLevel.DEBUG, `PatternService: Could not analyze topics`, { error });
    }

    return patterns;
  }

  /**
   * Analyze for potential habit candidates
   */
  private async analyzeHabitCandidates(): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    try {
      const semanticProfile = await getSemanticProfile();
      const habits = semanticProfile.getFactsByCategory('habit');

      for (const habit of habits) {
        if (habit.mentions >= 3 && habit.source === 'inferred') {
          patterns.push({
            type: 'habit_candidate',
            title: `Potential habit: ${habit.key}`,
            description: `You've mentioned "${habit.value}" ${habit.mentions} times`,
            confidence: Math.min(0.8, habit.mentions / 5),
            frequency: habit.mentions,
            data: { ...habit, lastUpdated: habit.lastUpdated.toISOString() },
            suggestion: `Would you like to track "${habit.value}" as a habit?`,
            detectedAt: new Date()
          });
        }
      }

    } catch (error) {
      log(LogLevel.DEBUG, `PatternService: Could not analyze habit candidates`, { error });
    }

    return patterns;
  }

  /**
   * Analyze productivity patterns
   */
  private async analyzeProductivityPatterns(): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    try {
      const episodicMemory = await getEpisodicMemory();
      const episodes = episodicMemory.getAllEpisodes();
      
      if (episodes.length < 10) return patterns;

      // Analyze by hour of day
      const hourCounts = new Map<number, { productive: number; total: number }>();
      
      for (const episode of episodes) {
        const hour = episode.timestamp.getHours();
        const current = hourCounts.get(hour) || { productive: 0, total: 0 };
        current.total++;
        
        // Consider episode productive if it has actions taken
        if (episode.actionsTaken.length > 0) {
          current.productive++;
        }
        
        hourCounts.set(hour, current);
      }

      // Find peak productivity hours
      const productiveHours = Array.from(hourCounts.entries())
        .filter(([_, data]) => data.total >= 3 && data.productive / data.total >= 0.5)
        .sort((a, b) => (b[1].productive / b[1].total) - (a[1].productive / a[1].total));

      if (productiveHours.length > 0) {
        const [peakHour, data] = productiveHours[0];
        patterns.push({
          type: 'productivity_peak',
          title: `Peak productivity around ${peakHour}:00`,
          description: `You're most productive between ${peakHour}:00 and ${peakHour + 1}:00`,
          confidence: data.productive / data.total,
          frequency: data.total,
          data: { hour: peakHour, ...data },
          suggestion: `Consider scheduling important tasks around ${peakHour}:00`,
          detectedAt: new Date()
        });
      }

    } catch (error) {
      log(LogLevel.DEBUG, `PatternService: Could not analyze productivity`, { error });
    }

    return patterns;
  }

  /**
   * Analyze for organization suggestions
   */
  private async analyzeOrganization(): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    try {
      const semanticProfile = await getSemanticProfile();
      const interests = semanticProfile.getFactsByCategory('interest');
      const goals = semanticProfile.getFactsByCategory('goal');

      // Suggest organizing around interests
      const unorganizedInterests = interests.filter(i => i.mentions >= 2);
      for (const interest of unorganizedInterests.slice(0, 3)) {
          patterns.push({
            type: 'organization',
            title: `Organize: ${interest.value}`,
            description: `You've shown interest in "${interest.value}" multiple times`,
            confidence: 0.6,
            frequency: interest.mentions,
            data: { ...interest, lastUpdated: interest.lastUpdated.toISOString() },
            suggestion: `Create a project or tag for "${interest.value}" to organize related items`,
            detectedAt: new Date()
          });
      }

      // Suggest goals based on expressed intentions
      for (const goal of goals.slice(0, 3)) {
        const goalService = getGoalService();
        const existingGoals = goalService.getAllGoals();
        
        const alreadyTracked = existingGoals.some(g => 
          g.title.toLowerCase().includes(String(goal.value).toLowerCase().split(' ').slice(0, 2).join(' '))
        );

        if (!alreadyTracked) {
          patterns.push({
            type: 'goal_suggestion',
            title: `Potential goal: ${goal.value}`,
            description: `You mentioned wanting to "${goal.value}"`,
            confidence: goal.confidence,
            frequency: goal.mentions,
            data: { ...goal, lastUpdated: goal.lastUpdated.toISOString() },
            suggestion: `Would you like to track "${goal.value}" as a goal?`,
            detectedAt: new Date()
          });
        }
      }

    } catch (error) {
      log(LogLevel.DEBUG, `PatternService: Could not analyze organization`, { error });
    }

    return patterns;
  }

  /**
   * Analyze for automation opportunities
   */
  private async analyzeAutomation(): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    try {
      const episodicMemory = await getEpisodicMemory();
      const episodes = episodicMemory.getAllEpisodes();
      
      // Look for repeated actions
      const actionCounts = new Map<string, number>();
      for (const episode of episodes) {
        for (const action of episode.actionsTaken) {
          // Normalize action text
          const normalized = action.toLowerCase().replace(/\d+/g, '#').trim();
          actionCounts.set(normalized, (actionCounts.get(normalized) || 0) + 1);
        }
      }

      // Find frequently repeated actions
      const repeatedActions = Array.from(actionCounts.entries())
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      for (const [action, count] of repeatedActions) {
        patterns.push({
          type: 'automation',
          title: `Repeated action: ${action.slice(0, 30)}...`,
          description: `You've done this ${count} times`,
          confidence: Math.min(0.7, count / 10),
          frequency: count,
          data: { action, count },
          suggestion: `This might be a candidate for automation or a quick action shortcut`,
          detectedAt: new Date()
        });
      }

    } catch (error) {
      log(LogLevel.DEBUG, `PatternService: Could not analyze automation`, { error });
    }

    return patterns;
  }

  /**
   * Generate weekly insights
   */
  async getWeeklyInsights(): Promise<WeeklyInsights> {
    const patterns = await this.analyzePatterns();
    
    // Categorize patterns
    const habitOpportunities = patterns.filter(p => p.type === 'habit_candidate');
    const organizationTips = patterns.filter(p => p.type === 'organization' || p.type === 'goal_suggestion');
    const automationIdeas = patterns.filter(p => p.type === 'automation');
    
    // Extract top topics
    const topTopics = patterns
      .filter(p => p.type === 'topic_cluster')
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5)
      .map(p => p.data.topic as string);

    // Generate suggestions
    const suggestions = patterns
      .filter(p => p.suggestion && p.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(p => p.suggestion!);

    // Calculate productivity score (simplified)
    const productivityPatterns = patterns.filter(p => p.type === 'productivity_peak');
    const productivityScore = productivityPatterns.length > 0 
      ? Math.round(productivityPatterns[0].confidence * 100)
      : 50;

    return {
      patterns,
      suggestions,
      habitOpportunities,
      organizationTips,
      automationIdeas,
      topTopics,
      productivityScore
    };
  }

  /**
   * Format insights as a readable summary
   */
  async formatInsightsSummary(): Promise<string> {
    const insights = await this.getWeeklyInsights();
    const lines: string[] = ['## Weekly Insights', ''];

    // Productivity
    lines.push(`📊 **Productivity Score:** ${insights.productivityScore}/100`);
    lines.push('');

    // Top suggestions
    if (insights.suggestions.length > 0) {
      lines.push('### 💡 Suggestions');
      for (const suggestion of insights.suggestions) {
        lines.push(`- ${suggestion}`);
      }
      lines.push('');
    }

    // Top topics
    if (insights.topTopics.length > 0) {
      lines.push(`### 🏷️ Your Focus Areas`);
      lines.push(insights.topTopics.join(', '));
      lines.push('');
    }

    // Habit opportunities
    if (insights.habitOpportunities.length > 0) {
      lines.push('### 🔄 Potential New Habits');
      for (const habit of insights.habitOpportunities.slice(0, 3)) {
        lines.push(`- ${habit.title}`);
      }
      lines.push('');
    }

    // Organization tips
    if (insights.organizationTips.length > 0) {
      lines.push('### 📁 Organization Ideas');
      for (const tip of insights.organizationTips.slice(0, 3)) {
        lines.push(`- ${tip.suggestion || tip.title}`);
      }
      lines.push('');
    }

    // Automation ideas
    if (insights.automationIdeas.length > 0) {
      lines.push('### ⚡ Automation Opportunities');
      for (const idea of insights.automationIdeas.slice(0, 2)) {
        lines.push(`- ${idea.title}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Force re-analysis
   */
  invalidateCache(): void {
    this.lastAnalysis = null;
    this.cachedPatterns = [];
  }
}

// Singleton instance
let patternServiceInstance: PatternService | null = null;

/**
 * Get or create the pattern service instance
 */
export function getPatternService(): PatternService {
  if (!patternServiceInstance) {
    patternServiceInstance = new PatternService();
  }
  return patternServiceInstance;
}
