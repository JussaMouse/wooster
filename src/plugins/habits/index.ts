import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { log, LogLevel } from '../../logger';
import { HabitService, getHabitService, Habit, HabitFrequency } from './HabitService';
import { AppConfig } from '../../configLoader';

let habitService: HabitService;

/**
 * Plugin metadata
 */
export const pluginName = 'habits';
export const pluginDescription = 'Track and manage habits with streaks and reminders';

/**
 * Initialize the habits plugin
 */
export function initialize(appConfig: AppConfig): void {
  habitService = getHabitService();
  log(LogLevel.INFO, `[habits] Plugin initialized`);
}

/**
 * Get agent tools provided by this plugin
 */
export function getAgentTools(): DynamicStructuredTool[] {
  return [
    createHabitTool,
    checkInHabitTool,
    listHabitsTool,
    habitStatusTool,
    updateHabitTool,
    deleteHabitTool,
    habitStatsTool
  ];
}

/**
 * Tool: Create a new habit
 */
const createHabitTool = new DynamicStructuredTool({
  name: 'create_habit',
  description: 'Create a new habit to track. Supports daily, weekly, or monthly habits.',
  schema: z.object({
    name: z.string().describe('Name of the habit (e.g., "Morning meditation")'),
    description: z.string().optional().describe('Optional description'),
    frequency: z.enum(['daily', 'weekly', 'monthly']).default('daily').describe('How often the habit should be done'),
    targetDays: z.array(z.number()).optional().describe('For weekly: days 0-6 (0=Sunday). For monthly: days 1-31'),
    category: z.string().optional().describe('Category like "health", "productivity", "learning"'),
    reminderTime: z.string().optional().describe('Reminder time in HH:MM format')
  }),
  func: async ({ name, description, frequency, targetDays, category, reminderTime }) => {
    try {
      const habit = habitService.createHabit({
        name,
        description,
        frequency: frequency as HabitFrequency,
        targetDays: targetDays || (frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : []),
        isActive: true,
        category,
        reminderTime
      });

      return `✅ Created habit "${habit.name}"${category ? ` in category "${category}"` : ''}. Track it ${frequency}!`;
    } catch (error: any) {
      log(LogLevel.ERROR, `[habits] Failed to create habit`, { error });
      return `Error creating habit: ${error.message}`;
    }
  }
});

/**
 * Tool: Check in to a habit
 */
const checkInHabitTool = new DynamicStructuredTool({
  name: 'habit_checkin',
  description: 'Record completion of a habit (check-in). Use this when the user says they completed a habit.',
  schema: z.object({
    habitName: z.string().describe('Name or partial name of the habit to check in'),
    notes: z.string().optional().describe('Optional notes about the completion')
  }),
  func: async ({ habitName, notes }) => {
    try {
      const habits = habitService.getActiveHabits();
      const habit = habits.find(h => 
        h.name.toLowerCase().includes(habitName.toLowerCase()) ||
        habitName.toLowerCase().includes(h.name.toLowerCase())
      );

      if (!habit) {
        return `Could not find habit matching "${habitName}". Available habits: ${habits.map(h => h.name).join(', ')}`;
      }

      const completion = habitService.checkIn(habit.id, notes);
      
      if (!completion) {
        return `You've already checked in "${habit.name}" today! 🎯`;
      }

      const updatedHabit = habitService.getHabit(habit.id)!;
      const streakEmoji = updatedHabit.streak >= 7 ? '🔥' : updatedHabit.streak >= 3 ? '⭐' : '✅';
      
      return `${streakEmoji} Checked in "${habit.name}"! Current streak: ${updatedHabit.streak} days${updatedHabit.streak === updatedHabit.longestStreak && updatedHabit.streak > 1 ? ' (personal best!)' : ''}`;
    } catch (error: any) {
      log(LogLevel.ERROR, `[habits] Failed to check in`, { error });
      return `Error checking in: ${error.message}`;
    }
  }
});

/**
 * Tool: List habits
 */
const listHabitsTool = new DynamicStructuredTool({
  name: 'list_habits',
  description: 'List all tracked habits',
  schema: z.object({
    category: z.string().optional().describe('Filter by category'),
    showInactive: z.boolean().optional().default(false).describe('Include inactive habits')
  }),
  func: async ({ category, showInactive }) => {
    try {
      let habits = showInactive ? habitService.getAllHabits() : habitService.getActiveHabits();
      
      if (category) {
        habits = habits.filter(h => h.category?.toLowerCase() === category.toLowerCase());
      }

      if (habits.length === 0) {
        return 'No habits found. Create one with "add habit [name]"!';
      }

      const lines = habits.map(h => {
        const streakEmoji = h.streak >= 7 ? '🔥' : h.streak >= 3 ? '⭐' : h.streak > 0 ? '📈' : '⬜';
        return `${streakEmoji} **${h.name}** - ${h.frequency}${h.category ? ` (${h.category})` : ''} - Streak: ${h.streak}${!h.isActive ? ' [inactive]' : ''}`;
      });

      return `**Your Habits:**\n${lines.join('\n')}`;
    } catch (error: any) {
      log(LogLevel.ERROR, `[habits] Failed to list habits`, { error });
      return `Error listing habits: ${error.message}`;
    }
  }
});

/**
 * Tool: Get today's habit status
 */
const habitStatusTool = new DynamicStructuredTool({
  name: 'habit_status',
  description: 'Get status of habits for today - what is completed and what remains',
  schema: z.object({}),
  func: async () => {
    try {
      const summary = habitService.getDailySummary();
      const todayStatus = habitService.getTodayStatus();

      const lines: string[] = [];
      
      lines.push(`**Today's Habits:** ${summary.completed}/${summary.completed + summary.remaining} completed\n`);

      if (todayStatus.length === 0) {
        lines.push('No habits scheduled for today.');
      } else {
        for (const { habit, completed } of todayStatus) {
          const emoji = completed ? '✅' : '⬜';
          const streakInfo = habit.streak > 0 ? ` (${habit.streak} day streak)` : '';
          lines.push(`${emoji} ${habit.name}${streakInfo}`);
        }
      }

      if (summary.streaksAtRisk.length > 0) {
        lines.push(`\n⚠️ **Streaks at risk:** ${summary.streaksAtRisk.map(h => `${h.name} (${h.streak} days)`).join(', ')}`);
      }

      if (summary.topStreaks.length > 0 && summary.topStreaks[0].streak >= 7) {
        lines.push(`\n🔥 **Top streaks:** ${summary.topStreaks.slice(0, 3).map(h => `${h.name} (${h.streak})`).join(', ')}`);
      }

      return lines.join('\n');
    } catch (error: any) {
      log(LogLevel.ERROR, `[habits] Failed to get status`, { error });
      return `Error getting status: ${error.message}`;
    }
  }
});

/**
 * Tool: Update a habit
 */
const updateHabitTool = new DynamicStructuredTool({
  name: 'update_habit',
  description: 'Update a habit\'s settings',
  schema: z.object({
    habitName: z.string().describe('Name of the habit to update'),
    newName: z.string().optional().describe('New name for the habit'),
    description: z.string().optional().describe('New description'),
    frequency: z.enum(['daily', 'weekly', 'monthly']).optional().describe('New frequency'),
    category: z.string().optional().describe('New category'),
    isActive: z.boolean().optional().describe('Set active/inactive')
  }),
  func: async ({ habitName, newName, description, frequency, category, isActive }) => {
    try {
      const habits = habitService.getAllHabits();
      const habit = habits.find(h => 
        h.name.toLowerCase().includes(habitName.toLowerCase())
      );

      if (!habit) {
        return `Could not find habit matching "${habitName}"`;
      }

      const updates: any = {};
      if (newName) updates.name = newName;
      if (description !== undefined) updates.description = description;
      if (frequency) updates.frequency = frequency;
      if (category !== undefined) updates.category = category;
      if (isActive !== undefined) updates.isActive = isActive;

      habitService.updateHabit(habit.id, updates);
      
      return `✅ Updated habit "${habit.name}"${newName ? ` → "${newName}"` : ''}`;
    } catch (error: any) {
      log(LogLevel.ERROR, `[habits] Failed to update habit`, { error });
      return `Error updating habit: ${error.message}`;
    }
  }
});

/**
 * Tool: Delete a habit
 */
const deleteHabitTool = new DynamicStructuredTool({
  name: 'delete_habit',
  description: 'Delete a habit and all its history',
  schema: z.object({
    habitName: z.string().describe('Name of the habit to delete')
  }),
  func: async ({ habitName }) => {
    try {
      const habits = habitService.getAllHabits();
      const habit = habits.find(h => 
        h.name.toLowerCase().includes(habitName.toLowerCase())
      );

      if (!habit) {
        return `Could not find habit matching "${habitName}"`;
      }

      habitService.deleteHabit(habit.id);
      
      return `🗑️ Deleted habit "${habit.name}" and all completion history`;
    } catch (error: any) {
      log(LogLevel.ERROR, `[habits] Failed to delete habit`, { error });
      return `Error deleting habit: ${error.message}`;
    }
  }
});

/**
 * Tool: Get detailed stats for a habit
 */
const habitStatsTool = new DynamicStructuredTool({
  name: 'habit_stats',
  description: 'Get detailed statistics for a specific habit',
  schema: z.object({
    habitName: z.string().describe('Name of the habit')
  }),
  func: async ({ habitName }) => {
    try {
      const habits = habitService.getActiveHabits();
      const habit = habits.find(h => 
        h.name.toLowerCase().includes(habitName.toLowerCase())
      );

      if (!habit) {
        return `Could not find habit matching "${habitName}"`;
      }

      const stats = habitService.getHabitStats(habit.id);
      if (!stats) return 'Could not get stats';

      const lines = [
        `**${stats.habit.name}** Statistics:`,
        ``,
        `📊 **Completion Rate (30 days):** ${Math.round(stats.completionRate * 100)}%`,
        `🔥 **Current Streak:** ${stats.habit.streak} days`,
        `🏆 **Longest Streak:** ${stats.habit.longestStreak} days`,
        `📅 **This Week:** ${stats.weeklyCount} completions`,
        `📆 **This Month:** ${stats.monthlyCount} completions`,
        `✅ **Total Completions:** ${stats.habit.totalCompletions}`,
        ``,
        stats.isOnTrack ? '✅ On track!' : '⚠️ Needs attention'
      ];

      return lines.join('\n');
    } catch (error: any) {
      log(LogLevel.ERROR, `[habits] Failed to get stats`, { error });
      return `Error getting stats: ${error.message}`;
    }
  }
});

/**
 * Cleanup plugin resources
 */
export function cleanup(): void {
  if (habitService) {
    habitService.close();
  }
}

export { HabitService, getHabitService, Habit, HabitFrequency };
