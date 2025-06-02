import { WoosterPlugin, CoreServices, AppConfig } from '../../types/plugin';
import { LogLevel } from '../../logger';
import express, { Express, Request, Response, NextFunction } from 'express';
import http from 'http';
import { TaskCaptureService, Task } from '../taskCapture/types';

let core: CoreServices;
let apiConfig: AppConfig['apiPlugin'];
let httpServer: http.Server | null = null;

const API_BASE_PATH = '/api/v1';

class ApiPluginDefinition implements WoosterPlugin {
  readonly name = "api";
  readonly version = "1.0.0";
  readonly description = "Provides a unified HTTP API for Wooster services.";

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    core.log(LogLevel.INFO, `ApiPlugin (v${this.version}): Initializing...`);

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
        // If whitelist is enabled and IP is not in it, *and* there's no API key to fall back to, deny.
        // Or, if we decide whitelisting is an OR condition with API Key, we might not return here yet.
        // For now, if IP not whitelisted, proceed to API key check. Stricter logic could deny here.
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
      
      // If neither IP whitelist nor API key granted access (and an API key is configured)
      if (apiConfig?.apiKey || (apiConfig?.globalIpWhitelistEnabled && (apiConfig.globalAllowedIps || []).length > 0) ) { // Only error if auth methods are configured
        core.log(LogLevel.WARN, `ApiPlugin: Unauthorized access attempt to ${req.path}. Client IP: ${req.ip || 'unknown_ip'}`);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // If no auth methods are configured at all, but endpoint is protected (i.e. starts with API_BASE_PATH)
      // This state should have produced a warning at startup. For safety, deny access.
      core.log(LogLevel.WARN, `ApiPlugin: Access to ${req.path} denied. No authentication methods are effectively configured, but endpoint requires auth.`);
      res.status(403).json({ error: 'Forbidden: API access not configured.' });
    });

    // Define the handler function INSIDE initialize, where core and apiConfig are in scope
    const handleTaskCapture = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { description } = req.body;
        if (typeof description !== 'string' || description.trim() === '') {
          res.status(400).json({ error: 'Task description is required and must be a non-empty string.' });
          return;
        }

        const taskCaptureService = core.getService("TaskCaptureService") as TaskCaptureService | undefined;
        if (!taskCaptureService) {
          core.log(LogLevel.ERROR, "ApiPlugin: TaskCaptureService not found!");
          res.status(503).json({ error: 'Task capture feature is currently unavailable.' });
          return;
        }

        const newTask = taskCaptureService.captureTask(description);

        if (newTask) {
          res.status(201).json({
            message: "Task captured successfully.",
            taskId: newTask.id,
            description: newTask.description
          });
          return;
        } else {
          core.log(LogLevel.WARN, `ApiPlugin: taskCaptureService.captureTask returned null for description: "${description}"`);
          res.status(400).json({ error: 'Failed to capture task. Invalid description or system error.' });
          return;
        }
      } catch (error: any) {
        core.log(LogLevel.ERROR, `ApiPlugin: Error in POST ${API_BASE_PATH}/tasks: ${error.message}`, { error });
        next(error);
      }
    };

    // --- Routes (to be added here) ---
    // Task Capture Endpoint
    app.post(`${API_BASE_PATH}/tasks`, handleTaskCapture);

    // Example: app.post(`${API_BASE_PATH}/health/workouts`, handleWorkoutLog);

    // --- Centralized Error Handler ---
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      core.log(LogLevel.ERROR, `ApiPlugin: Unhandled error in API request: ${err.message}`, { path: req.path, error: err });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    // --- Start Server ---
    const port = apiConfig.port || 3000;
    httpServer = app.listen(port, () => {
      core.log(LogLevel.INFO, `ApiPlugin: Unified API server listening on http://localhost:${port}`);
      core.log(LogLevel.INFO, `ApiPlugin: Task endpoint (example): POST http://localhost:${port}${API_BASE_PATH}/tasks`);
      core.log(LogLevel.INFO, `ApiPlugin: Health workout endpoint (example): POST http://localhost:${port}${API_BASE_PATH}/health/workouts`);
    }).on('error', (err: Error & { code?: string }) => {
      if (err.code === 'EADDRINUSE') {
        core.log(LogLevel.ERROR, `ApiPlugin: API Port ${port} is already in use. API server will not start.`);
        httpServer = null;
      } else {
        core.log(LogLevel.ERROR, `ApiPlugin: Failed to start API server on port ${port}.`, { error: err });
      }
    });

    // Register the Express app instance if other plugins might want to add routes (advanced use case)
    // services.registerService("SharedExpressApp", app);
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

  // This plugin does not provide agent tools itself; it provides an API gateway.
}

export default new ApiPluginDefinition(); 