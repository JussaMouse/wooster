import { BaseMessage } from '@langchain/core/messages';
import fs from 'fs/promises';
import path from 'path';
import { log, LogLevel } from '../../logger';

/**
 * Categories of user facts
 */
export type FactCategory = 'preference' | 'habit' | 'goal' | 'relationship' | 'schedule' | 'interest' | 'context';

/**
 * UserFact - A structured piece of information about the user
 */
export interface UserFact {
  category: FactCategory;
  key: string;
  value: unknown;
  confidence: number; // 0-1
  lastUpdated: Date;
  source: 'explicit' | 'inferred';
  mentions: number; // How many times this fact has been mentioned/reinforced
}

/**
 * SemanticProfile configuration
 */
export interface SemanticProfileConfig {
  storagePath: string;
  factCategories?: FactCategory[];
}

/**
 * SemanticProfile - Stores structured facts about the user
 * 
 * Unlike the user profile vector store (which uses embeddings),
 * this stores discrete, queryable facts that can be:
 * 1. Directly retrieved by category
 * 2. Updated with confidence weighting
 * 3. Used to personalize responses
 */
export class SemanticProfile {
  private facts: Map<string, UserFact> = new Map();
  private config: SemanticProfileConfig;
  private profilePath: string;
  private dirty = false;

  constructor(config: SemanticProfileConfig) {
    this.config = config;
    this.profilePath = path.join(config.storagePath, 'semantic_profile.json');
  }

  /**
   * Initialize the semantic profile (load from disk)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.config.storagePath, { recursive: true });
      
      try {
        const data = await fs.readFile(this.profilePath, 'utf-8');
        const parsed = JSON.parse(data);
        
        for (const [key, fact] of Object.entries(parsed)) {
          this.facts.set(key, {
            ...(fact as UserFact),
            lastUpdated: new Date((fact as UserFact).lastUpdated)
          });
        }
        
        log(LogLevel.INFO, `SemanticProfile: Loaded ${this.facts.size} facts`);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          log(LogLevel.WARN, `SemanticProfile: Failed to load`, { error });
        }
      }
    } catch (error) {
      log(LogLevel.ERROR, `SemanticProfile: Failed to initialize`, { error });
    }
  }

  /**
   * Add or update a fact
   */
  async setFact(
    category: FactCategory,
    key: string,
    value: unknown,
    options?: {
      confidence?: number;
      source?: 'explicit' | 'inferred';
    }
  ): Promise<void> {
    const fullKey = `${category}:${key}`;
    const existing = this.facts.get(fullKey);
    
    const fact: UserFact = {
      category,
      key,
      value,
      confidence: options?.confidence ?? 0.8,
      lastUpdated: new Date(),
      source: options?.source ?? 'inferred',
      mentions: existing ? existing.mentions + 1 : 1
    };
    
    // If existing fact has higher confidence, only update if new is explicit
    if (existing && existing.confidence > fact.confidence && fact.source !== 'explicit') {
      // Just increment mentions
      existing.mentions++;
      existing.lastUpdated = new Date();
      this.dirty = true;
      return;
    }
    
    this.facts.set(fullKey, fact);
    this.dirty = true;
    
    log(LogLevel.DEBUG, `SemanticProfile: Set fact ${fullKey} = ${JSON.stringify(value).slice(0, 50)}`);
  }

  /**
   * Get a specific fact
   */
  getFact(category: FactCategory, key: string): UserFact | undefined {
    return this.facts.get(`${category}:${key}`);
  }

  /**
   * Get all facts in a category
   */
  getFactsByCategory(category: FactCategory): UserFact[] {
    return Array.from(this.facts.values()).filter(f => f.category === category);
  }

  /**
   * Get facts relevant to a context
   */
  getRelevantFacts(context: string): UserFact[] {
    const lower = context.toLowerCase();
    const relevant: UserFact[] = [];
    
    for (const fact of this.facts.values()) {
      // Match by category keywords
      if (lower.includes(fact.category)) {
        relevant.push(fact);
        continue;
      }
      
      // Match by key keywords
      if (lower.includes(fact.key.toLowerCase())) {
        relevant.push(fact);
        continue;
      }
      
      // Match by value if string
      if (typeof fact.value === 'string' && lower.includes(fact.value.toLowerCase())) {
        relevant.push(fact);
      }
    }
    
    // Sort by confidence and recency
    return relevant.sort((a, b) => {
      const confidenceDiff = b.confidence - a.confidence;
      if (Math.abs(confidenceDiff) > 0.1) return confidenceDiff;
      return b.lastUpdated.getTime() - a.lastUpdated.getTime();
    });
  }

  /**
   * Update profile from a conversation
   */
  async updateFromConversation(messages: BaseMessage[]): Promise<UserFact[]> {
    const extracted: UserFact[] = [];
    
    for (const message of messages) {
      if (message._getType() !== 'human') continue;
      
      const content = typeof message.content === 'string' ? message.content : '';
      const facts = this.extractFacts(content);
      
      for (const fact of facts) {
        await this.setFact(fact.category, fact.key, fact.value, {
          confidence: fact.confidence,
          source: fact.source
        });
        extracted.push(fact);
      }
    }
    
    if (extracted.length > 0) {
      await this.save();
    }
    
    return extracted;
  }

  /**
   * Extract facts from text
   */
  private extractFacts(text: string): UserFact[] {
    const facts: UserFact[] = [];
    const lower = text.toLowerCase();
    const now = new Date();
    
    // Preference patterns
    const preferencePatterns = [
      { pattern: /i (prefer|like|love|enjoy)\s+(.+?)(?:\.|,|$)/gi, category: 'preference' as FactCategory },
      { pattern: /my favorite\s+(.+?)\s+is\s+(.+?)(?:\.|,|$)/gi, category: 'preference' as FactCategory },
      { pattern: /i don't like\s+(.+?)(?:\.|,|$)/gi, category: 'preference' as FactCategory, negated: true },
    ];
    
    for (const { pattern, category, negated } of preferencePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const key = negated ? `dislikes` : match[1]?.trim().toLowerCase() || 'general';
        const value = negated ? match[1] : (match[2] || match[1]);
        
        if (value && value.length > 2 && value.length < 100) {
          facts.push({
            category,
            key,
            value: value.trim(),
            confidence: 0.7,
            lastUpdated: now,
            source: 'inferred',
            mentions: 1
          });
        }
      }
    }
    
    // Habit patterns
    const habitPatterns = [
      { pattern: /i (usually|always|often|typically)\s+(.+?)(?:\.|,|$)/gi, category: 'habit' as FactCategory },
      { pattern: /every (morning|evening|day|week)\s+i\s+(.+?)(?:\.|,|$)/gi, category: 'habit' as FactCategory },
      { pattern: /i (wake up|go to bed|exercise|work out)\s+(?:at|around)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi, category: 'schedule' as FactCategory },
    ];
    
    for (const { pattern, category } of habitPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const key = match[1]?.trim().toLowerCase() || 'routine';
        const value = match[2]?.trim();
        
        if (value && value.length > 2 && value.length < 100) {
          facts.push({
            category,
            key,
            value,
            confidence: 0.6,
            lastUpdated: now,
            source: 'inferred',
            mentions: 1
          });
        }
      }
    }
    
    // Goal patterns
    const goalPatterns = [
      { pattern: /i want to\s+(.+?)(?:\.|,|$)/gi, category: 'goal' as FactCategory },
      { pattern: /my goal is\s+(.+?)(?:\.|,|$)/gi, category: 'goal' as FactCategory },
      { pattern: /i'm trying to\s+(.+?)(?:\.|,|$)/gi, category: 'goal' as FactCategory },
      { pattern: /i need to\s+(.+?)(?:\.|,|$)/gi, category: 'goal' as FactCategory },
    ];
    
    for (const { pattern, category } of goalPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[1]?.trim();
        
        if (value && value.length > 5 && value.length < 150) {
          facts.push({
            category,
            key: this.generateGoalKey(value),
            value,
            confidence: 0.65,
            lastUpdated: now,
            source: 'inferred',
            mentions: 1
          });
        }
      }
    }
    
    // Relationship patterns
    if (lower.includes('my wife') || lower.includes('my husband')) {
      facts.push({
        category: 'relationship',
        key: 'spouse',
        value: lower.includes('my wife') ? 'wife' : 'husband',
        confidence: 0.9,
        lastUpdated: now,
        source: 'inferred',
        mentions: 1
      });
    }
    
    const familyMatch = text.match(/my (son|daughter|brother|sister|mom|dad|mother|father|kid|child)\s+(\w+)?/i);
    if (familyMatch) {
      facts.push({
        category: 'relationship',
        key: familyMatch[1].toLowerCase(),
        value: familyMatch[2] || true,
        confidence: 0.85,
        lastUpdated: now,
        source: 'inferred',
        mentions: 1
      });
    }
    
    // Interest patterns
    const interestPatterns = [
      { pattern: /i'm interested in\s+(.+?)(?:\.|,|$)/gi, category: 'interest' as FactCategory },
      { pattern: /i've been (reading|learning|studying|working on)\s+(.+?)(?:\.|,|$)/gi, category: 'interest' as FactCategory },
    ];
    
    for (const { pattern, category } of interestPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[2] || match[1];
        
        if (value && value.length > 2 && value.length < 100) {
          facts.push({
            category,
            key: 'topic',
            value: value.trim(),
            confidence: 0.6,
            lastUpdated: now,
            source: 'inferred',
            mentions: 1
          });
        }
      }
    }
    
    return facts;
  }

  /**
   * Generate a key for a goal
   */
  private generateGoalKey(goalText: string): string {
    const words = goalText.toLowerCase().split(/\s+/).slice(0, 3);
    return words.join('_').replace(/[^a-z0-9_]/g, '');
  }

  /**
   * Get a summary of the user profile for context
   */
  getProfileSummary(): string {
    const categories: Record<FactCategory, UserFact[]> = {
      preference: [],
      habit: [],
      goal: [],
      relationship: [],
      schedule: [],
      interest: [],
      context: []
    };
    
    for (const fact of this.facts.values()) {
      categories[fact.category].push(fact);
    }
    
    const sections: string[] = [];
    
    if (categories.preference.length > 0) {
      sections.push(`Preferences: ${categories.preference.map(f => `${f.key}: ${f.value}`).join(', ')}`);
    }
    if (categories.habit.length > 0) {
      sections.push(`Habits: ${categories.habit.map(f => `${f.value}`).join(', ')}`);
    }
    if (categories.goal.length > 0) {
      sections.push(`Goals: ${categories.goal.map(f => `${f.value}`).join(', ')}`);
    }
    if (categories.relationship.length > 0) {
      sections.push(`Relationships: ${categories.relationship.map(f => `${f.key}${f.value !== true ? ': ' + f.value : ''}`).join(', ')}`);
    }
    if (categories.schedule.length > 0) {
      sections.push(`Schedule: ${categories.schedule.map(f => `${f.key}: ${f.value}`).join(', ')}`);
    }
    if (categories.interest.length > 0) {
      sections.push(`Interests: ${categories.interest.map(f => `${f.value}`).join(', ')}`);
    }
    
    return sections.join('\n');
  }

  /**
   * Delete a fact
   */
  async deleteFact(category: FactCategory, key: string): Promise<boolean> {
    const fullKey = `${category}:${key}`;
    const deleted = this.facts.delete(fullKey);
    if (deleted) {
      this.dirty = true;
      await this.save();
    }
    return deleted;
  }

  /**
   * Save profile to disk
   */
  async save(): Promise<void> {
    if (!this.dirty) return;
    
    try {
      const obj: Record<string, UserFact> = {};
      for (const [key, fact] of this.facts) {
        obj[key] = fact;
      }
      
      await fs.writeFile(this.profilePath, JSON.stringify(obj, null, 2));
      this.dirty = false;
      
      log(LogLevel.DEBUG, `SemanticProfile: Saved ${this.facts.size} facts`);
    } catch (error) {
      log(LogLevel.ERROR, `SemanticProfile: Failed to save`, { error });
    }
  }

  /**
   * Get the number of facts
   */
  get size(): number {
    return this.facts.size;
  }

  /**
   * Get all facts (for debugging)
   */
  getAllFacts(): UserFact[] {
    return Array.from(this.facts.values());
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.save();
  }
}

// Singleton instance
let profileInstance: SemanticProfile | null = null;

/**
 * Get or create the semantic profile instance
 */
export async function getSemanticProfile(config?: SemanticProfileConfig): Promise<SemanticProfile> {
  if (!profileInstance && config) {
    profileInstance = new SemanticProfile(config);
    await profileInstance.initialize();
  }
  
  if (!profileInstance) {
    throw new Error('SemanticProfile not initialized. Call with config first.');
  }
  
  return profileInstance;
}

/**
 * Initialize semantic profile with configuration
 */
export async function initializeSemanticProfile(config: SemanticProfileConfig): Promise<SemanticProfile> {
  profileInstance = new SemanticProfile(config);
  await profileInstance.initialize();
  return profileInstance;
}
