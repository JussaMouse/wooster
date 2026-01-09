import axios from 'axios';
import { ChatOpenAI } from '@langchain/openai';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { log, LogLevel } from '../logger';
import {
  TaskComplexity,
  ModelTier,
  RoutingDecision,
  IntelligentRoutingConfig,
  TierConfig,
  DEFAULT_TIER_CONFIG,
  complexityToTier
} from './TaskComplexity';

/**
 * Classification prompt for the router model
 */
const ROUTING_PROMPT = `Classify this user request into exactly one category:

TRIVIAL: Greetings, time queries, simple facts you already know, thank you messages
SIMPLE: Weather lookups, quick yes/no questions, single-step tasks, add/remove from list
COMPLEX: Multi-step tasks without deep reasoning, summarization, fact extraction
REASONING: Planning, code generation, analysis, debugging, creative writing, multi-tool orchestration

User request: {input}

Respond with ONLY valid JSON, no other text:
{"category": "TRIVIAL|SIMPLE|COMPLEX|REASONING", "confidence": 0.0-1.0, "reason": "brief explanation"}`;

/**
 * IntelligentRouter - 3-tier model routing for optimal performance
 * 
 * Architecture:
 * - Tier 0 (Router): Qwen3-0.6B - Classification & trivial queries (~300+ tok/s)
 * - Tier 1-2 (Fast): Qwen3-30B-A3B - Most queries (~100-150 tok/s)
 * - Tier 3 (Thinking): Qwen3-30B-A3B-Thinking - Complex reasoning (~50-80 tok/s)
 */
export class IntelligentRouter {
  private config: IntelligentRoutingConfig;
  private healthStatus: Map<ModelTier, { healthy: boolean; lastCheck: number }> = new Map();
  private routingStats = {
    totalRouted: 0,
    patternMatched: 0,
    llmClassified: 0,
    byTier: { router: 0, fast: 0, thinking: 0 }
  };

  constructor(config?: Partial<IntelligentRoutingConfig>) {
    this.config = { ...DEFAULT_TIER_CONFIG, ...config };
    
    // Initialize health status
    this.healthStatus.set('router', { healthy: true, lastCheck: 0 });
    this.healthStatus.set('fast', { healthy: true, lastCheck: 0 });
    this.healthStatus.set('thinking', { healthy: true, lastCheck: 0 });
    
    log(LogLevel.INFO, `IntelligentRouter: Initialized with 3-tier routing`);
  }

  /**
   * Route a user input to the appropriate model tier
   */
  async route(input: string): Promise<RoutingDecision> {
    const startTime = Date.now();
    this.routingStats.totalRouted++;

    // Step 1: Try quick pattern matching (no LLM call)
    const quickMatch = this.quickClassify(input);
    if (quickMatch) {
      quickMatch.classificationTime = Date.now() - startTime;
      this.routingStats.patternMatched++;
      this.routingStats.byTier[quickMatch.tier]++;
      
      log(LogLevel.DEBUG, `[Router] Pattern match: ${quickMatch.tier} - "${quickMatch.reasoning}"`);
      return quickMatch;
    }

    // Step 2: Use router model for ambiguous cases
    try {
      const decision = await this.classifyWithLLM(input);
      decision.classificationTime = Date.now() - startTime;
      this.routingStats.llmClassified++;
      this.routingStats.byTier[decision.tier]++;
      
      log(LogLevel.DEBUG, `[Router] LLM classified: ${decision.tier} - "${decision.reasoning}"`);
      return decision;
    } catch (error) {
      log(LogLevel.WARN, `[Router] Classification failed, defaulting to fast tier`, { error });
      
      // Default to fast tier on classification failure
      const defaultDecision: RoutingDecision = {
        complexity: TaskComplexity.SIMPLE,
        model: this.config.tiers.fast.model,
        tier: 'fast',
        reasoning: 'Classification failed, using default',
        confidence: 0.5,
        usedLLM: false,
        classificationTime: Date.now() - startTime
      };
      
      this.routingStats.byTier.fast++;
      return defaultDecision;
    }
  }

  /**
   * Quick pattern-based classification (no LLM call)
   * Returns null if pattern matching is inconclusive
   */
  private quickClassify(input: string): RoutingDecision | null {
    const lower = input.toLowerCase().trim();
    
    // TRIVIAL patterns - router can answer directly
    const trivialPatterns = [
      { pattern: /^(hi|hello|hey|good morning|good afternoon|good evening|howdy)\b/i, reason: 'Greeting' },
      { pattern: /^(thanks|thank you|thx|ty)\b/i, reason: 'Thank you message' },
      { pattern: /^(what time|what's the time|current time|time now)/i, reason: 'Time query' },
      { pattern: /^(what day|what's the date|today's date|what date)/i, reason: 'Date query' },
      { pattern: /^(bye|goodbye|see you|later|cya)\b/i, reason: 'Farewell' },
      { pattern: /^(ok|okay|got it|understood|sure)\b$/i, reason: 'Acknowledgment' },
      { pattern: /^yes\b|^no\b|^yeah\b|^nope\b/i, reason: 'Simple yes/no' }
    ];
    
    for (const { pattern, reason } of trivialPatterns) {
      if (pattern.test(lower)) {
        return {
          complexity: TaskComplexity.TRIVIAL,
          model: this.config.tiers.router.model,
          tier: 'router',
          reasoning: reason,
          confidence: 0.95,
          usedLLM: false
        };
      }
    }

    // SIMPLE patterns - fast model, single operations
    const simplePatterns = [
      { pattern: /^(what's the weather|weather in|weather for|forecast)/i, reason: 'Weather query' },
      { pattern: /^(add|put)\s+.+\s+(to|in|on)\s+(inbox|list|shopping|todo|tasks)/i, reason: 'Add to list' },
      { pattern: /^(remove|delete)\s+.+\s+(from)\s+(inbox|list|shopping|todo)/i, reason: 'Remove from list' },
      { pattern: /^(show|list|get|view)\s+(my\s+)?(tasks|events|calendar|inbox|next actions)/i, reason: 'List items' },
      { pattern: /^(what|when) is (my|the) next/i, reason: 'Next item query' },
      { pattern: /^(do i have|are there).+(meeting|event|appointment)/i, reason: 'Calendar check' },
      { pattern: /^(mark|complete|done|finish)\s+.+(task|item|action)/i, reason: 'Complete task' }
    ];
    
    for (const { pattern, reason } of simplePatterns) {
      if (pattern.test(lower)) {
        return {
          complexity: TaskComplexity.SIMPLE,
          model: this.config.tiers.fast.model,
          tier: 'fast',
          reasoning: reason,
          confidence: 0.9,
          usedLLM: false
        };
      }
    }

    // REASONING triggers - thinking model required
    const reasoningTriggers = [
      { pattern: /help me (plan|think|decide|figure out|organize|strategize)/i, reason: 'Planning assistance' },
      { pattern: /write\s+(a\s+|an\s+|some\s+)?(code|script|function|program|class)/i, reason: 'Code generation' },
      { pattern: /create a (plan|schedule|strategy|outline|roadmap|proposal)/i, reason: 'Strategic planning' },
      { pattern: /(analyze|compare|evaluate|assess|review|debug|troubleshoot)/i, reason: 'Analysis task' },
      { pattern: /step.by.step|walk me through|explain how/i, reason: 'Detailed explanation' },
      { pattern: /why (did|does|is|are|should|would|can't|won't)/i, reason: 'Reasoning question' },
      { pattern: /how (can|do|should|would|could) (i|we) (best|effectively|properly)/i, reason: 'Advice request' },
      { pattern: /(schedule|book|arrange|plan).+(and|then|also|after)/i, reason: 'Multi-step coordination' },
      { pattern: /(refactor|optimize|improve|rewrite)\s+(the|this|my)/i, reason: 'Code improvement' },
      { pattern: /draft (an?\s+)?(email|message|letter|response|reply)/i, reason: 'Composition task' },
      { pattern: /summarize.+(and|then)|extract.+(and|from)/i, reason: 'Complex extraction' },
      { pattern: /what's wrong with|fix (this|the|my)|debug/i, reason: 'Debugging' }
    ];
    
    for (const { pattern, reason } of reasoningTriggers) {
      if (pattern.test(lower)) {
        return {
          complexity: TaskComplexity.REASONING,
          model: this.config.tiers.thinking.model,
          tier: 'thinking',
          reasoning: reason,
          confidence: 0.85,
          usedLLM: false
        };
      }
    }

    // No pattern matched - needs LLM classification
    return null;
  }

  /**
   * Use the router model to classify ambiguous inputs
   */
  private async classifyWithLLM(input: string): Promise<RoutingDecision> {
    const prompt = ROUTING_PROMPT.replace('{input}', input);
    
    try {
      const response = await this.callRouterModel(prompt);
      const parsed = this.parseClassificationResponse(response);
      
      const complexity = this.mapCategory(parsed.category);
      const tier = complexityToTier(complexity);
      
      return {
        complexity,
        model: this.getModelForTier(tier),
        tier,
        reasoning: parsed.reason || 'LLM classified',
        confidence: parsed.confidence || 0.7,
        usedLLM: true
      };
    } catch (error) {
      log(LogLevel.WARN, `[Router] LLM classification error`, { error });
      throw error;
    }
  }

  /**
   * Call the router model for classification
   */
  private async callRouterModel(prompt: string): Promise<string> {
    const tierConfig = this.config.tiers.router;
    const baseURL = tierConfig.serverUrl.endsWith('/v1') 
      ? tierConfig.serverUrl 
      : `${tierConfig.serverUrl.replace(/\/$/, '')}/v1`;

    try {
      const response = await axios.post(
        `${baseURL}/chat/completions`,
        {
          model: tierConfig.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: tierConfig.maxTokens,
          temperature: 0.1 // Low temperature for consistent classification
        },
        { timeout: this.config.healthCheck.timeout * 2 }
      );

      return response.data.choices[0]?.message?.content || '';
    } catch (error) {
      log(LogLevel.ERROR, `[Router] Failed to call router model`, { error });
      throw error;
    }
  }

  /**
   * Parse the classification response from the router model
   */
  private parseClassificationResponse(response: string): { category: string; confidence: number; reason: string } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          category: (parsed.category || 'SIMPLE').toUpperCase(),
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
          reason: parsed.reason || ''
        };
      }
    } catch {
      log(LogLevel.DEBUG, `[Router] Failed to parse JSON response: ${response}`);
    }

    // Fallback: look for category keywords in response
    const upper = response.toUpperCase();
    if (upper.includes('TRIVIAL')) return { category: 'TRIVIAL', confidence: 0.6, reason: 'Keyword match' };
    if (upper.includes('REASONING')) return { category: 'REASONING', confidence: 0.6, reason: 'Keyword match' };
    if (upper.includes('COMPLEX')) return { category: 'COMPLEX', confidence: 0.6, reason: 'Keyword match' };
    
    return { category: 'SIMPLE', confidence: 0.5, reason: 'Default fallback' };
  }

  /**
   * Map category string to TaskComplexity enum
   */
  private mapCategory(category: string): TaskComplexity {
    switch (category.toUpperCase()) {
      case 'TRIVIAL':
        return TaskComplexity.TRIVIAL;
      case 'SIMPLE':
        return TaskComplexity.SIMPLE;
      case 'COMPLEX':
        return TaskComplexity.COMPLEX;
      case 'REASONING':
        return TaskComplexity.REASONING;
      default:
        return TaskComplexity.SIMPLE;
    }
  }

  /**
   * Get model name for a specific tier
   */
  getModelForTier(tier: ModelTier): string {
    return this.config.tiers[tier].model;
  }

  /**
   * Get the complete tier configuration
   */
  getTierConfig(tier: ModelTier): TierConfig {
    return this.config.tiers[tier];
  }

  /**
   * Get a LangChain ChatOpenAI instance for a tier
   */
  getChatModel(tier: ModelTier, temperature = 0.7): BaseLanguageModel {
    const tierConfig = this.config.tiers[tier];
    const baseURL = tierConfig.serverUrl.endsWith('/v1')
      ? tierConfig.serverUrl
      : `${tierConfig.serverUrl.replace(/\/$/, '')}/v1`;

    return new ChatOpenAI({
      modelName: tierConfig.model,
      temperature,
      maxTokens: tierConfig.maxTokens,
      openAIApiKey: 'local-mlx', // Not used for local, but required
      configuration: { baseURL }
    } as any);
  }

  /**
   * Get the tier for a specific task type based on rules
   */
  getTierForTask(taskType: keyof IntelligentRoutingConfig['rules']): ModelTier {
    return this.config.rules[taskType] || this.config.rules.default;
  }

  /**
   * Check health of a specific tier
   */
  async checkTierHealth(tier: ModelTier): Promise<boolean> {
    const tierConfig = this.config.tiers[tier];
    const now = Date.now();
    const status = this.healthStatus.get(tier);
    
    // Use cached result if recent
    if (status && now - status.lastCheck < this.config.healthCheck.interval) {
      return status.healthy;
    }

    try {
      const baseURL = tierConfig.serverUrl.replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/v1/models`, {
        timeout: this.config.healthCheck.timeout
      });
      
      const healthy = response.status === 200 && Array.isArray(response.data?.data);
      this.healthStatus.set(tier, { healthy, lastCheck: now });
      return healthy;
    } catch {
      this.healthStatus.set(tier, { healthy: false, lastCheck: now });
      return false;
    }
  }

  /**
   * Check health of all tiers
   */
  async checkAllHealth(): Promise<Record<ModelTier, boolean>> {
    const [router, fast, thinking] = await Promise.all([
      this.checkTierHealth('router'),
      this.checkTierHealth('fast'),
      this.checkTierHealth('thinking')
    ]);
    
    return { router, fast, thinking };
  }

  /**
   * Get routing statistics
   */
  getStats(): typeof this.routingStats & { healthStatus: Record<ModelTier, boolean> } {
    return {
      ...this.routingStats,
      healthStatus: {
        router: this.healthStatus.get('router')?.healthy ?? false,
        fast: this.healthStatus.get('fast')?.healthy ?? false,
        thinking: this.healthStatus.get('thinking')?.healthy ?? false
      }
    };
  }

  /**
   * Get configuration
   */
  getConfig(): IntelligentRoutingConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<IntelligentRoutingConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Singleton instance
let routerInstance: IntelligentRouter | null = null;

/**
 * Get or create the intelligent router instance
 */
export function getIntelligentRouter(config?: Partial<IntelligentRoutingConfig>): IntelligentRouter {
  if (!routerInstance) {
    routerInstance = new IntelligentRouter(config);
  }
  return routerInstance;
}

/**
 * Initialize the intelligent router with configuration
 */
export function initializeIntelligentRouter(config?: Partial<IntelligentRoutingConfig>): IntelligentRouter {
  routerInstance = new IntelligentRouter(config);
  return routerInstance;
}

/**
 * Reset the router instance (for testing)
 */
export function resetIntelligentRouter(): void {
  routerInstance = null;
}
