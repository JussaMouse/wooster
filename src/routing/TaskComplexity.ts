/**
 * TaskComplexity - Classification for intelligent 3-tier routing
 * 
 * This enum maps to the model tiers:
 * - TRIVIAL -> Router model (Qwen3-0.6B): Instant responses, no reasoning
 * - SIMPLE -> Fast model (Qwen3-30B-A3B): Single tool calls, lookups
 * - COMPLEX -> Fast model (Qwen3-30B-A3B): Multi-step but straightforward
 * - REASONING -> Thinking model (Qwen3-30B-A3B-Thinking): Deep reasoning, code, planning
 */
export enum TaskComplexity {
  /** Greetings, time, simple facts - router can answer directly */
  TRIVIAL = 'trivial',
  
  /** Weather, quick lookups, yes/no, single tool calls */
  SIMPLE = 'simple',
  
  /** Multi-step tasks, summarization, fact extraction */
  COMPLEX = 'complex',
  
  /** Planning, code generation, analysis, creative writing */
  REASONING = 'reasoning'
}

/**
 * Model tier corresponding to complexity level
 */
export type ModelTier = 'router' | 'fast' | 'thinking';

/**
 * Routing decision returned by the intelligent router
 */
export interface RoutingDecision {
  /** Determined complexity level */
  complexity: TaskComplexity;
  
  /** Model to use for this request */
  model: string;
  
  /** Which tier this routes to */
  tier: ModelTier;
  
  /** Why this routing decision was made */
  reasoning: string;
  
  /** Confidence in the classification (0-1) */
  confidence: number;
  
  /** Whether classification used LLM (vs pattern matching) */
  usedLLM: boolean;
  
  /** Time taken to classify (ms) */
  classificationTime?: number;
}

/**
 * Tier configuration for a model
 */
export interface TierConfig {
  model: string;
  serverUrl: string;
  maxTokens: number;
  thinkingBudget?: number; // Only for thinking tier
}

/**
 * Complete routing configuration for all tiers
 */
export interface IntelligentRoutingConfig {
  enabled: boolean;
  
  tiers: {
    router: TierConfig;
    fast: TierConfig;
    thinking: TierConfig;
  };
  
  /** Task-specific tier overrides */
  rules: {
    codeAgent: ModelTier;
    multiToolCall: ModelTier;
    singleToolCall: ModelTier;
    ragQuery: ModelTier;
    factExtraction: ModelTier;
    planning: ModelTier;
    creative: ModelTier;
    default: ModelTier;
  };
  
  /** Health check settings */
  healthCheck: {
    timeout: number;
    interval: number;
  };
}

/**
 * Default tier configuration aligned with mlx-box settings
 */
export const DEFAULT_TIER_CONFIG: IntelligentRoutingConfig = {
  enabled: true,
  
  tiers: {
    router: {
      model: 'mlx-community/Qwen3-0.6B-4bit',
      serverUrl: 'http://127.0.0.1:8080',
      maxTokens: 100
    },
    fast: {
      model: 'mlx-community/Qwen3-30B-A3B-4bit',
      serverUrl: 'http://127.0.0.1:8081',
      maxTokens: 4096
    },
    thinking: {
      model: 'mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit',
      serverUrl: 'http://127.0.0.1:8083',
      maxTokens: 8192,
      thinkingBudget: 4096
    }
  },
  
  rules: {
    codeAgent: 'thinking',
    multiToolCall: 'thinking',
    singleToolCall: 'fast',
    ragQuery: 'fast',
    factExtraction: 'fast',
    planning: 'thinking',
    creative: 'thinking',
    default: 'fast'
  },
  
  healthCheck: {
    timeout: 2000,
    interval: 30000
  }
};

/**
 * Map task complexity to model tier
 */
export function complexityToTier(complexity: TaskComplexity): ModelTier {
  switch (complexity) {
    case TaskComplexity.TRIVIAL:
      return 'router';
    case TaskComplexity.SIMPLE:
    case TaskComplexity.COMPLEX:
      return 'fast';
    case TaskComplexity.REASONING:
      return 'thinking';
  }
}

/**
 * Estimate expected latency for a tier (in ms)
 */
export function estimateTierLatency(tier: ModelTier): { min: number; max: number } {
  switch (tier) {
    case 'router':
      return { min: 50, max: 200 };
    case 'fast':
      return { min: 200, max: 1000 };
    case 'thinking':
      return { min: 1000, max: 5000 };
  }
}
