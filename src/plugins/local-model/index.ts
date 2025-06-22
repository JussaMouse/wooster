import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { DynamicTool } from '@langchain/core/tools';
import { AppConfig } from '../../configLoader';
import { log, LogLevel } from '../../logger';
import { LocalModelClient } from '../../routing/LocalModelClient';
import { EmbeddingService } from '../../embeddings/EmbeddingService';

export default class LocalModelPlugin implements WoosterPlugin {
  name = 'local-model';
  version = '1.0.0';
  description = 'Local model integration for chat and embeddings';

  private config: AppConfig;
  private localModelClient: LocalModelClient | null = null;
  private isInitialized = false;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    log(LogLevel.INFO, `LocalModelPlugin (v${this.version}): Initializing...`);

    const routingConfig = config.routing?.providers?.local;
    if (!routingConfig?.enabled) {
      log(LogLevel.INFO, 'LocalModelPlugin: Local model routing is disabled via configuration');
      return;
    }

    // Initialize local model client for chat
    if (routingConfig.enabled) {
      const defaultModel = routingConfig.models?.fast || 'mlx-community/Mistral-7B-Instruct-v0.3-4bit';
      this.localModelClient = new LocalModelClient({
        serverUrl: routingConfig.serverUrl,
        model: defaultModel,
        timeout: 10000
      });

      // Health check the chat server
      const isHealthy = await this.localModelClient.isHealthy();
      if (isHealthy) {
        log(LogLevel.INFO, 'LocalModelPlugin: Local chat model server is healthy');
      } else {
        log(LogLevel.WARN, 'LocalModelPlugin: Local chat model server is not available');
      }
    }

    // Test embedding services if enabled
    const embeddingConfig = routingConfig.embeddings;
    if (embeddingConfig?.enabled) {
      await this.testEmbeddingServices();
    }

    this.isInitialized = true;
    log(LogLevel.INFO, 'LocalModelPlugin: Initialization complete');
  }

  private async testEmbeddingServices(): Promise<void> {
    log(LogLevel.INFO, 'LocalModelPlugin: Testing local embedding services');
    
    try {
      // Test project embeddings
      const projectEmbeddings = EmbeddingService.getProjectEmbeddings(this.config);
      const projectWorking = await projectEmbeddings.test();
      log(LogLevel.INFO, `LocalModelPlugin: Project embeddings test: ${projectWorking ? 'PASS' : 'FAIL'}`);

      // Test user profile embeddings
      const userProfileEmbeddings = EmbeddingService.getUserProfileEmbeddings(this.config);
      const userProfileWorking = await userProfileEmbeddings.test();
      log(LogLevel.INFO, `LocalModelPlugin: User profile embeddings test: ${userProfileWorking ? 'PASS' : 'FAIL'}`);

    } catch (error) {
      log(LogLevel.ERROR, 'LocalModelPlugin: Error testing embedding services', { error });
    }
  }

  getAgentTools(): DynamicTool[] {
    const tools: DynamicTool[] = [];

    if (!this.isInitialized) {
      return tools;
    }

    // Add basic local model management tools
    tools.push(
      this.createModelHealthCheckTool(),
      this.createModelStatusTool(),
      this.createEmbeddingStatusTool(),
      this.createEmbeddingTestTool()
    );

    return tools;
  }

  private createModelHealthCheckTool(): DynamicTool {
    return new DynamicTool({
      name: "check_local_model_health",
      description: "Check if local chat model server is running and healthy",
      func: async () => {
        if (!this.localModelClient) {
          return "Local model client not initialized - local models are disabled";
        }

        try {
          const isHealthy = await this.localModelClient.isHealthy();
          if (isHealthy) {
            return "✅ Local chat model server is healthy and responding";
          } else {
            return "❌ Local chat model server is not responding. Check if the MLX server is running on the configured port.";
          }
        } catch (error) {
          return `❌ Error checking local model health: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    });
  }

  private createModelStatusTool(): DynamicTool {
    return new DynamicTool({
      name: "local_model_status",
      description: "Get detailed status of local model configuration and availability",
      func: async () => {
        const routingConfig = this.config.routing?.providers?.local;
        if (!routingConfig?.enabled) {
          return "Local models are disabled in configuration. Set routing.providers.local.enabled=true to enable.";
        }

        const status = {
          enabled: routingConfig.enabled,
          serverUrl: routingConfig.serverUrl,
          configuredModels: routingConfig.models || {},
          embeddingsEnabled: routingConfig.embeddings?.enabled || false
        };

        let healthStatus = "Unknown";
        if (this.localModelClient) {
          try {
            const isHealthy = await this.localModelClient.isHealthy();
            healthStatus = isHealthy ? "Healthy" : "Unavailable";
          } catch (error) {
            healthStatus = `Error: ${error instanceof Error ? error.message : String(error)}`;
          }
        }

        return `Local Model Status:
📊 Configuration: ${JSON.stringify(status, null, 2)}
🏥 Health: ${healthStatus}
🔧 Initialization: ${this.isInitialized ? 'Complete' : 'Pending'}`;
      }
    });
  }

  private createEmbeddingStatusTool(): DynamicTool {
    return new DynamicTool({
      name: "embedding_status",
      description: "Get status of local embedding configuration and models",
      func: async () => {
        const embeddingConfig = this.config.routing?.providers?.local?.embeddings;
        
        if (!embeddingConfig?.enabled) {
          return "Local embeddings are disabled in configuration.";
        }

        const results: string[] = [];
        
        // Get project embeddings info
        try {
          const projectEmbeddings = EmbeddingService.getProjectEmbeddings(this.config);
          const projectConfig = projectEmbeddings.getConfig();
          results.push(`📊 Projects: ${projectConfig.provider}/${projectConfig.model} (${projectConfig.dimensions || 'auto'} dims)`);
        } catch (error) {
          results.push(`📊 Projects: Error - ${error instanceof Error ? error.message : String(error)}`);
        }

        // Get user profile embeddings info
        try {
          const userProfileEmbeddings = EmbeddingService.getUserProfileEmbeddings(this.config);
          const userProfileConfig = userProfileEmbeddings.getConfig();
          results.push(`👤 User Profile: ${userProfileConfig.provider}/${userProfileConfig.model} (${userProfileConfig.dimensions || 'auto'} dims)`);
        } catch (error) {
          results.push(`👤 User Profile: Error - ${error instanceof Error ? error.message : String(error)}`);
        }

        return `Embedding Status:\n${results.join('\n')}`;
      }
    });
  }

  private createEmbeddingTestTool(): DynamicTool {
    return new DynamicTool({
      name: "test_embeddings",
      description: "Test if embedding models are working correctly",
      func: async () => {
        const results: string[] = [];

        // Test project embeddings
        try {
          const projectEmbeddings = EmbeddingService.getProjectEmbeddings(this.config);
          const projectWorking = await projectEmbeddings.test();
          results.push(`📊 Projects: ${projectWorking ? '✅ Working' : '❌ Failed'}`);
        } catch (error) {
          results.push(`📊 Projects: ❌ Error - ${error instanceof Error ? error.message : String(error)}`);
        }

        // Test user profile embeddings
        try {
          const userProfileEmbeddings = EmbeddingService.getUserProfileEmbeddings(this.config);
          const userProfileWorking = await userProfileEmbeddings.test();
          results.push(`👤 User Profile: ${userProfileWorking ? '✅ Working' : '❌ Failed'}`);
        } catch (error) {
          results.push(`👤 User Profile: ❌ Error - ${error instanceof Error ? error.message : String(error)}`);
        }

        return `Embedding Test Results:\n${results.join('\n')}`;
      }
    });
  }
} 