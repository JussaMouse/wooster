import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import express, { Express, Request, Response, NextFunction } from 'express';
import http from 'http';
import { CaptureService, CapturedItem } from '../capture/types';
import type { PersonalHealthService } from '../personalHealth/types';

let core: CoreServices;
let apiConfig: AppConfig['apiPlugin'];
let httpServer: http.Server | null = null;

const API_BASE_PATH = '/api/v1';

class ApiPluginDefinition implements WoosterPlugin {
  static readonly pluginName = "api";
  static readonly version = "1.0.0";
  static readonly description = "Provides a unified HTTP API for Wooster services.";

  readonly name = ApiPluginDefinition.pluginName;
  readonly version = ApiPluginDefinition.version;
  readonly description = ApiPluginDefinition.description;

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    core.log(LogLevel.INFO, `ApiPlugin (v${ApiPluginDefinition.version}): Initializing...`);

    if (!config.apiPlugin) {
      core.log(LogLevel.WARN, "ApiPlugin: Configuration (apiPlugin) is missing. API will not start.");
      return;
    }
    apiConfig = config.apiPlugin;

    if (!apiConfig.enabled) {
      core.log(LogLevel.INFO, "ApiPlugin: API is disabled via configuration (PLUGIN_API_ENABLED=false).");
      return;
    }

    if (!apiConfig.apiKey && !apiConfig.globalIpWhitelistEnabled) {
        core.log(LogLevel.WARN, "ApiPlugin: API is enabled but NO API KEY is set (PLUGIN_API_KEY) and IP Whitelisting is disabled. Most endpoints will be inaccessible or insecure.");
    } else if (!apiConfig.apiKey && apiConfig.globalIpWhitelistEnabled && apiConfig.globalAllowedIps.length === 0) {
        core.log(LogLevel.WARN, "ApiPlugin: API is enabled with IP Whitelisting, but no IPs are whitelisted (PLUGIN_API_GLOBAL_ALLOWED_IPS) and no API Key is set. Endpoints may be inaccessible.");
    }

    const app: Express = express();
    app.set('trust proxy', true); // Important for IP whitelisting if behind a reverse proxy

    // --- Global Middleware ---
    app.use(express.json()); // Parse JSON request bodies

    // Logger for all requests to the API plugin
    app.use((req: Request, res: Response, next: NextFunction) => {
      core.log(LogLevel.DEBUG, `ApiPlugin: Received request: ${req.method} ${req.originalUrl}`, { ip: req.ip });
      res.on('finish', () => {
        core.log(LogLevel.DEBUG, `ApiPlugin: Responded to ${req.method} ${req.originalUrl} with status ${res.statusCode}`, { ip: req.ip });
      });
      next();
    });
    
    // --- Authentication Middleware (Conceptual - to be refined) ---
    app.use((req: Request, res: Response, next: NextFunction) => {
      // Skip auth for potential future public/status endpoints if they don't start with API_BASE_PATH
      if (!req.path.startsWith(API_BASE_PATH)) {
        return next();
      }
      
      // IP Whitelisting Check
      if (apiConfig?.globalIpWhitelistEnabled) {
        const clientIp = req.ip || 'unknown_ip';
        const allowedIps = apiConfig.globalAllowedIps || [];
        if (allowedIps.includes(clientIp)) {
          core.log(LogLevel.DEBUG, `ApiPlugin: IP ${clientIp} whitelisted, granting access to ${req.path}.`);
          return next(); // IP whitelisted, bypass API key check for this request
        }
      }

      // API Key Check (Bearer Token)
      if (apiConfig?.apiKey) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          if (token === apiConfig.apiKey) {
            core.log(LogLevel.DEBUG, `ApiPlugin: Valid API key received, granting access to ${req.path}.`);
            return next(); // API key is valid
          }
        }
      }
      
      if (apiConfig?.apiKey || (apiConfig?.globalIpWhitelistEnabled && (apiConfig.globalAllowedIps || []).length > 0) ) { 
        core.log(LogLevel.WARN, `ApiPlugin: Unauthorized access attempt to ${req.path}. Client IP: ${req.ip || 'unknown_ip'}`);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      core.log(LogLevel.WARN, `ApiPlugin: Access to ${req.path} denied. No authentication methods are effectively configured, but endpoint requires auth.`);
      res.status(403).json({ error: 'Forbidden: API access not configured.' });
    });

    const handleCaptureRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { text } = req.body;
        if (typeof text !== 'string' || text.trim() === '') {
          res.status(400).json({ error: 'Item text is required and must be a non-empty string.' });
          return;
        }

        const captureService = core.getService("CaptureService") as CaptureService | undefined;
        if (!captureService) {
          core.log(LogLevel.ERROR, "ApiPlugin: CaptureService not found!");
          res.status(503).json({ error: 'Capture feature is currently unavailable.' });
          return;
        }

        const newItem = captureService.captureItem(text);

        if (newItem) {
          res.status(201).json({
            message: "Item captured successfully.",
            itemId: newItem.id,
            capturedText: newItem.text
          });
          return;
        } else {
          core.log(LogLevel.WARN, `ApiPlugin: captureService.captureItem returned null for text: "${text}"`);
          res.status(400).json({ error: 'Failed to capture item. Invalid text or system error.' });
          return;
        }
      } catch (error: any) {
        core.log(LogLevel.ERROR, `ApiPlugin: Error in POST ${API_BASE_PATH}/capture: ${error.message}`, { error });
        next(error);
      }
    };

    app.post(`${API_BASE_PATH}/capture`, handleCaptureRequest);

    const handleLogHealthEventRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { text } = req.body;
        if (typeof text !== 'string' || text.trim() === '') {
          res.status(400).json({ error: 'Health event text is required and must be a non-empty string.' });
          return;
        }

        const healthService = core.getService("PersonalHealthService") as PersonalHealthService | undefined;
        if (!healthService) {
          core.log(LogLevel.ERROR, "ApiPlugin: PersonalHealthService not found!");
          res.status(503).json({ error: 'Health logging feature is currently unavailable.' });
          return;
        }

        await healthService.logHealthEvent(text);

        res.status(201).json({
          message: "Health event logged successfully.",
          eventText: text
        });

      } catch (error: any) {
        core.log(LogLevel.ERROR, `ApiPlugin: Error in POST ${API_BASE_PATH}/health/events: ${error.message}`, { error });
        next(error); 
      }
    };

    app.post(`${API_BASE_PATH}/health/events`, handleLogHealthEventRequest);

    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      core.log(LogLevel.ERROR, `ApiPlugin: Unhandled error in API request: ${err.message}`, { path: req.path, error: err });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    const port = apiConfig.port || 3000;
    httpServer = app.listen(port, () => {
      core.log(LogLevel.INFO, `ApiPlugin: Unified API server listening on http://localhost:${port}`);
      core.log(LogLevel.INFO, `ApiPlugin: Item capture endpoint: POST http://localhost:${port}${API_BASE_PATH}/capture`);
      core.log(LogLevel.INFO, `ApiPlugin: Health event logging endpoint: POST http://localhost:${port}${API_BASE_PATH}/health/events`);
    }).on('error', (err: Error & { code?: string }) => {
      if (err.code === 'EADDRINUSE') {
        core.log(LogLevel.ERROR, `ApiPlugin: API Port ${port} is already in use. API server will not start.`);
        httpServer = null;
      } else {
        core.log(LogLevel.ERROR, `ApiPlugin: Failed to start API server on port ${port}.`, { error: err });
      }
    });
  }

  async shutdown(): Promise<void> {
    if (httpServer) {
      core.log(LogLevel.INFO, "ApiPlugin: Shutting down API server...");
      return new Promise((resolve, reject) => {
        httpServer?.close((err) => {
          if (err) {
            core.log(LogLevel.ERROR, "ApiPlugin: Error shutting down API server", { error: err });
            reject(err);
            return;
          }
          core.log(LogLevel.INFO, "ApiPlugin: API server shut down successfully.");
          httpServer = null;
          resolve();
        });
      });
    }
    return Promise.resolve();
  }
}

export default ApiPluginDefinition; 