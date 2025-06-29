import 'dotenv/config'; // Load .env file into process.env
import readline from 'readline';
import { bootstrapLogger, applyLoggerConfig, log, LogLevel } from './logger';
import { loadConfig, getConfig, AppConfig } from './configLoader';
import {
  SchedulerService,
  setCoreServices,
  registerDirectScheduledFunction,
} from './scheduler/schedulerService';
import { initializeAgentExecutorService } from './agentExecutorService';
import { setAgentConfig, agentRespond } from './agent';
import { loadPlugins } from './pluginManager';
import { OpenAIEmbeddings } from "@langchain/openai";
// import { Document } from "@langchain/core/documents";
// import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import path from 'path';
import fs from 'fs';
import { initializeProjectVectorStore } from './projectStoreManager';
import { sendDailyReview } from './plugins/dailyReview';

// Ensure project and user profile directories exist
const projectBasePath = path.join(process.cwd(), 'projects');
const userProfilePath = path.join(process.cwd(), '.user_profile');
if (!fs.existsSync(projectBasePath)) {
  fs.mkdirSync(projectBasePath, { recursive: true });
}
if (!fs.existsSync(userProfilePath)) {
  fs.mkdirSync(userProfilePath, { recursive: true });
}

// Global reference for the main readline interface and its state
let mainRl: readline.Interface | undefined;
let isMainRlPaused = false;
let mainRlLineHandler: ((line: string) => Promise<void>) | undefined;
let mainRlCloseHandler: (() => void) | undefined;
let chatHistory: Array<{ role: string; content: string }> = []; 
let defaultProjectNameGlobal = 'home'; // Restore this for handleMainReplLineInternal

// Define the main REPL line handler as a named function
async function handleMainReplLineInternal(line: string): Promise<void> {
  if (mainReplManager.isPaused()) { 
    log(LogLevel.WARN, "Main REPL line handler called while PAUSED. Input ignored.");
    return; 
  }

  const input = line.trim();
  if (input.toLowerCase() === 'exit') {
    if (mainRl) mainRl.close();
    return; 
  }
  if (input) {
    // Use defaultProjectNameGlobal here
    const response = await agentRespond(input, chatHistory, defaultProjectNameGlobal);
    console.log(`Wooster: ${response}`);
    chatHistory.push({ role: 'user', content: input });
    chatHistory.push({ role: 'assistant', content: response });
    if (chatHistory.length > 20) { 
      chatHistory = chatHistory.slice(-20);
    }
  }

  if (!mainReplManager.isPaused() && mainRl) {
    mainRl.prompt();
  }
}

// Define the main REPL close handler
function handleMainRlCloseInternal(): void {
  log(LogLevel.INFO, 'Exiting Wooster. Goodbye!');
  process.exit(0);
}

function createAndConfigureMainRl(): readline.Interface {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  // Ensure handlers are defined before attaching
  if (!mainRlLineHandler) mainRlLineHandler = handleMainReplLineInternal;
  if (!mainRlCloseHandler) mainRlCloseHandler = handleMainRlCloseInternal;

  rl.on('line', mainRlLineHandler);
  rl.on('close', mainRlCloseHandler);
  return rl;
}

export const mainReplManager = {
  pauseInput: () => {
    if (mainRl && !isMainRlPaused) {
      if (mainRlLineHandler) {
        mainRl.off('line', mainRlLineHandler); 
      }
      if (mainRlCloseHandler) {
        mainRl.off('close', mainRlCloseHandler); // CRITICAL: Detach this to prevent process.exit()
      }
      mainRl.close(); 
      isMainRlPaused = true;
      log(LogLevel.DEBUG, "Main REPL input CLOSED (listeners detached) and PAUSED for interactive tool.");
    } else {
      log(LogLevel.WARN, "Main REPL pauseInput called but mainRl is undefined or already paused.");
    }
  },
  resumeInput: () => {
    if (isMainRlPaused) { // Only resume if it was paused
      mainRl = createAndConfigureMainRl(); // Recreate and reconfigure
      isMainRlPaused = false;
      log(LogLevel.DEBUG, "Main REPL input RECREATED and RESUMED after interactive tool.");
      console.log("Wooster is ready for your next command."); // Friendly message
      mainRl.prompt(); 
    }
  },
  isPaused: () => isMainRlPaused,
};

// REMOVE THE OLD FUNCTION DEFINITION FROM HERE (approx. lines 111-190 in original)
// async function initializeProjectVectorStore(projectName: string, projectPath: string, embeddingsInstance: OpenAIEmbeddings, appConfig: AppConfig): Promise<FaissStore> { ... }

async function schedulerAgentCallback(taskPayload: string): Promise<void> {
  log(LogLevel.INFO, `Scheduler invoking agent with payload:`, { payload: taskPayload });
  const core = getCoreServices(); // Assuming a way to get core services
  if (core.agent) {
    await core.agent.call({ input: taskPayload });
  }
}

async function main() {
  bootstrapLogger();
  loadConfig();
  const appConfig = getConfig();
  applyLoggerConfig(appConfig.logging);
  log(LogLevel.INFO, `Wooster starting up... v${appConfig.version}`);
  log(LogLevel.DEBUG, 'Application Config:', { appConfig });

  // Check for OpenAI API key
  if (!appConfig.openai.apiKey || appConfig.openai.apiKey.startsWith('YOUR_OPENAI_API_KEY')) {
    log(LogLevel.WARN, 'OpenAI API key is not set. AI-related features will be disabled.');
  }

  setAgentConfig(appConfig);
  const embeddings = new OpenAIEmbeddings({ openAIApiKey: appConfig.openai.apiKey });
  
  const defaultProjectName = 'home'; // Local constant for clarity
  const projectDir = path.join(projectBasePath, defaultProjectName);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  const projectVectorStore = await initializeProjectVectorStore(defaultProjectName, projectDir, embeddings, appConfig);
  
  const agent = await initializeAgentExecutorService(embeddings, appConfig);
  log(LogLevel.INFO, "AgentExecutorService initialized.");
  
  setCoreServices({ agent });

  // Register direct functions for scheduling
  registerDirectScheduledFunction('system.dailyReview.sendEmail', sendDailyReview);

  // Seed the daily review task if it doesn't exist
  const dailyReviewJob = await SchedulerService.getByKey('system.dailyReview.sendEmail');
  if (!dailyReviewJob) {
    await SchedulerService.create({
      description: 'Sends the Daily Review email each morning.',
      schedule_expression: '0 7 * * *', // 7:00 AM daily
      payload: JSON.stringify({}), // Payload can be empty or have config
      task_key: 'system.dailyReview.sendEmail',
      task_handler_type: 'DIRECT_FUNCTION',
    });
    log(LogLevel.INFO, 'Seeded Daily Review schedule.');
  }

  await SchedulerService.start();
  log(LogLevel.INFO, "SchedulerService started.");

  await loadPlugins();
  log(LogLevel.INFO, "Plugins loaded.");

  // Initial creation of mainRl
  mainRl = createAndConfigureMainRl();

  console.log("Wooster is ready. Type 'exit' to quit, or enter your command.");
  mainRl.prompt();
  
  // The mainRl.on('close') handler is now set inside createAndConfigureMainRl
  // The mainRl.on('line') handler is also set inside createAndConfigureMainRl
}

main().catch(error => {
  log(LogLevel.ERROR, 'Critical error in main function:', { 
    message: (error instanceof Error ? error.message : String(error)), 
    stack: (error instanceof Error ? error.stack : undefined),
    name: (error instanceof Error ? error.name : undefined),
  });
  if (error instanceof Error && 'cause' in error) {
    log(LogLevel.ERROR, 'Error Cause:', { cause: (error as any).cause });
  }
  console.error('[CRITICAL FALLBACK] Error in main:', error);
  process.exit(1);
});