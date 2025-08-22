import { ChatOpenAI } from "@langchain/openai";
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { AppConfig, ModelRoutingConfig } from '../configLoader';
import { log, LogLevel } from '../logger';
import { 
  ModelRequest, 
  RoutingContext, 
  TaskType,
  RoutingDecision,
  ModelMetrics
} from './types';
import { getProfileForTask, ModelProfiles } from './profiles';
import { LocalModelClient } from './LocalModelClient';

/**
 * ModelRouterService - Core routing logic for Wooster's multi-model system
 * 
 * Phase 1: Zero-latency passthrough to existing models
 * Phase 2: Local model integration with fallback
 * Phase 3: Intelligent routing based on task profiles
 */
export class ModelRouterService {
  private primaryModel: ChatOpenAI;
  private config: AppConfig;
  private routingConfig: ModelRoutingConfig;
  private isInitialized = false;

  // Performance tracking
  private routingDecisions: RoutingDecision[] = [];
  private modelMetrics = new Map<string, ModelMetrics>();

  // Local model client (Phase 2)
  private localModelClient: LocalModelClient | null = null;
  private localModelHealthy: boolean = false;
  private lastHealthCheck: number = 0;

  constructor(config: AppConfig) {
    this.config = config;
    this.routingConfig = config.routing || this.getDefaultRoutingConfig();
    
    // Initialize primary model exactly like current system
    this.primaryModel = new ChatOpenAI({
      modelName: config.openai.modelName,
      temperature: config.openai.temperature,
      openAIApiKey: config.openai.apiKey,
    });

    // Phase 2: Initialize local model client if enabled
    if (this.routingConfig.providers.local?.enabled) {
      const localModelName = this.routingConfig.providers.local.models?.fast || 'mlx-community/Mistral-7B-Instruct-v0.3-4bit';
      this.localModelClient = new LocalModelClient({
        serverUrl: this.routingConfig.providers.local.serverUrl,
        model: localModelName,
        timeout: 10000
      });
    }

    log(LogLevel.INFO, `ModelRouter: Initialized with routing ${this.routingConfig.enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Phase 1: Direct passthrough (zero added latency)
   * Returns the primary model for all requests to maintain current behavior
   */
  async selectModel(request: ModelRequest): Promise<BaseLanguageModel> {
    const startTime = Date.now();

    try {
      // Phase 1: Always return primary model (zero-latency)
      if (!this.routingConfig.enabled) {
        return this.primaryModel;
      }

      // Future phases will add intelligent routing here
      const model = await this.selectModelIntelligent(request);
      
      // Track routing decision
      this.trackRoutingDecision(request, 'openai', this.config.openai.modelName, 'Phase 1 passthrough', startTime);
      
      return model;

    } catch (error) {
      log(LogLevel.ERROR, 'ModelRouter: Error in selectModel', { error, request });
      // Fallback to primary model on any error
      return this.primaryModel;
    }
  }

  /**
   * Phase 2/3: Intelligent routing logic
   */
  private async selectModelIntelligent(request: ModelRequest): Promise<BaseLanguageModel> {
    // Phase 2: Try local model first if enabled and healthy
    if (this.localModelClient && this.routingConfig.providers.local.enabled) {
      await this.checkLocalModelHealth();
      if (this.localModelHealthy) {
        // Prefer local MLX server via OpenAI-compatible baseURL
        const serverUrl = this.routingConfig.providers.local.serverUrl || 'http://127.0.0.1:8080';
        const baseURL = serverUrl.endsWith('/v1') ? serverUrl : `${serverUrl.replace(/\/$/, '')}/v1`;
        const localModelName = this.routingConfig.providers.local.models?.fast || this.config.openai.modelName;
        log(LogLevel.INFO, `ModelRouter: Routing to local MLX chat at ${baseURL} (model=${localModelName})`);
        const localChat = new ChatOpenAI({
          modelName: localModelName,
          temperature: this.config.openai.temperature,
          // API key not required for local, but some clients expect a string
          openAIApiKey: this.config.openai.apiKey || 'local-mlx',
          configuration: { baseURL },
        } as any);
        return localChat;
      } else {
        log(LogLevel.WARN, 'ModelRouter: Local model unavailable, falling back to OpenAI');
      }
    }
    // Fallback: OpenAI
    return this.primaryModel;
  }

  /**
   * Health check for local model (every 30s)
   */
  private async checkLocalModelHealth() {
    const now = Date.now();
    if (!this.localModelClient) return;
    if (now - this.lastHealthCheck < 30000) return;
    this.localModelHealthy = await this.localModelClient.isHealthy();
    this.lastHealthCheck = now;
  }

  /**
   * Create a routing context for a task
   */
  createContext(
    task: TaskType,
    options: {
      project?: string;
      priority?: 'fast' | 'quality' | 'cost';
      inputLength?: number;
      isScheduledTask?: boolean;
      requiresPrivacy?: boolean;
    } = {}
  ): RoutingContext {
    return {
      task,
      project: options.project,
      priority: options.priority || 'fast',
      inputLength: options.inputLength || 0,
      isScheduledTask: options.isScheduledTask || false,
      requiresPrivacy: options.requiresPrivacy || false
    };
  }

  /**
   * Get the primary model instance (for backward compatibility)
   */
  getPrimaryModel(): ChatOpenAI {
    return this.primaryModel;
  }

  /**
   * Check if routing is enabled
   */
  isRoutingEnabled(): boolean {
    return this.routingConfig.enabled;
  }

  /**
   * Get routing statistics
   */
  getRoutingStats() {
    return {
      enabled: this.routingConfig.enabled,
      totalDecisions: this.routingDecisions.length,
      recentDecisions: this.routingDecisions.slice(-10),
      modelMetrics: Array.from(this.modelMetrics.values())
    };
  }

  /**
   * Track routing decision for analysis
   */
  private trackRoutingDecision(
    request: ModelRequest, 
    selectedProvider: string, 
    selectedModel: string, 
    reasoning: string,
    startTime: number
  ) {
    const decision: RoutingDecision = {
      timestamp: new Date().toISOString(),
      task: request.task,
      selectedProvider,
      selectedModel,
      reasoning,
      fallbacksConsidered: [],
      context: request.context || this.createContext(request.task)
    };

    this.routingDecisions.push(decision);
    
    // Keep only last 100 decisions to prevent memory growth
    if (this.routingDecisions.length > 100) {
      this.routingDecisions = this.routingDecisions.slice(-100);
    }

    // Log routing decision if enabled
    if (this.routingConfig.logging?.decisions) {
      const latency = Date.now() - startTime;
      log(LogLevel.DEBUG, `[MODEL_ROUTING] Selected ${selectedProvider}/${selectedModel} for ${request.task}`, {
        reasoning,
        latency: `${latency}ms`,
        context: request.context
      });
    }
  }

  /**
   * Default routing configuration
   */
  private getDefaultRoutingConfig(): ModelRoutingConfig {
    return {
      enabled: false, // Disabled by default for Phase 1
      strategy: 'speed',
      fallbackChain: ['gpt-4o-mini', 'gpt-4o'],
      providers: {
        openai: {
          enabled: true,
          models: {
            fast: 'gpt-4o-mini',
            quality: 'gpt-4o'
          },
          rateLimiting: false,
          costTracking: false
        },
        local: {
          enabled: false,
          serverUrl: 'http://localhost:8000',
          autoStart: false,
          models: {}
        }
      },
      profiles: ModelProfiles,
      healthCheck: {
        interval: 30000,
        timeout: 5000,
        retries: 3
      },
      logging: {
        decisions: false,
        performance: false,
        errors: true
      }
    };
  }
}

// Singleton instance
let routerInstance: ModelRouterService | null = null;

/**
 * Get or create the router instance
 */
export function getModelRouter(config?: AppConfig): ModelRouterService {
  if (!routerInstance && config) {
    routerInstance = new ModelRouterService(config);
  }
  
  if (!routerInstance) {
    throw new Error('ModelRouter not initialized. Call with config first.');
  }
  
  return routerInstance;
}

/**
 * Initialize the router (called during Wooster startup)
 */
export function initializeModelRouter(config: AppConfig): ModelRouterService {
  routerInstance = new ModelRouterService(config);
  return routerInstance;
} 