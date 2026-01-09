import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { log, LogLevel } from '../../logger';
import { GoalService, getGoalService, Goal, GoalCategory, GoalStatus, Milestone } from './GoalService';
import { AppConfig } from '../../configLoader';

let goalService: GoalService;

/**
 * Plugin metadata
 */
export const pluginName = 'goals';
export const pluginDescription = 'Track and manage long-term goals with milestones and progress tracking';

/**
 * Initialize the goals plugin
 */
export function initialize(appConfig: AppConfig): void {
  goalService = getGoalService();
  log(LogLevel.INFO, `[goals] Plugin initialized`);
}

/**
 * Get agent tools provided by this plugin
 */
export function getAgentTools(): DynamicStructuredTool[] {
  return [
    createGoalTool,
    listGoalsTool,
    goalDetailsTool,
    updateGoalProgressTool,
    addMilestoneTool,
    completeMilestoneTool,
    completeGoalTool,
    goalSummaryTool
  ];
}

/**
 * Tool: Create a new goal
 */
const createGoalTool = new DynamicStructuredTool({
  name: 'create_goal',
  description: 'Create a new goal to track progress towards',
  schema: z.object({
    title: z.string().describe('Title of the goal'),
    description: z.string().optional().describe('Detailed description'),
    category: z.enum(['health', 'finance', 'career', 'personal', 'learning', 'relationships', 'other']).default('personal').describe('Category of the goal'),
    targetDate: z.string().optional().describe('Target completion date (ISO format or natural language like "end of year")'),
    measureUnit: z.string().optional().describe('Unit of measurement (e.g., "lbs", "pages", "$")'),
    targetValue: z.number().optional().describe('Target value to reach'),
    currentValue: z.number().optional().describe('Current value (starting point)')
  }),
  func: async ({ title, description, category, targetDate, measureUnit, targetValue, currentValue }) => {
    try {
      let parsedTargetDate: Date | undefined;
      if (targetDate) {
        try {
          parsedTargetDate = new Date(targetDate);
          if (isNaN(parsedTargetDate.getTime())) {
            parsedTargetDate = undefined;
          }
        } catch {
          parsedTargetDate = undefined;
        }
      }

      const goal = goalService.createGoal({
        title,
        description,
        category: category as GoalCategory,
        targetDate: parsedTargetDate,
        measureUnit,
        targetValue,
        currentValue
      });

      let response = `🎯 Created goal: **${goal.title}**`;
      if (goal.targetValue && goal.measureUnit) {
        response += `\nTarget: ${goal.targetValue} ${goal.measureUnit}`;
      }
      if (goal.targetDate) {
        response += `\nDeadline: ${goal.targetDate.toLocaleDateString()}`;
      }
      response += `\n\nAdd milestones to break this down into smaller steps!`;

      return response;
    } catch (error: any) {
      log(LogLevel.ERROR, `[goals] Failed to create goal`, { error });
      return `Error creating goal: ${error.message}`;
    }
  }
});

/**
 * Tool: List goals
 */
const listGoalsTool = new DynamicStructuredTool({
  name: 'list_goals',
  description: 'List all goals, optionally filtered by category or status',
  schema: z.object({
    category: z.enum(['health', 'finance', 'career', 'personal', 'learning', 'relationships', 'other']).optional().describe('Filter by category'),
    showCompleted: z.boolean().optional().default(false).describe('Include completed goals')
  }),
  func: async ({ category, showCompleted }) => {
    try {
      let goals = showCompleted ? goalService.getAllGoals() : goalService.getActiveGoals();
      
      if (category) {
        goals = goals.filter(g => g.category === category);
      }

      if (goals.length === 0) {
        return 'No goals found. Create one with "set goal [title]"!';
      }

      const lines = goals.map(g => {
        const progressBar = createProgressBar(g.progress);
        const statusEmoji = g.status === 'completed' ? '✅' : g.progress >= 75 ? '🔥' : g.progress >= 50 ? '📈' : '📊';
        const deadline = g.targetDate ? ` (due ${g.targetDate.toLocaleDateString()})` : '';
        
        return `${statusEmoji} **${g.title}** - ${g.category}\n   ${progressBar} ${g.progress}%${deadline}`;
      });

      return `**Your Goals:**\n\n${lines.join('\n\n')}`;
    } catch (error: any) {
      log(LogLevel.ERROR, `[goals] Failed to list goals`, { error });
      return `Error listing goals: ${error.message}`;
    }
  }
});

/**
 * Tool: Get goal details
 */
const goalDetailsTool = new DynamicStructuredTool({
  name: 'goal_details',
  description: 'Get detailed information about a specific goal including milestones',
  schema: z.object({
    goalTitle: z.string().describe('Title or partial title of the goal')
  }),
  func: async ({ goalTitle }) => {
    try {
      const goals = goalService.getAllGoals();
      const goal = goals.find(g => 
        g.title.toLowerCase().includes(goalTitle.toLowerCase())
      );

      if (!goal) {
        return `Could not find goal matching "${goalTitle}"`;
      }

      const milestones = goalService.getMilestones(goal.id);
      const progressHistory = goalService.getProgressHistory(goal.id, 5);

      const lines = [
        `# ${goal.title}`,
        '',
        `**Category:** ${goal.category}`,
        `**Status:** ${goal.status}`,
        `**Progress:** ${createProgressBar(goal.progress)} ${goal.progress}%`,
        ''
      ];

      if (goal.description) {
        lines.push(`**Description:** ${goal.description}`, '');
      }

      if (goal.targetValue && goal.measureUnit) {
        lines.push(`**Target:** ${goal.currentValue || 0} / ${goal.targetValue} ${goal.measureUnit}`, '');
      }

      if (goal.targetDate) {
        const daysRemaining = Math.ceil((goal.targetDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        lines.push(`**Deadline:** ${goal.targetDate.toLocaleDateString()} (${daysRemaining > 0 ? `${daysRemaining} days left` : 'overdue'})`, '');
      }

      if (milestones.length > 0) {
        lines.push('**Milestones:**');
        for (const m of milestones) {
          const emoji = m.isCompleted ? '✅' : '⬜';
          lines.push(`  ${emoji} ${m.title}`);
        }
        lines.push('');
      }

      if (progressHistory.length > 0) {
        lines.push('**Recent Progress:**');
        for (const p of progressHistory.slice(0, 3)) {
          const delta = p.progressDelta !== undefined ? ` (${p.progressDelta >= 0 ? '+' : ''}${p.progressDelta})` : '';
          lines.push(`  - ${p.date.toLocaleDateString()}${p.value !== undefined ? `: ${p.value}` : ''}${delta}${p.notes ? ` - ${p.notes}` : ''}`);
        }
      }

      return lines.join('\n');
    } catch (error: any) {
      log(LogLevel.ERROR, `[goals] Failed to get goal details`, { error });
      return `Error getting goal details: ${error.message}`;
    }
  }
});

/**
 * Tool: Update goal progress
 */
const updateGoalProgressTool = new DynamicStructuredTool({
  name: 'update_goal_progress',
  description: 'Update progress on a goal with optional value and notes',
  schema: z.object({
    goalTitle: z.string().describe('Title of the goal to update'),
    value: z.number().optional().describe('New current value (for measurable goals)'),
    progress: z.number().optional().describe('New progress percentage (0-100)'),
    notes: z.string().optional().describe('Notes about this progress update')
  }),
  func: async ({ goalTitle, value, progress, notes }) => {
    try {
      const goals = goalService.getActiveGoals();
      const goal = goals.find(g => 
        g.title.toLowerCase().includes(goalTitle.toLowerCase())
      );

      if (!goal) {
        return `Could not find active goal matching "${goalTitle}"`;
      }

      // Record progress entry
      if (value !== undefined || notes) {
        goalService.updateProgress(goal.id, value, notes);
      }

      // Update progress percentage if provided directly
      if (progress !== undefined) {
        goalService.updateGoal(goal.id, { progress });
      }

      const updatedGoal = goalService.getGoal(goal.id)!;
      
      let response = `📊 Updated **${updatedGoal.title}**\n${createProgressBar(updatedGoal.progress)} ${updatedGoal.progress}%`;
      
      if (updatedGoal.targetValue && updatedGoal.measureUnit) {
        response += `\nCurrent: ${updatedGoal.currentValue || 0} / ${updatedGoal.targetValue} ${updatedGoal.measureUnit}`;
      }

      if (updatedGoal.progress >= 100) {
        response += '\n\n🎉 Goal complete! Mark it as completed with "complete goal [name]"';
      }

      return response;
    } catch (error: any) {
      log(LogLevel.ERROR, `[goals] Failed to update progress`, { error });
      return `Error updating progress: ${error.message}`;
    }
  }
});

/**
 * Tool: Add milestone to goal
 */
const addMilestoneTool = new DynamicStructuredTool({
  name: 'add_milestone',
  description: 'Add a milestone to a goal',
  schema: z.object({
    goalTitle: z.string().describe('Title of the goal'),
    milestoneTitle: z.string().describe('Title of the milestone'),
    description: z.string().optional().describe('Description of the milestone'),
    targetDate: z.string().optional().describe('Target date for this milestone')
  }),
  func: async ({ goalTitle, milestoneTitle, description, targetDate }) => {
    try {
      const goals = goalService.getAllGoals();
      const goal = goals.find(g => 
        g.title.toLowerCase().includes(goalTitle.toLowerCase())
      );

      if (!goal) {
        return `Could not find goal matching "${goalTitle}"`;
      }

      let parsedDate: Date | undefined;
      if (targetDate) {
        try {
          parsedDate = new Date(targetDate);
          if (isNaN(parsedDate.getTime())) parsedDate = undefined;
        } catch { parsedDate = undefined; }
      }

      const milestone = goalService.addMilestone(goal.id, {
        title: milestoneTitle,
        description,
        targetDate: parsedDate
      });

      if (!milestone) {
        return 'Failed to add milestone';
      }

      const allMilestones = goalService.getMilestones(goal.id);
      return `✅ Added milestone "${milestone.title}" to **${goal.title}**\n\nMilestones (${allMilestones.filter(m => m.isCompleted).length}/${allMilestones.length}):\n${allMilestones.map(m => `  ${m.isCompleted ? '✅' : '⬜'} ${m.title}`).join('\n')}`;
    } catch (error: any) {
      log(LogLevel.ERROR, `[goals] Failed to add milestone`, { error });
      return `Error adding milestone: ${error.message}`;
    }
  }
});

/**
 * Tool: Complete a milestone
 */
const completeMilestoneTool = new DynamicStructuredTool({
  name: 'complete_milestone',
  description: 'Mark a milestone as completed',
  schema: z.object({
    goalTitle: z.string().describe('Title of the goal'),
    milestoneTitle: z.string().describe('Title of the milestone to complete')
  }),
  func: async ({ goalTitle, milestoneTitle }) => {
    try {
      const goals = goalService.getAllGoals();
      const goal = goals.find(g => 
        g.title.toLowerCase().includes(goalTitle.toLowerCase())
      );

      if (!goal) {
        return `Could not find goal matching "${goalTitle}"`;
      }

      const milestones = goalService.getMilestones(goal.id);
      const milestone = milestones.find(m => 
        m.title.toLowerCase().includes(milestoneTitle.toLowerCase())
      );

      if (!milestone) {
        return `Could not find milestone matching "${milestoneTitle}"`;
      }

      if (milestone.isCompleted) {
        return `Milestone "${milestone.title}" is already completed`;
      }

      goalService.completeMilestone(milestone.id);
      
      const updatedGoal = goalService.getGoal(goal.id)!;
      const updatedMilestones = goalService.getMilestones(goal.id);
      const completedCount = updatedMilestones.filter(m => m.isCompleted).length;

      return `✅ Completed milestone: **${milestone.title}**\n\n**${goal.title}** progress: ${createProgressBar(updatedGoal.progress)} ${updatedGoal.progress}%\nMilestones: ${completedCount}/${updatedMilestones.length}`;
    } catch (error: any) {
      log(LogLevel.ERROR, `[goals] Failed to complete milestone`, { error });
      return `Error completing milestone: ${error.message}`;
    }
  }
});

/**
 * Tool: Complete a goal
 */
const completeGoalTool = new DynamicStructuredTool({
  name: 'complete_goal',
  description: 'Mark a goal as completed',
  schema: z.object({
    goalTitle: z.string().describe('Title of the goal to complete')
  }),
  func: async ({ goalTitle }) => {
    try {
      const goals = goalService.getActiveGoals();
      const goal = goals.find(g => 
        g.title.toLowerCase().includes(goalTitle.toLowerCase())
      );

      if (!goal) {
        return `Could not find active goal matching "${goalTitle}"`;
      }

      goalService.updateGoal(goal.id, { status: 'completed' });

      return `🎉 **Congratulations!** Goal completed: **${goal.title}**\n\nTotal progress tracked since ${goal.createdAt.toLocaleDateString()}.`;
    } catch (error: any) {
      log(LogLevel.ERROR, `[goals] Failed to complete goal`, { error });
      return `Error completing goal: ${error.message}`;
    }
  }
});

/**
 * Tool: Get goals summary
 */
const goalSummaryTool = new DynamicStructuredTool({
  name: 'goal_summary',
  description: 'Get an overview of all goals, including at-risk goals and upcoming deadlines',
  schema: z.object({}),
  func: async () => {
    try {
      const summary = goalService.getDailySummary();

      const lines = [
        `**Goals Overview**`,
        '',
        `📊 **Active Goals:** ${summary.activeGoals}`,
        `✅ **On Track:** ${summary.goalsOnTrack}`,
        ''
      ];

      if (summary.goalsAtRisk.length > 0) {
        lines.push(`⚠️ **At Risk:**`);
        for (const g of summary.goalsAtRisk) {
          lines.push(`  - ${g.title} (${g.progress}% with deadline ${g.targetDate?.toLocaleDateString()})`);
        }
        lines.push('');
      }

      if (summary.upcomingDeadlines.length > 0) {
        lines.push(`📅 **Upcoming Deadlines:**`);
        for (const g of summary.upcomingDeadlines) {
          const daysLeft = Math.ceil((g.targetDate!.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          lines.push(`  - ${g.title}: ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`);
        }
        lines.push('');
      }

      if (summary.recentlyCompleted.length > 0) {
        lines.push(`🎉 **Recently Completed:**`);
        for (const g of summary.recentlyCompleted) {
          lines.push(`  - ${g.title}`);
        }
      }

      return lines.join('\n');
    } catch (error: any) {
      log(LogLevel.ERROR, `[goals] Failed to get summary`, { error });
      return `Error getting summary: ${error.message}`;
    }
  }
});

/**
 * Create a visual progress bar
 */
function createProgressBar(progress: number): string {
  const filled = Math.round(progress / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Cleanup plugin resources
 */
export function cleanup(): void {
  if (goalService) {
    goalService.close();
  }
}

export { GoalService, getGoalService, Goal, GoalCategory, GoalStatus, Milestone };
