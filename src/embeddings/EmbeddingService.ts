import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AppConfig } from '../configLoader';
import { log, LogLevel } from '../logger';

export type EmbeddingProvider = 'openai' | 'local' | 'server';

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  dimensions?: number;
}

export class EmbeddingService {
  private static instances = new Map<string, EmbeddingService>();
  private embeddings: HuggingFaceTransformersEmbeddings | OpenAIEmbeddings;
  private config: EmbeddingConfig;

  private constructor(config: EmbeddingConfig, appConfig: AppConfig) {
    this.config = config;

    if (config.provider === 'openai') {
      this.embeddings = new OpenAIEmbeddings({
        modelName: config.model,
        openAIApiKey: appConfig.openai.apiKey,
      });
    } else if (config.provider === 'server') {
      // OpenAI-compatible local server (e.g., MLX embed server)
      this.embeddings = new OpenAIEmbeddings({
        modelName: config.model,
        openAIApiKey: appConfig.openai.apiKey || 'local-key',
        configuration: {
          baseURL: appConfig.routing?.providers?.local?.embeddings?.serverUrl,
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
   * Get embedding service for projects
   */
  static getProjectEmbeddings(appConfig: AppConfig): EmbeddingService {
    const localConfig = appConfig.routing?.providers?.local?.embeddings;
    
    if (localConfig?.enabled && localConfig.projects?.enabled) {
      return this.getInstance('projects', {
        provider: 'server',
        model: localConfig.projects.model,
        dimensions: localConfig.projects.dimensions
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
    
    if (localConfig?.enabled && localConfig.userProfile?.enabled) {
      return this.getInstance('userProfile', {
        provider: 'server',
        model: localConfig.userProfile.model,
        dimensions: localConfig.userProfile.dimensions
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
  getEmbeddings(): HuggingFaceTransformersEmbeddings | OpenAIEmbeddings {
    return this.embeddings;
  }

  /**
   * Get configuration
   */
  getConfig(): EmbeddingConfig {
    return this.config;
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
} 