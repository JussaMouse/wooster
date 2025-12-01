import 'dotenv/config'; // Load .env file into process.env
import readline from 'readline';
import path from 'path';
import fs from 'fs';

import { bootstrapLogger, applyLoggerConfig, log, LogLevel } from './logger';
import { loadConfig, getConfig,setConfig } from './configLoader';
import { SchedulerService } from './scheduler/schedulerService';
import { initializeAgentExecutorService, getAgentExecutor, setActiveProject, getActiveProjectPath, getCurrentActiveProjectName } from './agentExecutorService';
import { setAgentConfig, agentRespond } from './agent';
import { loadPlugins, getRegisteredService, registerService } from './pluginManager';
import { OpenAIEmbeddings } from "@langchain/openai";
import { EmbeddingService } from './embeddings/EmbeddingService';
import { initializeProjectVectorStore } from './projectStoreManager';

import { IngestionService } from './services/ingestion/IngestionService';

// --- Directory Setup ---
const projectBasePath = path.join(process.cwd(), 'projects');
const userProfilePath = path.join(process.cwd(), '.user_profile');
if (!fs.existsSync(projectBasePath)) {
  fs.mkdirSync(projectBasePath, { recursive: true });
}
if (!fs.existsSync(userProfilePath)) {
  fs.mkdirSync(userProfilePath, { recursive: true });
}

// --- REPL Management ---
let mainRl: readline.Interface | undefined;
let isMainRlPaused = false;
let mainRlLineHandler: ((line: string) => Promise<void>) | undefined;
let mainRlCloseHandler: (() => void) | undefined;
let chatHistory: Array<{ role: string; content: string }> = []; 
let defaultProjectNameGlobal = 'home'; 

async function handleMainReplLineInternal(line: string): Promise<void> {
  if (mainReplManager.isPaused()) { 
    log(LogLevel.WARN, "Main REPL line handler called while PAUSED. Input ignored.");
    return; 
  }

  const input = line.trim();
  const lowerInput = input.toLowerCase();

  if (lowerInput === 'exit') {
    if (mainRl) mainRl.close();
    return;
  }

  // Classic/Code mode switching removed; single Code-Agent path is always active.

  if (input) {
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

  if (!mainRlLineHandler) mainRlLineHandler = handleMainReplLineInternal;
  if (!mainRlCloseHandler) mainRlCloseHandler = handleMainRlCloseInternal;

  rl.on('line', async (line: string) => {
    const trimmed = line.trim().toLowerCase();
    if (trimmed === 'rebuild embeddings') {
      try {
        const appConfig = getConfig();
        const projectName = defaultProjectNameGlobal;
        const projectEmb = EmbeddingService.getProjectEmbeddings(appConfig);
        const embeddings = projectEmb.getEmbeddings() as OpenAIEmbeddings;
        const projectDir = path.join(projectBasePath, projectName);
        if (!fs.existsSync(projectDir)) { fs.mkdirSync(projectDir, { recursive: true }); }
        const store = await initializeProjectVectorStore(projectName, embeddings, appConfig);
        await initializeAgentExecutorService(projectName, projectDir, store, embeddings, appConfig);
        console.log(`Rebuilt embeddings for project '${projectName}'.`);
      } catch (e: any) {
        console.error('Failed to rebuild embeddings:', e?.message || String(e));
      }
      if (!mainReplManager.isPaused()) rl.prompt();
      return;
    }
    await (mainRlLineHandler as any)(line);
  });
  rl.on('close', mainRlCloseHandler);
  return rl;
}

export const mainReplManager = {
  pauseInput: () => {
    if (mainRl && !isMainRlPaused) {
      if (mainRlLineHandler) mainRl.off('line', mainRlLineHandler); 
      if (mainRlCloseHandler) mainRl.off('close', mainRlCloseHandler);
      mainRl.close(); 
      isMainRlPaused = true;
      log(LogLevel.DEBUG, "Main REPL input CLOSED and PAUSED.");
    }
  },
  resumeInput: () => {
    if (isMainRlPaused) {
      mainRl = createAndConfigureMainRl();
      isMainRlPaused = false;
      log(LogLevel.DEBUG, "Main REPL input RECREATED and RESUMED.");
      console.log("Wooster is ready for your next command.");
      mainRl.prompt(); 
    }
  },
  isPaused: () => isMainRlPaused,
};

// --- Main Application ---
async function main() {
  bootstrapLogger();
  loadConfig();
  const appConfig = getConfig();
  applyLoggerConfig(appConfig.logging);
  log(LogLevel.INFO, `Wooster starting up... v${appConfig.version}`);
  log(LogLevel.DEBUG, 'Application Config:', { appConfig });

  if (!appConfig.openai.apiKey || appConfig.openai.apiKey.startsWith('YOUR_OPENAI_API_KEY')) {
    log(LogLevel.WARN, 'OpenAI API key is not set. AI-related features will be disabled.');
  }

  setAgentConfig(appConfig);
  const projectEmb = EmbeddingService.getProjectEmbeddings(appConfig);
  const embeddings = projectEmb.getEmbeddings() as OpenAIEmbeddings;
  const embConfig = projectEmb.getConfig();
  log(LogLevel.INFO, `Embeddings: Initialized ${embConfig.provider} embeddings with model '${embConfig.model}'`);
  
  // --- Concise Startup Summary ---
  let chatModel = appConfig.openai.modelName;
  const openaiEnabled = appConfig.routing?.providers?.openai?.enabled !== false;
  const localEnabled = appConfig.routing?.providers?.local?.enabled;
  
  if (!openaiEnabled && localEnabled) {
      chatModel = appConfig.routing?.providers?.local?.models?.fast || 'Local Model';
  }

  const embModel = embConfig.model;
  const embProvider = embConfig.provider;
  console.log(`\n--------------------------------------------------`);
  console.log(`  Chat Model:      ${chatModel} ${!openaiEnabled ? '(Local)' : '(OpenAI)'}`);
  console.log(`  Embedding Model: ${embModel} (${embProvider})`);
  console.log(`--------------------------------------------------\n`);

  const defaultProjectName = 'home';
  const projectDir = path.join(projectBasePath, defaultProjectName);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  const projectVectorStore = await initializeProjectVectorStore(defaultProjectName, embeddings, appConfig);
  // If the initialize step recreated due to mismatch, a warning was logged. Offer guidance once at startup.
  // (Interactive migration tooling can be added later.)
  
  await initializeAgentExecutorService(defaultProjectName, projectDir, projectVectorStore, embeddings, appConfig);
  log(LogLevel.INFO, "AgentExecutorService initialized.");
  
  // Inject agent and core services into SchedulerService so it can execute agent tasks
  const agentExecutor = await getAgentExecutor();
  SchedulerService.setCoreServices({
      agent: agentExecutor,
      getConfig: getConfig,
      log: log,
      registerService: registerService,
      getService: getRegisteredService,
      setActiveProject: setActiveProject,
      getActiveProjectPath: getActiveProjectPath,
      getActiveProjectName: getCurrentActiveProjectName,
      // We don't expose getProjectVectorStore to scheduler yet as it's rarely needed there
  });
  
  await loadPlugins();
  log(LogLevel.INFO, "Plugins loaded.");
  
  await SchedulerService.start();
  log(LogLevel.INFO, "SchedulerService started.");

  await IngestionService.getInstance().start();
  log(LogLevel.INFO, "IngestionService started.");

  mainRl = createAndConfigureMainRl();

  console.log("Wooster is ready. Type 'exit' to quit, or enter your command.");
  console.log("Tip: If you changed EMBEDDINGS model, run 'rebuild embeddings' to re-index the current project.");
  mainRl.prompt();
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