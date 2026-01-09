import axios from 'axios';
import { log, LogLevel } from '../logger';

export interface LocalModelClientOptions {
  serverUrl: string;
  model: string;
  timeout?: number;
}

export class LocalModelClient {
  private serverUrl: string;
  private model: string;
  private timeout: number;

  constructor(options: LocalModelClientOptions) {
    this.serverUrl = options.serverUrl;
    this.model = options.model;
    this.timeout = options.timeout || 10000;
    log(LogLevel.DEBUG, `LocalModelClient: initialized with serverUrl=${this.serverUrl}, model=${this.model}, timeout=${this.timeout}`);
  }

  /**
   * Health check: returns true if the local model server is up
   */
  async isHealthy(): Promise<boolean> {
    const url = `${this.serverUrl}/v1/models`;
    const startTime = Date.now();
    log(LogLevel.DEBUG, `LocalModelClient: checking health at ${url} (timeout=${this.timeout}ms)`);
    try {
      // MLX OpenAI-compatible servers reliably expose /v1/models
      const res = await axios.get(url, { timeout: this.timeout });
      const elapsed = Date.now() - startTime;
      const healthy = res.status === 200 && Array.isArray(res.data?.data);
      log(LogLevel.DEBUG, `LocalModelClient: health check result: ${healthy} (status=${res.status}, took ${elapsed}ms)`);
      return healthy;
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      log(LogLevel.DEBUG, `LocalModelClient: health check failed after ${elapsed}ms: ${err.message}`);
      return false;
    }
  }

  /**
   * Run inference on the local model
   */
  async generate(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> {
    const payload = {
      model: this.model,
      prompt,
      max_tokens: options?.maxTokens || 512,
      temperature: options?.temperature || 0.7
    };
    const res = await axios.post(`${this.serverUrl}/v1/completions`, payload, { timeout: this.timeout });
    if (res.status === 200 && res.data?.choices?.[0]?.text) {
      return res.data.choices[0].text;
    }
    throw new Error('Local model inference failed');
  }
} 