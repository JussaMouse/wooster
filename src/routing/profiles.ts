import { TaskType, ModelProfile } from './types';

// Task-specific model profiles for optimal performance
export const ModelProfiles: Record<TaskType, ModelProfile> = {
  // Fast responses for tool calls and simple queries
  TOOL_EXECUTION: {
    preferred: ['local-small', 'gpt-4o-mini'],
    temperature: 0.1,
    maxTokens: 512,
    criteria: 'speed',
    timeout: 5000
  },

  // High-quality reasoning for complex agent decisions
  COMPLEX_REASONING: {
    preferred: ['gpt-4o', 'claude-3.5-sonnet', 'local-large'],
    temperature: 0.3,
    maxTokens: 2048,
    criteria: 'quality',
    timeout: 30000
  },

  // Creative tasks and content generation
  CREATIVE_WRITING: {
    preferred: ['gpt-4o', 'local-creative'],
    temperature: 0.8,
    maxTokens: 1024,
    criteria: 'creativity',
    timeout: 15000
  },

  // Code analysis and generation
  CODE_ASSISTANCE: {
    preferred: ['local-coder', 'gpt-4o', 'claude-3.5-sonnet'],
    temperature: 0.2,
    maxTokens: 1024,
    criteria: 'accuracy',
    timeout: 20000
  },

  // Background tasks and scheduled operations
  BACKGROUND_TASK: {
    preferred: ['local-small', 'gpt-4o-mini'],
    temperature: 0.1,
    maxTokens: 256,
    criteria: 'cost',
    timeout: 10000
  },

  // RAG query processing and document analysis
  RAG_PROCESSING: {
    preferred: ['local-medium', 'gpt-4o-mini'],
    temperature: 0.2,
    maxTokens: 1024,
    criteria: 'accuracy',
    timeout: 15000
  }
};

// Default fallback chains by strategy
export const DefaultFallbackChains = {
  speed: ['local-small', 'local-medium', 'gpt-4o-mini'],
  quality: ['gpt-4o', 'claude-3.5-sonnet', 'local-large', 'gpt-4o-mini'],
  cost: ['local-small', 'gpt-4o-mini', 'local-medium'],
  privacy: ['local-small', 'local-medium', 'local-large'],
  availability: ['gpt-4o-mini', 'local-small', 'gpt-4o']
};

// Model alias mappings for user-friendly names
export const ModelAliases = {
  // Local MLX models
  'local-small': 'mlx-community/Qwen2.5-3B-Instruct-4bit',
  'local-medium': 'mlx-community/Mistral-7B-Instruct-v0.3-4bit',
  'local-large': 'mlx-community/Llama-3.1-8B-Instruct-4bit',
  'local-coder': 'mlx-community/Qwen2.5-Coder-7B-Instruct-4bit',
  'local-creative': 'mlx-community/Mistral-7B-Instruct-v0.3-4bit',
  
  // OpenAI models
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4o': 'gpt-4o',
  'gpt-4': 'gpt-4',
  
  // Anthropic models (future)
  'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-3-haiku': 'claude-3-haiku-20240307'
};

// Helper function to get profile for a task
export function getProfileForTask(task: TaskType): ModelProfile {
  return ModelProfiles[task] || ModelProfiles.TOOL_EXECUTION;
}

// Helper function to resolve model alias
export function resolveModelAlias(alias: string): string {
  return ModelAliases[alias as keyof typeof ModelAliases] || alias;
} 