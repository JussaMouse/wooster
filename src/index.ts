import 'dotenv/config'; // Load .env file into process.env
import readline from 'readline';
import { bootstrapLogger, applyLoggerConfig, log, LogLevel } from './logger';
import { loadConfig, getConfig, AppConfig, DEFAULT_CONFIG } from './configLoader';
import { initSchedulerService, processCatchUpTasks } from './scheduler/schedulerService';
import { initializeAgentExecutorService } from './agentExecutorService';
import { setAgentConfig, agentRespond } from './agent';
import { loadPlugins } from './pluginManager';
import { initDatabase as initSchedulerDB } from './scheduler/reminderRepository';
import { OpenAIEmbeddings } from "@langchain/openai";
// import { Document } from "@langchain/core/documents";
// import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import path from 'path';
import fs from 'fs';
import { initializeProjectVectorStore } from './projectStoreManager';

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
  
  const defaultProjectForScheduledTasks = 'home'; 
  // Pass an empty history or a system message indicating it's a scheduled task.
  const historyForScheduledTask: Array<{ role: string; content: string }> = [
    { role: 'system', content: `This is an automated task.` }
  ];
  
  try {
    // Assuming agentRespond can work without a specific taskKey if it's a scheduled task,
    // or that the taskPayload contains all necessary info.
    const response = await agentRespond(taskPayload, historyForScheduledTask, defaultProjectForScheduledTasks, true);
    log(LogLevel.INFO, `Agent response to scheduled task (payload: ${taskPayload.substring(0,50)}...):`, { response });
  } catch (error: any) {
    log(LogLevel.ERROR, `Error executing scheduled agent task (payload: ${taskPayload.substring(0,50)}...):`, {
      message: error.message,
      stack: error.stack,
    });
    // Decide on retry/failure handling for the task based on the error
  }
}

async function main() {
  bootstrapLogger();
  loadConfig();
  const appConfig = getConfig();
  applyLoggerConfig(appConfig.logging);
  log(LogLevel.INFO, `Wooster starting up... v${appConfig.version}`);
  log(LogLevel.DEBUG, 'Application Config:', { appConfig });

  if (!appConfig.openai.apiKey || appConfig.openai.apiKey === DEFAULT_CONFIG.openai.apiKey) {
    log(LogLevel.ERROR, "OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.");
    process.exit(1); 
  }

  initSchedulerDB();
  log(LogLevel.INFO, "Scheduler database initialized.");
  setAgentConfig(appConfig);
  const embeddings = new OpenAIEmbeddings({ openAIApiKey: appConfig.openai.apiKey });
  
  const defaultProjectName = 'home'; // Local constant for clarity
  const projectDir = path.join(projectBasePath, defaultProjectName);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  const projectVectorStore = await initializeProjectVectorStore(defaultProjectName, projectDir, embeddings, appConfig);
  
  await initializeAgentExecutorService(
    defaultProjectName,      // initialProjectName
    projectDir,              // initialProjectPath
    projectVectorStore,      // initialProjectStore
    embeddings,              // initialEmbeddings
    appConfig                // configForProjectStore
  );
  log(LogLevel.INFO, "AgentExecutorService initialized.");
  await initSchedulerService(schedulerAgentCallback);
  log(LogLevel.INFO, "SchedulerService initialized.");
  await loadPlugins();
  log(LogLevel.INFO, "Plugins loaded.");
  await processCatchUpTasks();
  log(LogLevel.INFO, "Catch-up tasks processed.");

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