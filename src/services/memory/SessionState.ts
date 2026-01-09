import { BaseMessage } from '@langchain/core/messages';
import fs from 'fs/promises';
import path from 'path';
import { log, LogLevel } from '../../logger';
import { EpisodicMemory, Episode, getEpisodicMemory, initializeEpisodicMemory } from './EpisodicMemory';
import { SemanticProfile, getSemanticProfile, initializeSemanticProfile, UserFact } from './SemanticProfile';
import { HttpEmbeddings } from '../../embeddings/HttpEmbeddings';
import { AppConfig } from '../../configLoader';

/**
 * SessionState - Manages "where we left off" context
 * 
 * Combines episodic memory and semantic profile to provide:
 * 1. Last session summary
 * 2. Pending follow-ups
 * 3. Relevant user facts
 * 4. Today's context
 */
export interface SessionContext {
  lastSession: Episode | null;
  pendingFollowups: string[];
  relevantFacts: UserFact[];
  todayEpisodes: number;
  totalEpisodes: number;
  profileSummary: string;
}

export interface SessionStateConfig {
  storagePath: string;
  embeddingsUrl?: string;
  embeddingsModel?: string;
  dimensions?: number;
}

export class SessionState {
  private episodicMemory: EpisodicMemory | null = null;
  private semanticProfile: SemanticProfile | null = null;
  private config: SessionStateConfig;
  private embeddings: HttpEmbeddings | null = null;
  private currentSessionMessages: BaseMessage[] = [];
  private sessionStartTime: Date = new Date();

  constructor(config: SessionStateConfig) {
    this.config = config;
    
    // Initialize embeddings if URL provided
    if (config.embeddingsUrl) {
      this.embeddings = new HttpEmbeddings({
        baseUrl: config.embeddingsUrl,
        model: config.embeddingsModel || 'Qwen/Qwen3-Embedding-8B',
        dimensions: config.dimensions || 4096
      });
    }
  }

  /**
   * Initialize session state services
   */
  async initialize(): Promise<void> {
    try {
      // Initialize episodic memory
      this.episodicMemory = await initializeEpisodicMemory({
        storagePath: path.join(this.config.storagePath, 'episodic'),
        embeddings: this.embeddings || undefined,
        dimensions: this.config.dimensions
      });

      // Initialize semantic profile
      this.semanticProfile = await initializeSemanticProfile({
        storagePath: path.join(this.config.storagePath, 'profile')
      });

      log(LogLevel.INFO, `SessionState: Initialized with ${this.episodicMemory.size} episodes, ${this.semanticProfile.size} facts`);
    } catch (error) {
      log(LogLevel.ERROR, `SessionState: Failed to initialize`, { error });
    }
  }

  /**
   * Get the context for starting a new session
   */
  async getSessionContext(currentInput?: string): Promise<SessionContext> {
    const context: SessionContext = {
      lastSession: null,
      pendingFollowups: [],
      relevantFacts: [],
      todayEpisodes: 0,
      totalEpisodes: 0,
      profileSummary: ''
    };

    if (this.episodicMemory) {
      context.lastSession = this.episodicMemory.getLastSession();
      context.todayEpisodes = this.episodicMemory.getTodayEpisodes().length;
      context.totalEpisodes = this.episodicMemory.size;
      
      // Get pending followups
      const allFollowups = this.episodicMemory.getAllPendingFollowups();
      context.pendingFollowups = allFollowups.map(f => f.followup).slice(0, 5);
    }

    if (this.semanticProfile) {
      context.profileSummary = this.semanticProfile.getProfileSummary();
      
      // Get relevant facts if we have input
      if (currentInput) {
        context.relevantFacts = this.semanticProfile.getRelevantFacts(currentInput);
      }
    }

    return context;
  }

  /**
   * Generate a "where we left off" prompt section
   */
  async getSessionPrompt(): Promise<string> {
    const context = await this.getSessionContext();
    const sections: string[] = [];

    // Last session summary
    if (context.lastSession) {
      const timeSince = this.formatTimeSince(context.lastSession.timestamp);
      sections.push(`## Last Session (${timeSince})
${context.lastSession.summary}
Topics: ${context.lastSession.topics.join(', ') || 'general'}
${context.lastSession.actionsTaken.length > 0 ? `Actions taken: ${context.lastSession.actionsTaken.join(', ')}` : ''}`);
    }

    // Pending follow-ups
    if (context.pendingFollowups.length > 0) {
      sections.push(`## Pending Follow-ups
${context.pendingFollowups.map(f => `- ${f}`).join('\n')}`);
    }

    // User profile summary
    if (context.profileSummary) {
      sections.push(`## User Profile
${context.profileSummary}`);
    }

    // Today's activity
    if (context.todayEpisodes > 0) {
      sections.push(`## Today's Activity
You've had ${context.todayEpisodes} conversation${context.todayEpisodes > 1 ? 's' : ''} with the user today.`);
    }

    return sections.length > 0 
      ? `\n---\n# Session Context\n${sections.join('\n\n')}\n---\n`
      : '';
  }

  /**
   * Record a message in the current session
   */
  recordMessage(message: BaseMessage): void {
    this.currentSessionMessages.push(message);
  }

  /**
   * End the current session and save to episodic memory
   */
  async endSession(): Promise<Episode | null> {
    if (this.currentSessionMessages.length === 0) {
      return null;
    }

    let episode: Episode | null = null;

    if (this.episodicMemory) {
      episode = await this.episodicMemory.addConversation(this.currentSessionMessages);
    }

    if (this.semanticProfile) {
      await this.semanticProfile.updateFromConversation(this.currentSessionMessages);
    }

    // Reset for next session
    this.currentSessionMessages = [];
    this.sessionStartTime = new Date();

    return episode;
  }

  /**
   * Add a fact to the semantic profile
   */
  async addFact(
    category: Parameters<SemanticProfile['setFact']>[0],
    key: string,
    value: unknown,
    options?: { confidence?: number; source?: 'explicit' | 'inferred' }
  ): Promise<void> {
    if (this.semanticProfile) {
      await this.semanticProfile.setFact(category, key, value, options);
    }
  }

  /**
   * Recall relevant past conversations
   */
  async recallRelevant(query: string, k = 5): Promise<Episode[]> {
    if (!this.episodicMemory) return [];
    return this.episodicMemory.recallRelevant(query, k);
  }

  /**
   * Mark a followup as completed
   */
  async completeFollowup(episodeId: string, followup: string): Promise<void> {
    if (this.episodicMemory) {
      await this.episodicMemory.markFollowupComplete(episodeId, followup);
    }
  }

  /**
   * Format time since a date
   */
  private formatTimeSince(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  }

  /**
   * Get current session duration
   */
  getSessionDuration(): number {
    return Date.now() - this.sessionStartTime.getTime();
  }

  /**
   * Get current session message count
   */
  getSessionMessageCount(): number {
    return this.currentSessionMessages.length;
  }

  /**
   * Get episodic memory instance
   */
  getEpisodicMemory(): EpisodicMemory | null {
    return this.episodicMemory;
  }

  /**
   * Get semantic profile instance
   */
  getSemanticProfile(): SemanticProfile | null {
    return this.semanticProfile;
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    // Save current session if any
    await this.endSession();
    
    if (this.episodicMemory) {
      await this.episodicMemory.dispose();
    }
    if (this.semanticProfile) {
      await this.semanticProfile.dispose();
    }
  }
}

// Singleton instance
let sessionStateInstance: SessionState | null = null;

/**
 * Get or create the session state instance
 */
export async function getSessionState(config?: SessionStateConfig): Promise<SessionState> {
  if (!sessionStateInstance && config) {
    sessionStateInstance = new SessionState(config);
    await sessionStateInstance.initialize();
  }
  
  if (!sessionStateInstance) {
    throw new Error('SessionState not initialized. Call with config first.');
  }
  
  return sessionStateInstance;
}

/**
 * Initialize session state from AppConfig
 */
export async function initializeSessionState(appConfig: AppConfig): Promise<SessionState> {
  const embeddingsConfig = appConfig.routing?.providers?.local?.embeddings;
  
  const config: SessionStateConfig = {
    storagePath: path.join(process.cwd(), 'database', 'memory'),
    embeddingsUrl: embeddingsConfig?.enabled ? embeddingsConfig.serverUrl : undefined,
    embeddingsModel: embeddingsConfig?.projects?.model,
    dimensions: embeddingsConfig?.projects?.dimensions
  };
  
  sessionStateInstance = new SessionState(config);
  await sessionStateInstance.initialize();
  
  log(LogLevel.INFO, `SessionState: Initialized from AppConfig`);
  return sessionStateInstance;
}

/**
 * Reset session state (for testing)
 */
export function resetSessionState(): void {
  sessionStateInstance = null;
}
