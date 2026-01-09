import Database from 'better-sqlite3';
import path from 'path';
import { log, LogLevel } from '../../logger';

/**
 * Goal category
 */
export type GoalCategory = 'health' | 'finance' | 'career' | 'personal' | 'learning' | 'relationships' | 'other';

/**
 * Goal status
 */
export type GoalStatus = 'active' | 'completed' | 'paused' | 'abandoned';

/**
 * Goal definition
 */
export interface Goal {
  id: string;
  title: string;
  description?: string;
  category: GoalCategory;
  status: GoalStatus;
  progress: number; // 0-100
  targetDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  measureUnit?: string; // e.g., "lbs", "pages", "$"
  targetValue?: number;
  currentValue?: number;
  notes?: string;
}

/**
 * Milestone within a goal
 */
export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  targetDate?: Date;
  completedAt?: Date;
  order: number;
}

/**
 * Progress entry for a goal
 */
export interface ProgressEntry {
  id: string;
  goalId: string;
  date: Date;
  value?: number;
  notes?: string;
  progressDelta?: number;
}

/**
 * GoalService - Manages goals with SQLite persistence
 */
export class GoalService {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'database', 'goals.sqlite3');
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'other',
        status TEXT NOT NULL DEFAULT 'active',
        progress INTEGER DEFAULT 0,
        target_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        measure_unit TEXT,
        target_value REAL,
        current_value REAL,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS milestones (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        is_completed INTEGER DEFAULT 0,
        target_date TEXT,
        completed_at TEXT,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
      );

      CREATE TABLE IF NOT EXISTS progress_entries (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        date TEXT NOT NULL,
        value REAL,
        notes TEXT,
        progress_delta REAL,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
      );

      CREATE INDEX IF NOT EXISTS idx_milestones_goal_id ON milestones(goal_id);
      CREATE INDEX IF NOT EXISTS idx_progress_goal_id ON progress_entries(goal_id);
      CREATE INDEX IF NOT EXISTS idx_progress_date ON progress_entries(date);
    `);

    log(LogLevel.DEBUG, `GoalService: Database initialized at ${this.dbPath}`);
  }

  /**
   * Create a new goal
   */
  createGoal(goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'status' | 'progress'>): Goal {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO goals (id, title, description, category, status, progress, target_date, created_at, updated_at, measure_unit, target_value, current_value, notes)
      VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      goal.title,
      goal.description || null,
      goal.category,
      goal.targetDate?.toISOString() || null,
      now,
      now,
      goal.measureUnit || null,
      goal.targetValue ?? null,
      goal.currentValue ?? null,
      goal.notes || null
    );

    log(LogLevel.INFO, `GoalService: Created goal "${goal.title}" (${id})`);

    return this.getGoal(id)!;
  }

  /**
   * Get a goal by ID
   */
  getGoal(id: string): Goal | null {
    const row = this.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as any;
    return row ? this.rowToGoal(row) : null;
  }

  /**
   * Get all active goals
   */
  getActiveGoals(): Goal[] {
    const rows = this.db.prepare("SELECT * FROM goals WHERE status = 'active' ORDER BY created_at DESC").all() as any[];
    return rows.map(row => this.rowToGoal(row));
  }

  /**
   * Get all goals
   */
  getAllGoals(): Goal[] {
    const rows = this.db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all() as any[];
    return rows.map(row => this.rowToGoal(row));
  }

  /**
   * Get goals by category
   */
  getGoalsByCategory(category: GoalCategory): Goal[] {
    const rows = this.db.prepare('SELECT * FROM goals WHERE category = ? ORDER BY created_at DESC').all(category) as any[];
    return rows.map(row => this.rowToGoal(row));
  }

  /**
   * Update a goal
   */
  updateGoal(id: string, updates: Partial<Omit<Goal, 'id' | 'createdAt'>>): Goal | null {
    const goal = this.getGoal(id);
    if (!goal) return null;

    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [new Date().toISOString()];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
      if (updates.status === 'completed') {
        fields.push('completed_at = ?');
        values.push(new Date().toISOString());
        fields.push('progress = ?');
        values.push(100);
      }
    }
    if (updates.progress !== undefined) {
      fields.push('progress = ?');
      values.push(updates.progress);
    }
    if (updates.targetDate !== undefined) {
      fields.push('target_date = ?');
      values.push(updates.targetDate?.toISOString() || null);
    }
    if (updates.measureUnit !== undefined) {
      fields.push('measure_unit = ?');
      values.push(updates.measureUnit);
    }
    if (updates.targetValue !== undefined) {
      fields.push('target_value = ?');
      values.push(updates.targetValue);
    }
    if (updates.currentValue !== undefined) {
      fields.push('current_value = ?');
      values.push(updates.currentValue);
      
      // Auto-calculate progress if we have target value
      if (goal.targetValue && goal.targetValue > 0) {
        const progress = Math.min(100, Math.round((updates.currentValue / goal.targetValue) * 100));
        fields.push('progress = ?');
        values.push(progress);
      }
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    values.push(id);
    this.db.prepare(`UPDATE goals SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.getGoal(id);
  }

  /**
   * Update goal progress
   */
  updateProgress(goalId: string, value?: number, notes?: string): ProgressEntry | null {
    const goal = this.getGoal(goalId);
    if (!goal) return null;

    const id = crypto.randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();

    // Calculate progress delta
    let progressDelta: number | null = null;
    if (value !== undefined && goal.currentValue !== undefined) {
      progressDelta = value - goal.currentValue;
    }

    // Insert progress entry
    this.db.prepare(`
      INSERT INTO progress_entries (id, goal_id, date, value, notes, progress_delta)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, goalId, nowIso, value ?? null, notes || null, progressDelta);

    // Update goal's current value
    if (value !== undefined) {
      this.updateGoal(goalId, { currentValue: value });
    }

    log(LogLevel.DEBUG, `GoalService: Recorded progress for goal ${goalId}`);

    return {
      id,
      goalId,
      date: now,
      value,
      notes,
      progressDelta: progressDelta ?? undefined
    };
  }

  /**
   * Delete a goal
   */
  deleteGoal(id: string): boolean {
    const result = this.db.prepare('DELETE FROM goals WHERE id = ?').run(id);
    if (result.changes > 0) {
      this.db.prepare('DELETE FROM milestones WHERE goal_id = ?').run(id);
      this.db.prepare('DELETE FROM progress_entries WHERE goal_id = ?').run(id);
      log(LogLevel.INFO, `GoalService: Deleted goal ${id}`);
      return true;
    }
    return false;
  }

  /**
   * Add a milestone to a goal
   */
  addMilestone(goalId: string, milestone: Omit<Milestone, 'id' | 'goalId' | 'isCompleted' | 'completedAt' | 'order'>): Milestone | null {
    const goal = this.getGoal(goalId);
    if (!goal) return null;

    const id = crypto.randomUUID();
    const existingMilestones = this.getMilestones(goalId);
    const order = existingMilestones.length;

    this.db.prepare(`
      INSERT INTO milestones (id, goal_id, title, description, is_completed, target_date, sort_order)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(id, goalId, milestone.title, milestone.description || null, milestone.targetDate?.toISOString() || null, order);

    return this.getMilestone(id);
  }

  /**
   * Get a milestone by ID
   */
  getMilestone(id: string): Milestone | null {
    const row = this.db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as any;
    return row ? this.rowToMilestone(row) : null;
  }

  /**
   * Get all milestones for a goal
   */
  getMilestones(goalId: string): Milestone[] {
    const rows = this.db.prepare('SELECT * FROM milestones WHERE goal_id = ? ORDER BY sort_order').all(goalId) as any[];
    return rows.map(row => this.rowToMilestone(row));
  }

  /**
   * Complete a milestone
   */
  completeMilestone(id: string): Milestone | null {
    const milestone = this.getMilestone(id);
    if (!milestone) return null;

    this.db.prepare(`
      UPDATE milestones SET is_completed = 1, completed_at = ? WHERE id = ?
    `).run(new Date().toISOString(), id);

    // Update goal progress based on milestones
    const milestones = this.getMilestones(milestone.goalId);
    const completedCount = milestones.filter(m => m.isCompleted || m.id === id).length;
    const progress = Math.round((completedCount / milestones.length) * 100);
    
    this.updateGoal(milestone.goalId, { progress });

    return this.getMilestone(id);
  }

  /**
   * Get progress history for a goal
   */
  getProgressHistory(goalId: string, limit = 30): ProgressEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM progress_entries 
      WHERE goal_id = ? 
      ORDER BY date DESC 
      LIMIT ?
    `).all(goalId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      goalId: row.goal_id,
      date: new Date(row.date),
      value: row.value,
      notes: row.notes,
      progressDelta: row.progress_delta
    }));
  }

  /**
   * Get summary for daily review
   */
  getDailySummary(): {
    activeGoals: number;
    goalsOnTrack: number;
    goalsAtRisk: Goal[];
    upcomingDeadlines: Goal[];
    recentlyCompleted: Goal[];
  } {
    const activeGoals = this.getActiveGoals();
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Goals at risk: low progress with upcoming deadline
    const goalsAtRisk = activeGoals.filter(g => {
      if (!g.targetDate) return false;
      const daysToDeadline = Math.ceil((g.targetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const expectedProgress = Math.max(0, 100 - (daysToDeadline / 30) * 100); // Simplified
      return g.progress < expectedProgress - 20;
    });

    // Upcoming deadlines
    const upcomingDeadlines = activeGoals.filter(g => 
      g.targetDate && g.targetDate <= weekFromNow && g.targetDate > now
    ).sort((a, b) => (a.targetDate?.getTime() || 0) - (b.targetDate?.getTime() || 0));

    // Recently completed (last 7 days)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentlyCompleted = this.getAllGoals().filter(g => 
      g.status === 'completed' && g.completedAt && g.completedAt >= weekAgo
    );

    return {
      activeGoals: activeGoals.length,
      goalsOnTrack: activeGoals.length - goalsAtRisk.length,
      goalsAtRisk,
      upcomingDeadlines,
      recentlyCompleted
    };
  }

  /**
   * Convert database row to Goal object
   */
  private rowToGoal(row: any): Goal {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category as GoalCategory,
      status: row.status as GoalStatus,
      progress: row.progress,
      targetDate: row.target_date ? new Date(row.target_date) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      measureUnit: row.measure_unit,
      targetValue: row.target_value,
      currentValue: row.current_value,
      notes: row.notes
    };
  }

  /**
   * Convert database row to Milestone object
   */
  private rowToMilestone(row: any): Milestone {
    return {
      id: row.id,
      goalId: row.goal_id,
      title: row.title,
      description: row.description,
      isCompleted: Boolean(row.is_completed),
      targetDate: row.target_date ? new Date(row.target_date) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      order: row.sort_order
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
let goalServiceInstance: GoalService | null = null;

/**
 * Get or create the goal service instance
 */
export function getGoalService(dbPath?: string): GoalService {
  if (!goalServiceInstance) {
    goalServiceInstance = new GoalService(dbPath);
  }
  return goalServiceInstance;
}
