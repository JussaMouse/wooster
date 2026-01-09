import axios, { AxiosInstance } from 'axios';
import { log, LogLevel } from '../logger';

export interface HttpEmbeddingsConfig {
  baseUrl: string;
  model?: string;
  dimensions?: number;
  timeout?: number;
  batchSize?: number;
  retries?: number;
}

export interface EmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * HttpEmbeddings - Client for local embedding server (mlx-box)
 * 
 * Connects to OpenAI-compatible embedding API at local server.
 * Supports batching for efficient embedding of multiple documents.
 * 
 * mlx-box endpoint: http://127.0.0.1:8084/v1/embeddings
 */
export class HttpEmbeddings {
  private client: AxiosInstance;
  private model: string;
  private dimensions: number;
  private batchSize: number;
  private retries: number;

  constructor(config: HttpEmbeddingsConfig) {
    const baseURL = config.baseUrl.endsWith('/v1') 
      ? config.baseUrl 
      : `${config.baseUrl.replace(/\/$/, '')}/v1`;
    
    this.client = axios.create({
      baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    this.model = config.model || 'Qwen/Qwen3-Embedding-8B';
    this.dimensions = config.dimensions || 4096;
    this.batchSize = config.batchSize || 64;
    this.retries = config.retries || 2;

    log(LogLevel.DEBUG, `HttpEmbeddings: Initialized with ${baseURL}, model=${this.model}, dims=${this.dimensions}`);
  }

  /**
   * Embed multiple documents with automatic batching
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const allEmbeddings: number[][] = [];
    
    // Process in batches for efficiency
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const embeddings = await this.embedBatch(batch);
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  /**
   * Embed a single query text
   */
  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  /**
   * Embed a batch of texts with retry logic
   */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.client.post<EmbeddingResponse>('/embeddings', {
          input: texts,
          model: this.model,
          dimensions: this.dimensions
        });

        // Sort by index to maintain order
        const sorted = response.data.data.sort((a, b) => a.index - b.index);
        return sorted.map(d => d.embedding);
      } catch (error: unknown) {
        lastError = error as Error;
        const axiosError = error as { response?: { status?: number } };
        
        if (attempt < this.retries) {
          const delay = Math.pow(2, attempt) * 100; // Exponential backoff
          log(LogLevel.WARN, `HttpEmbeddings: Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
            error: lastError.message
          });
          await this.sleep(delay);
        } else {
          log(LogLevel.ERROR, `HttpEmbeddings: All ${this.retries + 1} attempts failed`, {
            error: lastError.message,
            status: axiosError.response?.status
          });
        }
      }
    }

    throw lastError || new Error('HttpEmbeddings: Unknown error');
  }

  /**
   * Check if the embedding server is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Try the health endpoint first
      try {
        const response = await this.client.get('/health', { timeout: 2000 });
        return response.status === 200;
      } catch {
        // Fall back to checking models endpoint
        const response = await this.client.get('/models', { timeout: 2000 });
        return response.status === 200;
      }
    } catch (error) {
      log(LogLevel.DEBUG, `HttpEmbeddings: Health check failed`, { error });
      return false;
    }
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Get the model name
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create HttpEmbeddings from config
 */
export function createHttpEmbeddings(
  serverUrl: string,
  model?: string,
  dimensions?: number
): HttpEmbeddings {
  return new HttpEmbeddings({
    baseUrl: serverUrl,
    model,
    dimensions
  });
}
