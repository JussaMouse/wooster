// Core types for the Wooster Model Routing System

export type TaskType = 
  | 'TOOL_EXECUTION'
  | 'COMPLEX_REASONING'
  | 'CREATIVE_WRITING'
  | 'CODE_ASSISTANCE'
  | 'BACKGROUND_TASK'
  | 'RAG_PROCESSING';

export type RoutingStrategy = 'cost' | 'speed' | 'quality' | 'availability' | 'privacy';

export type ModelProviderType = 'openai' | 'local' | 'anthropic';

export interface RoutingContext {
  task: TaskType;
  project?: string;
  userPreferences?: UserModelPreferences;
  priority: 'fast' | 'quality' | 'cost';
  inputLength: number;
  expectedOutputLength?: number;
  isScheduledTask: boolean;
  requiresPrivacy: boolean;
}

export interface ModelRequest {
  task: TaskType;
  context?: RoutingContext;
  fallbackAllowed?: boolean;
}

export interface ModelProfile {
  preferred: string[];
  temperature: number;
  maxTokens: number;
  criteria: 'speed' | 'quality' | 'cost' | 'accuracy' | 'creativity';
  timeout: number;
}

export interface ModelProvider {
  name: string;
  type: ModelProviderType;
  available: boolean;
  models: Record<string, string>;
  healthStatus: HealthStatus;
  performance: ModelMetrics;
}

export interface HealthStatus {
  available: boolean;
  lastCheck: number;
  latency?: number;
  errorRate: number;
  rateLimited: boolean;
}

export interface ModelMetrics {
  provider: string;
  model: string;
  task: string;
  latency: number;
  tokensPerSecond: number;
  errorRate: number;
  cost: number;
  successCount: number;
  failureCount: number;
  lastUsed: number;
}

export interface RoutingDecision {
  timestamp: string;
  task: TaskType;
  selectedProvider: string;
  selectedModel: string;
  reasoning: string;
  fallbacksConsidered: string[];
  context: RoutingContext;
  performance?: ModelMetrics;
}

export interface UserModelPreferences {
  primaryModel?: string;
  fallbackChain?: string[];
  profiles?: Record<TaskType, Partial<ModelProfile>>;
  privacy?: {
    requireLocal: boolean;
    allowCloudFallback: boolean;
  };
  costLimits?: {
    daily?: number;
    monthly?: number;
  };
}

export interface ModelRoutingConfig {
  enabled: boolean;
  strategy: RoutingStrategy;
  fallbackChain: string[];
  providers: {
    openai: OpenAIProviderConfig;
    local: LocalProviderConfig;
    anthropic?: AnthropicProviderConfig;
  };
  profiles: Record<TaskType, ModelProfile>;
  healthCheck: {
    interval: number;
    timeout: number;
    retries: number;
  };
  logging: {
    decisions: boolean;
    performance: boolean;
    errors: boolean;
  };
}

export interface OpenAIProviderConfig {
  enabled: boolean;
  models: Record<string, string>;
  rateLimiting: boolean;
  costTracking: boolean;
  maxRequestsPerMinute?: number;
}

export interface LocalProviderConfig {
  enabled: boolean;
  serverUrl: string;
  autoStart: boolean;
  models: Record<string, string>;
  modelsDir?: string;
  healthCheckInterval?: number;
}

export interface AnthropicProviderConfig {
  enabled: boolean;
  models: Record<string, string>;
  rateLimiting: boolean;
}

// Re-export BaseLanguageModel type for convenience
export type { BaseLanguageModel as BaseLLM } from '@langchain/core/language_models/base'; 