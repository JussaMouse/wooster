import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { log, LogLevel } from '../../logger';
import { HNSWVectorStore } from '../knowledgeBase/HNSWVectorStore';
import { HttpEmbeddings } from '../../embeddings/HttpEmbeddings';

/**
 * Episode - A summarized conversation session
 */
export interface Episode {
  id: string;
  timestamp: Date;
  summary: string;
  embedding?: number[];
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  actionsTaken: string[];
  pendingFollowups: string[];
  messageCount: number;
  durationMs?: number;
}

/**
 * EpisodicMemory configuration
 */
export interface EpisodicMemoryConfig {
  storagePath: string;
  maxEpisodes?: number;
  summarizeAfter?: number; // Summarize after N messages
  embeddings?: HttpEmbeddings;
  dimensions?: number;
}

/**
 * EpisodicMemory - Stores and recalls conversation summaries
 * 
 * This provides Wooster with "where we left off" context by:
 * 1. Summarizing each conversation session
 * 2. Extracting topics, sentiment, and action items
 * 3. Enabling semantic search over past conversations
 */
export class EpisodicMemory {
  private episodes: Episode[] = [];
  private vectorStore: HNSWVectorStore | null = null;
  private config: Required<EpisodicMemoryConfig>;
  private embeddings: HttpEmbeddings | null = null;
  private episodesPath: string;
  private dirty = false;

  constructor(config: EpisodicMemoryConfig) {
    this.config = {
      storagePath: config.storagePath,
      maxEpisodes: config.maxEpisodes || 10000,
      summarizeAfter: config.summarizeAfter || 10,
      embeddings: config.embeddings as HttpEmbeddings,
      dimensions: config.dimensions || 4096
    };
    
    this.episodesPath = path.join(config.storagePath, 'episodes.json');
    this.embeddings = config.embeddings ?? null;
    
    if (config.embeddings) {
      this.vectorStore = new HNSWVectorStore({
        dimensions: this.config.dimensions,
        storagePath: config.storagePath
      });
    }
  }

  /**
   * Initialize the episodic memory (load from disk)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.config.storagePath, { recursive: true });
      
      // Load episodes from JSON
      try {
        const data = await fs.readFile(this.episodesPath, 'utf-8');
        const parsed = JSON.parse(data);
        this.episodes = parsed.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp)
        }));
        log(LogLevel.INFO, `EpisodicMemory: Loaded ${this.episodes.length} episodes`);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          log(LogLevel.WARN, `EpisodicMemory: Failed to load episodes`, { error });
        }
      }
      
      // Load vector store
      if (this.vectorStore) {
        await this.vectorStore.load();
      }
    } catch (error) {
      log(LogLevel.ERROR, `EpisodicMemory: Failed to initialize`, { error });
    }
  }

  /**
   * Add a conversation to episodic memory
   */
  async addConversation(
    messages: BaseMessage[],
    options?: {
      summary?: string;
      topics?: string[];
      actions?: string[];
      followups?: string[];
    }
  ): Promise<Episode> {
    const now = new Date();
    
    // Generate summary if not provided
    const summary = options?.summary || this.generateBasicSummary(messages);
    
    // Extract topics if not provided
    const topics = options?.topics || this.extractTopics(messages);
    
    // Analyze sentiment
    const sentiment = this.analyzeSentiment(messages);
    
    // Extract actions and followups
    const actionsTaken = options?.actions || this.extractActions(messages);
    const pendingFollowups = options?.followups || this.extractFollowups(messages);
    
    const episode: Episode = {
      id: crypto.randomUUID(),
      timestamp: now,
      summary,
      topics,
      sentiment,
      actionsTaken,
      pendingFollowups,
      messageCount: messages.length
    };
    
    // Generate embedding for semantic search
    if (this.embeddings) {
      try {
        episode.embedding = await this.embeddings.embedQuery(summary);
        
        // Add to vector store
        if (this.vectorStore) {
          await this.vectorStore.upsert([{
            id: episode.id,
            vector: episode.embedding,
            metadata: {
              timestamp: now.toISOString(),
              topics,
              sentiment
            }
          }]);
        }
      } catch (error) {
        log(LogLevel.WARN, `EpisodicMemory: Failed to embed episode`, { error });
      }
    }
    
    // Add to episodes list
    this.episodes.push(episode);
    
    // Trim old episodes if needed
    if (this.episodes.length > this.config.maxEpisodes) {
      const removed = this.episodes.shift();
      if (removed && this.vectorStore) {
        await this.vectorStore.delete([removed.id]);
      }
    }
    
    this.dirty = true;
    await this.save();
    
    log(LogLevel.DEBUG, `EpisodicMemory: Added episode ${episode.id} with ${messages.length} messages`);
    return episode;
  }

  /**
   * Recall episodes relevant to a query
   */
  async recallRelevant(query: string, k = 5): Promise<Episode[]> {
    if (!this.embeddings || !this.vectorStore) {
      // Fallback to recency-based recall
      return this.episodes.slice(-k).reverse();
    }
    
    try {
      const queryEmbedding = await this.embeddings.embedQuery(query);
      const results = await this.vectorStore.query(queryEmbedding, k);
      
      return results
        .map(r => this.episodes.find(e => e.id === r.id))
        .filter((e): e is Episode => e !== undefined);
    } catch (error) {
      log(LogLevel.WARN, `EpisodicMemory: Recall failed, using recency`, { error });
      return this.episodes.slice(-k).reverse();
    }
  }

  /**
   * Get the most recent episode
   */
  getLastSession(): Episode | null {
    return this.episodes.length > 0 ? this.episodes[this.episodes.length - 1] : null;
  }

  /**
   * Get episodes from today
   */
  getTodayEpisodes(): Episode[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.episodes.filter(e => e.timestamp >= today);
  }

  /**
   * Get pending follow-ups across all episodes
   */
  getAllPendingFollowups(): { episode: Episode; followup: string }[] {
    const results: { episode: Episode; followup: string }[] = [];
    
    for (const episode of this.episodes) {
      for (const followup of episode.pendingFollowups) {
        results.push({ episode, followup });
      }
    }
    
    return results;
  }

  /**
   * Mark a followup as completed
   */
  async markFollowupComplete(episodeId: string, followup: string): Promise<void> {
    const episode = this.episodes.find(e => e.id === episodeId);
    if (episode) {
      episode.pendingFollowups = episode.pendingFollowups.filter(f => f !== followup);
      this.dirty = true;
      await this.save();
    }
  }

  /**
   * Generate a basic summary from messages
   */
  private generateBasicSummary(messages: BaseMessage[]): string {
    const humanMessages = messages
      .filter(m => m._getType() === 'human')
      .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .slice(-3);
    
    if (humanMessages.length === 0) {
      return 'Empty conversation';
    }
    
    const topics = humanMessages.join(' | ');
    return topics.length > 200 ? topics.slice(0, 200) + '...' : topics;
  }

  /**
   * Extract topics from messages using keyword analysis
   */
  private extractTopics(messages: BaseMessage[]): string[] {
    const text = messages
      .map(m => typeof m.content === 'string' ? m.content : '')
      .join(' ')
      .toLowerCase();
    
    // Simple keyword extraction
    const keywords = new Set<string>();
    
    // GTD-related
    if (text.includes('task') || text.includes('todo')) keywords.add('tasks');
    if (text.includes('project')) keywords.add('projects');
    if (text.includes('inbox')) keywords.add('inbox');
    if (text.includes('calendar') || text.includes('schedule')) keywords.add('calendar');
    
    // Productivity
    if (text.includes('meeting')) keywords.add('meetings');
    if (text.includes('email')) keywords.add('email');
    if (text.includes('reminder')) keywords.add('reminders');
    
    // Personal
    if (text.includes('health') || text.includes('exercise')) keywords.add('health');
    if (text.includes('habit')) keywords.add('habits');
    if (text.includes('goal')) keywords.add('goals');
    
    // Technical
    if (text.includes('code') || text.includes('programming')) keywords.add('coding');
    if (text.includes('bug') || text.includes('error')) keywords.add('debugging');
    
    return Array.from(keywords);
  }

  /**
   * Analyze sentiment of the conversation
   */
  private analyzeSentiment(messages: BaseMessage[]): 'positive' | 'neutral' | 'negative' {
    const text = messages
      .map(m => typeof m.content === 'string' ? m.content : '')
      .join(' ')
      .toLowerCase();
    
    const positiveWords = ['thanks', 'great', 'awesome', 'perfect', 'good', 'excellent', 'love', 'happy'];
    const negativeWords = ['error', 'failed', 'wrong', 'bad', 'issue', 'problem', 'frustrated', 'annoying'];
    
    let score = 0;
    for (const word of positiveWords) {
      if (text.includes(word)) score++;
    }
    for (const word of negativeWords) {
      if (text.includes(word)) score--;
    }
    
    if (score > 1) return 'positive';
    if (score < -1) return 'negative';
    return 'neutral';
  }

  /**
   * Extract actions taken from AI responses
   */
  private extractActions(messages: BaseMessage[]): string[] {
    const actions: string[] = [];
    
    for (const message of messages) {
      if (message._getType() === 'ai') {
        const content = typeof message.content === 'string' ? message.content : '';
        
        // Look for action indicators
        if (content.includes('created') || content.includes('added')) {
          const match = content.match(/(created|added)\s+(.{10,50})/i);
          if (match) actions.push(match[0]);
        }
        if (content.includes('sent') || content.includes('scheduled')) {
          const match = content.match(/(sent|scheduled)\s+(.{10,50})/i);
          if (match) actions.push(match[0]);
        }
      }
    }
    
    return actions.slice(0, 5);
  }

  /**
   * Extract potential followups from conversation
   */
  private extractFollowups(messages: BaseMessage[]): string[] {
    const followups: string[] = [];
    
    for (const message of messages) {
      const content = typeof message.content === 'string' ? message.content : '';
      
      // Look for followup indicators
      if (content.match(/remind me|don't forget|later|tomorrow|next week/i)) {
        const match = content.match(/(remind me|don't forget|later|tomorrow|next week).{10,100}/i);
        if (match) followups.push(match[0].slice(0, 100));
      }
      
      // Look for "will do" type commitments
      if (content.match(/i('ll| will)|let me|i can/i)) {
        const match = content.match(/(i('ll| will)|let me|i can)\s+(.{10,60})/i);
        if (match) followups.push(match[0]);
      }
    }
    
    return followups.slice(0, 3);
  }

  /**
   * Save episodes to disk
   */
  async save(): Promise<void> {
    if (!this.dirty) return;
    
    try {
      await fs.writeFile(
        this.episodesPath,
        JSON.stringify(this.episodes, null, 2)
      );
      
      if (this.vectorStore) {
        await this.vectorStore.save();
      }
      
      this.dirty = false;
    } catch (error) {
      log(LogLevel.ERROR, `EpisodicMemory: Failed to save`, { error });
    }
  }

  /**
   * Get episode count
   */
  get size(): number {
    return this.episodes.length;
  }

  /**
   * Get all episodes (for debugging)
   */
  getAllEpisodes(): Episode[] {
    return [...this.episodes];
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.save();
    if (this.vectorStore) {
      await this.vectorStore.dispose();
    }
  }
}

// Singleton instance
let memoryInstance: EpisodicMemory | null = null;

/**
 * Get or create the episodic memory instance
 */
export async function getEpisodicMemory(config?: EpisodicMemoryConfig): Promise<EpisodicMemory> {
  if (!memoryInstance && config) {
    memoryInstance = new EpisodicMemory(config);
    await memoryInstance.initialize();
  }
  
  if (!memoryInstance) {
    throw new Error('EpisodicMemory not initialized. Call with config first.');
  }
  
  return memoryInstance;
}

/**
 * Initialize episodic memory with configuration
 */
export async function initializeEpisodicMemory(config: EpisodicMemoryConfig): Promise<EpisodicMemory> {
  memoryInstance = new EpisodicMemory(config);
  await memoryInstance.initialize();
  return memoryInstance;
}
