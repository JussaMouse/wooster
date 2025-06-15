import http from 'http';
import { WoosterPlugin, AppConfig, CoreServices, LogLevel } from '../../types/plugin';
import { startServer } from './server/app';

export class FrontendPlugin implements WoosterPlugin {
  static readonly pluginName = 'frontend';
  static readonly version = '0.1.0';
  static readonly description = 'Manages and serves the Wooster web UI.';

  readonly name = FrontendPlugin.pluginName;
  readonly version = FrontendPlugin.version;
  readonly description = FrontendPlugin.description;

  private server: http.Server | null = null;
  private services!: CoreServices;

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.services = services;
    const pluginConfig = config.plugins.frontend;

    if (!pluginConfig?.enabled) {
      this.services.log(LogLevel.INFO, 'Frontend plugin is disabled.');
      return;
    }

    try {
      this.server = await startServer(config, services);
      this.services.log(LogLevel.INFO, `Frontend plugin initialized and server started on port ${pluginConfig.port || 3000}.`);
    } catch (error) {
      this.services.log(LogLevel.ERROR, `Failed to start frontend server: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.services.log(LogLevel.INFO, 'Shutting down frontend server...');
        this.server.close((err) => {
          if (err) {
            this.services.log(LogLevel.ERROR, `Error shutting down frontend server: ${err.message}`);
            return reject(err);
          }
          this.services.log(LogLevel.INFO, 'Frontend server shut down successfully.');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export default FrontendPlugin; 