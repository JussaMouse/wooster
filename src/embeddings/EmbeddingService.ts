import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AppConfig } from '../configLoader';
import { log, LogLevel } from '../logger';
import { HttpEmbeddings } from './HttpEmbeddings';

export type EmbeddingProvider = 'openai' | 'local' | 'server' | 'http';

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  dimensions?: number;
  serverUrl?: string;
}

/**
 * Unified embeddings interface for LangChain compatibility
 */
export interface Embeddings {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

/**
 * Wrapper to make HttpEmbeddings compatible with LangChain interfaces
 */
class HttpEmbeddingsWrapper implements Embeddings {
  private httpEmbeddings: HttpEmbeddings;

  constructor(config: { baseUrl: string; model?: string; dimensions?: number }) {
    this.httpEmbeddings = new HttpEmbeddings(config);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.httpEmbeddings.embedDocuments(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.httpEmbeddings.embedQuery(text);
  }

  async isHealthy(): Promise<boolean> {
    return this.httpEmbeddings.isHealthy();
  }

  getDimensions(): number {
    return this.httpEmbeddings.getDimensions();
  }

  getModel(): string {
    return this.httpEmbeddings.getModel();
  }
}

export class EmbeddingService {
  private static instances = new Map<string, EmbeddingService>();
  private embeddings: Embeddings;
  private config: EmbeddingConfig;

  private constructor(config: EmbeddingConfig, appConfig: AppConfig) {
    this.config = config;

    if (config.provider === 'http') {
      // Direct HTTP connection to local embedding server (preferred for mlx-box)
      this.embeddings = new HttpEmbeddingsWrapper({
        baseUrl: config.serverUrl || 'http://127.0.0.1:8084',
        model: config.model,
        dimensions: config.dimensions
      });
    } else if (config.provider === 'openai') {
      this.embeddings = new OpenAIEmbeddings({
        modelName: config.model,
        openAIApiKey: appConfig.openai.apiKey,
      });
    } else if (config.provider === 'server') {
      // OpenAI-compatible local server (e.g., MLX embed server) via LangChain
      this.embeddings = new OpenAIEmbeddings({
        modelName: config.model,
        openAIApiKey: appConfig.openai.apiKey || 'local-key',
        configuration: {
          baseURL: config.serverUrl || appConfig.routing?.providers?.local?.embeddings?.serverUrl,
        } as any,
      });
    } else {
      this.embeddings = new HuggingFaceTransformersEmbeddings({
        modelName: config.model,
      });
    }

    log(LogLevel.INFO, `EmbeddingService: Initialized ${config.provider} embeddings with model ${config.model}`);
  }

  /**
   * Get or create embedding service instance
   * Uses singleton pattern to avoid reloading models
   */
  static getInstance(key: string, config: EmbeddingConfig, appConfig: AppConfig): EmbeddingService {
    if (!this.instances.has(key)) {
      this.instances.set(key, new EmbeddingService(config, appConfig));
    }
    return this.instances.get(key)!;
  }

  /**
   * Get the best available embedding service based on configuration
   * Priority: http (mlx-box) > server (OpenAI-compatible) > openai > local
   */
  static getBestAvailable(appConfig: AppConfig): EmbeddingService {
    const localConfig = appConfig.routing?.providers?.local?.embeddings;
    
    // Priority 1: Direct HTTP to mlx-box (fastest, no OpenAI dependency)
    if (localConfig?.enabled) {
      return this.getInstance('http-default', {
        provider: 'http',
        model: localConfig.projects?.model || 'Qwen/Qwen3-Embedding-8B',
        dimensions: localConfig.projects?.dimensions || 4096,
        serverUrl: localConfig.serverUrl || 'http://127.0.0.1:8084'
      }, appConfig);
    }

    // Priority 2: OpenAI (if enabled and API key available)
    if (appConfig.openai?.enabled && appConfig.openai?.apiKey) {
      return this.getInstance('openai-default', {
        provider: 'openai',
        model: appConfig.openai.embeddingModelName || 'text-embedding-3-small',
      }, appConfig);
    }

    // Priority 3: Local HuggingFace model (slowest, but works offline)
    return this.getInstance('local-default', {
      provider: 'local',
      model: 'sentence-transformers/all-mpnet-base-v2',
      dimensions: 768
    }, appConfig);
  }

  /**
   * Get embedding service for projects
   */
  static getProjectEmbeddings(appConfig: AppConfig): EmbeddingService {
    const localConfig = appConfig.routing?.providers?.local?.embeddings;
    
    // Prefer HTTP connection to mlx-box
    if (localConfig?.enabled && localConfig.projects?.enabled) {
      return this.getInstance('projects-http', {
        provider: 'http',
        model: localConfig.projects.model,
        dimensions: localConfig.projects.dimensions,
        serverUrl: localConfig.serverUrl || 'http://127.0.0.1:8084'
      }, appConfig);
    }

    // Legacy: OpenAI-compatible server via LangChain
    if (localConfig?.enabled) {
      return this.getInstance('projects-server', {
        provider: 'server',
        model: localConfig.projects?.model || 'Qwen/Qwen3-Embedding-8B',
        dimensions: localConfig.projects?.dimensions || 4096,
        serverUrl: localConfig.serverUrl
      }, appConfig);
    }

    // Fallback to OpenAI
    return this.getInstance('projects-openai', {
      provider: 'openai',
      model: appConfig.openai.embeddingModelName,
    }, appConfig);
  }

  /**
   * Get embedding service for user profile
   */
  static getUserProfileEmbeddings(appConfig: AppConfig): EmbeddingService {
    const localConfig = appConfig.routing?.providers?.local?.embeddings;
    
    // Prefer HTTP connection to mlx-box
    if (localConfig?.enabled && localConfig.userProfile?.enabled) {
      return this.getInstance('userProfile-http', {
        provider: 'http',
        model: localConfig.userProfile.model,
        dimensions: localConfig.userProfile.dimensions,
        serverUrl: localConfig.serverUrl || 'http://127.0.0.1:8084'
      }, appConfig);
    }

    // Fallback to current behavior (local MPNet model)
    return this.getInstance('userProfile-default', {
      provider: 'local',
      model: 'sentence-transformers/all-mpnet-base-v2',
      dimensions: 768
    }, appConfig);
  }

  /**
   * Get the underlying embeddings instance
   */
  getEmbeddings(): Embeddings {
    return this.embeddings;
  }

  /**
   * Get configuration
   */
  getConfig(): EmbeddingConfig {
    return this.config;
  }

  /**
   * Get dimensions for this embedding model
   */
  getDimensions(): number {
    if (this.embeddings instanceof HttpEmbeddingsWrapper) {
      return this.embeddings.getDimensions();
    }
    return this.config.dimensions || 1536; // OpenAI default
  }

  /**
   * Test if embeddings are working
   */
  async test(): Promise<boolean> {
    try {
      await this.embeddings.embedQuery("test");
      return true;
    } catch (error) {
      log(LogLevel.ERROR, `EmbeddingService: Test failed for ${this.config.provider}/${this.config.model}`, { error });
      return false;
    }
  }

  /**
   * Check health (only for HTTP embeddings)
   */
  async isHealthy(): Promise<boolean> {
    if (this.embeddings instanceof HttpEmbeddingsWrapper) {
      return this.embeddings.isHealthy();
    }
    // For other providers, assume healthy if test passes
    return this.test();
  }

  /**
   * Clear all cached instances (useful for testing or reconfiguration)
   */
  static clearInstances(): void {
    this.instances.clear();
  }
}
