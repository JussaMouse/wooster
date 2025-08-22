import axios from 'axios';

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
  }

  /**
   * Health check: returns true if the local model server is up
   */
  async isHealthy(): Promise<boolean> {
    try {
      // MLX OpenAI-compatible servers reliably expose /v1/models
      const res = await axios.get(`${this.serverUrl}/v1/models`, { timeout: this.timeout });
      return res.status === 200 && Array.isArray(res.data?.data);
    } catch (err) {
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