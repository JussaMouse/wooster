import 'dotenv/config'; // Load .env file into process.env
import readline from 'readline';
import { bootstrapLogger, applyLoggerConfig, log, LogLevel } from './logger';
import { loadConfig, getConfig, AppConfig, DEFAULT_CONFIG } from './configLoader';
import { initSchedulerService, processCatchUpTasks } from './scheduler/schedulerService';
import { initializeAgentExecutorService } from './agentExecutorService';
import { setAgentConfig, agentRespond } from './agent';
import { loadPlugins } from './pluginManager';
import { initDatabase as initSchedulerDB } from './scheduler/reminderRepository';
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import path from 'path';
import fs from 'fs';

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

// Manager for controlling the main REPL's input
export const mainReplManager = {
  pauseInput: () => {
    if (mainRl && !isMainRlPaused && mainRlLineHandler) {
      mainRl.pause();
      mainRl.off('line', mainRlLineHandler); // Detach the handler
      isMainRlPaused = true;
      log(LogLevel.DEBUG, "Main REPL input PAUSED and listener detached.");
    }
  },
  resumeInput: () => {
    if (mainRl && isMainRlPaused && mainRlLineHandler) {
      // Re-attach the handler first, then resume, then prompt
      mainRl.on('line', mainRlLineHandler);
      mainRl.resume();
      isMainRlPaused = false;
      log(LogLevel.DEBUG, "Main REPL input RESUMED and listener re-attached.");
      mainRl.prompt(); 
    }
  },
  isPaused: () => isMainRlPaused,
};

// New function to initialize/rebuild vector store for a project
async function initializeProjectVectorStore(projectName: string, projectPath: string, embeddingsInstance: OpenAIEmbeddings, appConfig: AppConfig): Promise<FaissStore> {
  const storeDirPath = path.join(projectPath, 'vectorStore');
  log(LogLevel.INFO, `Initializing vector store for project "${projectName}" at ${storeDirPath}`);

  if (fs.existsSync(storeDirPath)) {
    log(LogLevel.INFO, `Clearing existing vector store at ${storeDirPath} to rebuild.`);
    const indexFilePath = path.join(storeDirPath, 'faiss.index');
    const docstoreFilePath = path.join(storeDirPath, 'docstore.json');
    try {
        if (fs.existsSync(indexFilePath)) {
            fs.unlinkSync(indexFilePath);
            log(LogLevel.DEBUG, `Deleted ${indexFilePath}`);
        }
        if (fs.existsSync(docstoreFilePath)) {
            fs.unlinkSync(docstoreFilePath);
            log(LogLevel.DEBUG, `Deleted ${docstoreFilePath}`);
        }
    } catch (err: any) {
        log(LogLevel.WARN, `Could not fully delete old vector store contents from ${storeDirPath}: ${err.message}`);
    }
  } else {
      fs.mkdirSync(storeDirPath, { recursive: true });
  }

  const documents: Document[] = [];
  const splitter = new RecursiveCharacterTextSplitter({
    // Aim for chunks that are well within typical context windows for embedding models
    // text-embedding-3-small has 8192 tokens limit. Let's aim for smaller chunks.
    chunkSize: 1000, // characters
    chunkOverlap: 100, // characters
  });

  // projectPath is the root of the specific project, e.g., /path/to/wooster/projects/home
  // We should read files directly from this projectPath
  const filesToRead = fs.readdirSync(projectPath);

  for (const file of filesToRead) {
    const fileExtension = path.extname(file).toLowerCase();
    // Only pick up .md and .txt files from the root of the project directory
    if (fileExtension === '.md' || fileExtension === '.txt') {
      const filePath = path.join(projectPath, file);
      // Ensure it's a file and not a directory (like 'vectorStore' itself)
      if (fs.statSync(filePath).isFile()) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const chunks = await splitter.splitText(content);
          chunks.forEach((chunk, index) => {
            documents.push(new Document({
              pageContent: chunk,
              metadata: {
                source: file, // Original filename
                project: projectName,
                chunkNumber: index + 1,
                totalChunks: chunks.length
              }
            }));
          });
          log(LogLevel.INFO, `Prepared document for indexing: ${file} (Project: ${projectName}, Chunks: ${chunks.length})`);
        } catch (err: any) {
          log(LogLevel.WARN, `Failed to read or prepare document ${filePath}: ${err.message}`);
        }
      }
    }
  }

  let store: FaissStore;
  if (documents.length > 0) {
    store = await FaissStore.fromDocuments(documents, embeddingsInstance);
    log(LogLevel.INFO, `Created vector store with ${documents.length} document(s) for project "${projectName}".`);
  } else {
    log(LogLevel.INFO, `No documents found to index for project "${projectName}". Creating an empty store with a dummy document.`);
    store = await FaissStore.fromTexts([`No documents found in project ${projectName}. Project initialized.`], [{ project: projectName }], embeddingsInstance);
  }
  
  await store.save(storeDirPath);
  log(LogLevel.INFO, `Vector store for project "${projectName}" saved to ${storeDirPath}`);
  return store;
}

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

// Define the main REPL line handler as a named function
async function handleMainReplLine(line: string): Promise<void> {
  // This check should ideally not be needed if off/on logic is perfect,
  // but as a safeguard, especially during development/debugging.
  if (mainReplManager.isPaused()) {
    log(LogLevel.WARN, "Main REPL line handler called while supposedly PAUSED. Input ignored.");
    return; 
  }

  const input = line.trim();
  if (input.toLowerCase() === 'exit') {
    if (mainRl) mainRl.close();
    return; 
  }
  if (input) {
    const currentProjectName = 'home'; // This should ideally be dynamic if projects are switchable
    // Assuming chatHistory is accessible here (it was in the original main scope)
    const response = await agentRespond(input, chatHistory, currentProjectName);
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

let chatHistory: Array<{ role: string; content: string }> = []; // Moved chatHistory to a scope accessible by handleMainReplLine

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
  const defaultProjectNameGlobal = 'home'; 
  const projectDir = path.join(projectBasePath, defaultProjectNameGlobal);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  const projectVectorStore = await initializeProjectVectorStore(defaultProjectNameGlobal, projectDir, embeddings, appConfig);
  await initializeAgentExecutorService(projectVectorStore);
  log(LogLevel.INFO, "AgentExecutorService initialized.");
  await initSchedulerService(schedulerAgentCallback);
  log(LogLevel.INFO, "SchedulerService initialized.");
  await loadPlugins();
  log(LogLevel.INFO, "Plugins loaded.");
  await processCatchUpTasks();
  log(LogLevel.INFO, "Catch-up tasks processed.");

  mainRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  console.log("Wooster is ready. Type 'exit' to quit, or enter your command.");
  
  // Assign the named handler
  mainRlLineHandler = handleMainReplLine; 
  mainRl.on('line', mainRlLineHandler);

  mainRl.prompt();

  mainRl.on('close', () => {
    log(LogLevel.INFO, 'Exiting Wooster. Goodbye!');
    process.exit(0);
  });
}

main().catch(error => {
  log(LogLevel.ERROR, 'Critical error in main function:', { 
    message: (error instanceof Error ? error.message : String(error)), 
    stack: (error instanceof Error ? error.stack : undefined),
    name: (error instanceof Error ? error.name : undefined),
  });
  // Check if 'cause' exists on the error object before logging it
  if (error instanceof Error && 'cause' in error) {
    // Type 'error' as 'any' here to access 'cause' if the type guard passes,
    // as TS might still complain based on the default Error type.
    log(LogLevel.ERROR, 'Error Cause:', { cause: (error as any).cause });
  }
  console.error('[CRITICAL FALLBACK] Error in main:', error);
  process.exit(1);
});