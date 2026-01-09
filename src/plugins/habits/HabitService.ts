import Database from 'better-sqlite3';
import path from 'path';
import { log, LogLevel } from '../../logger';

/**
 * Habit frequency options
 */
export type HabitFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

/**
 * Habit definition
 */
export interface Habit {
  id: string;
  name: string;
  description?: string;
  frequency: HabitFrequency;
  targetDays: number[]; // 0-6 for weekly (0=Sunday), 1-31 for monthly
  streak: number;
  longestStreak: number;
  totalCompletions: number;
  createdAt: Date;
  lastCompletedAt: Date | null;
  isActive: boolean;
  category?: string;
  reminderTime?: string; // HH:MM format
  color?: string;
}

/**
 * Habit completion record
 */
export interface HabitCompletion {
  id: string;
  habitId: string;
  completedAt: Date;
  notes?: string;
}

/**
 * Habit statistics
 */
export interface HabitStats {
  habit: Habit;
  completionRate: number; // 0-1
  recentCompletions: HabitCompletion[];
  weeklyCount: number;
  monthlyCount: number;
  isOnTrack: boolean;
}

/**
 * HabitService - Manages habit tracking with SQLite persistence
 */
export class HabitService {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'database', 'habits.sqlite3');
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS habits (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        frequency TEXT NOT NULL DEFAULT 'daily',
        target_days TEXT DEFAULT '[]',
        streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        total_completions INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        last_completed_at TEXT,
        is_active INTEGER DEFAULT 1,
        category TEXT,
        reminder_time TEXT,
        color TEXT
      );

      CREATE TABLE IF NOT EXISTS habit_completions (
        id TEXT PRIMARY KEY,
        habit_id TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        notes TEXT,
        FOREIGN KEY (habit_id) REFERENCES habits(id)
      );

      CREATE INDEX IF NOT EXISTS idx_completions_habit_id ON habit_completions(habit_id);
      CREATE INDEX IF NOT EXISTS idx_completions_date ON habit_completions(completed_at);
    `);

    log(LogLevel.DEBUG, `HabitService: Database initialized at ${this.dbPath}`);
  }

  /**
   * Create a new habit
   */
  createHabit(habit: Omit<Habit, 'id' | 'streak' | 'longestStreak' | 'totalCompletions' | 'createdAt' | 'lastCompletedAt'>): Habit {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO habits (id, name, description, frequency, target_days, streak, longest_streak, total_completions, created_at, is_active, category, reminder_time, color)
      VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, 1, ?, ?, ?)
    `);

    stmt.run(
      id,
      habit.name,
      habit.description || null,
      habit.frequency,
      JSON.stringify(habit.targetDays),
      now,
      habit.category || null,
      habit.reminderTime || null,
      habit.color || null
    );

    log(LogLevel.INFO, `HabitService: Created habit "${habit.name}" (${id})`);

    return this.getHabit(id)!;
  }

  /**
   * Get a habit by ID
   */
  getHabit(id: string): Habit | null {
    const row = this.db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as any;
    return row ? this.rowToHabit(row) : null;
  }

  /**
   * Get all active habits
   */
  getActiveHabits(): Habit[] {
    const rows = this.db.prepare('SELECT * FROM habits WHERE is_active = 1 ORDER BY name').all() as any[];
    return rows.map(row => this.rowToHabit(row));
  }

  /**
   * Get all habits (including inactive)
   */
  getAllHabits(): Habit[] {
    const rows = this.db.prepare('SELECT * FROM habits ORDER BY name').all() as any[];
    return rows.map(row => this.rowToHabit(row));
  }

  /**
   * Update a habit
   */
  updateHabit(id: string, updates: Partial<Omit<Habit, 'id' | 'createdAt'>>): Habit | null {
    const habit = this.getHabit(id);
    if (!habit) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.frequency !== undefined) {
      fields.push('frequency = ?');
      values.push(updates.frequency);
    }
    if (updates.targetDays !== undefined) {
      fields.push('target_days = ?');
      values.push(JSON.stringify(updates.targetDays));
    }
    if (updates.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.isActive ? 1 : 0);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.reminderTime !== undefined) {
      fields.push('reminder_time = ?');
      values.push(updates.reminderTime);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }

    if (fields.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE habits SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getHabit(id);
  }

  /**
   * Delete a habit
   */
  deleteHabit(id: string): boolean {
    const result = this.db.prepare('DELETE FROM habits WHERE id = ?').run(id);
    if (result.changes > 0) {
      this.db.prepare('DELETE FROM habit_completions WHERE habit_id = ?').run(id);
      log(LogLevel.INFO, `HabitService: Deleted habit ${id}`);
      return true;
    }
    return false;
  }

  /**
   * Record a habit completion (check-in)
   */
  checkIn(habitId: string, notes?: string): HabitCompletion | null {
    const habit = this.getHabit(habitId);
    if (!habit) return null;

    const id = crypto.randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();

    // Check if already completed today
    const today = now.toISOString().split('T')[0];
    const existingToday = this.db.prepare(`
      SELECT id FROM habit_completions 
      WHERE habit_id = ? AND date(completed_at) = date(?)
    `).get(habitId, today);

    if (existingToday) {
      log(LogLevel.DEBUG, `HabitService: Habit ${habitId} already completed today`);
      return null;
    }

    // Insert completion
    this.db.prepare(`
      INSERT INTO habit_completions (id, habit_id, completed_at, notes)
      VALUES (?, ?, ?, ?)
    `).run(id, habitId, nowIso, notes || null);

    // Update streak
    const newStreak = this.calculateStreak(habitId);
    const newTotalCompletions = habit.totalCompletions + 1;
    const newLongestStreak = Math.max(habit.longestStreak, newStreak);

    this.db.prepare(`
      UPDATE habits 
      SET streak = ?, longest_streak = ?, total_completions = ?, last_completed_at = ?
      WHERE id = ?
    `).run(newStreak, newLongestStreak, newTotalCompletions, nowIso, habitId);

    log(LogLevel.INFO, `HabitService: Checked in habit "${habit.name}" (streak: ${newStreak})`);

    return {
      id,
      habitId,
      completedAt: now,
      notes
    };
  }

  /**
   * Calculate current streak for a habit
   */
  private calculateStreak(habitId: string): number {
    const completions = this.db.prepare(`
      SELECT date(completed_at) as date 
      FROM habit_completions 
      WHERE habit_id = ? 
      ORDER BY completed_at DESC
    `).all(habitId) as { date: string }[];

    if (completions.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < completions.length; i++) {
      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() - i);
      const expectedDateStr = expectedDate.toISOString().split('T')[0];

      if (completions[i].date === expectedDateStr) {
        streak++;
      } else if (i === 0) {
        // Check if yesterday was completed (streak continues)
        expectedDate.setDate(expectedDate.getDate() - 1);
        const yesterdayStr = expectedDate.toISOString().split('T')[0];
        if (completions[i].date === yesterdayStr) {
          streak++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Get completions for a habit
   */
  getCompletions(habitId: string, limit = 30): HabitCompletion[] {
    const rows = this.db.prepare(`
      SELECT * FROM habit_completions 
      WHERE habit_id = ? 
      ORDER BY completed_at DESC 
      LIMIT ?
    `).all(habitId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      habitId: row.habit_id,
      completedAt: new Date(row.completed_at),
      notes: row.notes
    }));
  }

  /**
   * Get habits due today
   */
  getHabitsDueToday(): Habit[] {
    const habits = this.getActiveHabits();
    const today = new Date();
    const dayOfWeek = today.getDay();
    const dayOfMonth = today.getDate();

    return habits.filter(habit => {
      switch (habit.frequency) {
        case 'daily':
          return true;
        case 'weekly':
          return habit.targetDays.includes(dayOfWeek);
        case 'monthly':
          return habit.targetDays.includes(dayOfMonth);
        case 'custom':
          return habit.targetDays.includes(dayOfWeek);
        default:
          return true;
      }
    });
  }

  /**
   * Get today's status for all habits
   */
  getTodayStatus(): { habit: Habit; completed: boolean }[] {
    const habitsDue = this.getHabitsDueToday();
    const today = new Date().toISOString().split('T')[0];

    return habitsDue.map(habit => {
      const todayCompletion = this.db.prepare(`
        SELECT id FROM habit_completions 
        WHERE habit_id = ? AND date(completed_at) = date(?)
      `).get(habit.id, today);

      return {
        habit,
        completed: !!todayCompletion
      };
    });
  }

  /**
   * Get habit statistics
   */
  getHabitStats(habitId: string): HabitStats | null {
    const habit = this.getHabit(habitId);
    if (!habit) return null;

    const recentCompletions = this.getCompletions(habitId, 7);
    
    // Calculate completion rate for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const completionsInPeriod = this.db.prepare(`
      SELECT COUNT(*) as count FROM habit_completions 
      WHERE habit_id = ? AND completed_at >= ?
    `).get(habitId, thirtyDaysAgo.toISOString()) as { count: number };

    // Calculate expected completions based on frequency
    let expectedCompletions = 30; // daily
    if (habit.frequency === 'weekly') {
      expectedCompletions = Math.ceil(30 / 7) * habit.targetDays.length;
    } else if (habit.frequency === 'monthly') {
      expectedCompletions = habit.targetDays.length;
    }

    const completionRate = Math.min(1, completionsInPeriod.count / expectedCompletions);

    // Weekly and monthly counts
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weeklyCount = (this.db.prepare(`
      SELECT COUNT(*) as count FROM habit_completions 
      WHERE habit_id = ? AND completed_at >= ?
    `).get(habitId, weekAgo.toISOString()) as { count: number }).count;

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const monthlyCount = (this.db.prepare(`
      SELECT COUNT(*) as count FROM habit_completions 
      WHERE habit_id = ? AND completed_at >= ?
    `).get(habitId, monthAgo.toISOString()) as { count: number }).count;

    return {
      habit,
      completionRate,
      recentCompletions,
      weeklyCount,
      monthlyCount,
      isOnTrack: completionRate >= 0.7
    };
  }

  /**
   * Get summary for daily review
   */
  getDailySummary(): {
    completed: number;
    remaining: number;
    streaksAtRisk: Habit[];
    topStreaks: Habit[];
  } {
    const todayStatus = this.getTodayStatus();
    const completed = todayStatus.filter(s => s.completed).length;
    const remaining = todayStatus.filter(s => !s.completed).length;

    // Habits with streak > 0 that haven't been completed today
    const streaksAtRisk = todayStatus
      .filter(s => !s.completed && s.habit.streak > 0)
      .map(s => s.habit)
      .sort((a, b) => b.streak - a.streak);

    // Top 5 streaks
    const topStreaks = this.getActiveHabits()
      .filter(h => h.streak > 0)
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 5);

    return {
      completed,
      remaining,
      streaksAtRisk,
      topStreaks
    };
  }

  /**
   * Convert database row to Habit object
   */
  private rowToHabit(row: any): Habit {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      frequency: row.frequency as HabitFrequency,
      targetDays: JSON.parse(row.target_days || '[]'),
      streak: row.streak,
      longestStreak: row.longest_streak,
      totalCompletions: row.total_completions,
      createdAt: new Date(row.created_at),
      lastCompletedAt: row.last_completed_at ? new Date(row.last_completed_at) : null,
      isActive: Boolean(row.is_active),
      category: row.category,
      reminderTime: row.reminder_time,
      color: row.color
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let habitServiceInstance: HabitService | null = null;

/**
 * Get or create the habit service instance
 */
export function getHabitService(dbPath?: string): HabitService {
  if (!habitServiceInstance) {
    habitServiceInstance = new HabitService(dbPath);
  }
  return habitServiceInstance;
}
