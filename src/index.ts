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

async function main() {
  bootstrapLogger(); // Initial, minimal logger
  loadConfig(); // Load configuration from .env and potentially config files
  const appConfig = getConfig();
  applyLoggerConfig(appConfig.logging); // Apply full logging configuration

  log(LogLevel.INFO, `Wooster starting up... v${appConfig.version}`);
  log(LogLevel.DEBUG, 'Application Config:', { appConfig });

  if (!appConfig.openai.apiKey || appConfig.openai.apiKey === DEFAULT_CONFIG.openai.apiKey) {
    log(LogLevel.ERROR, "OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.");
    process.exit(1); 
  }

  // Initialize databases
  initSchedulerDB();
  log(LogLevel.INFO, "Scheduler database initialized.");

  // Initialize main services
  // Agent config needs to be set early as other services might use it via getConfig()
  setAgentConfig(appConfig);

  // Initialize vector stores (example for a default project and user profile)
  // This is a simplified setup; a real app would manage projects dynamically.
  const embeddings = new OpenAIEmbeddings({ openAIApiKey: appConfig.openai.apiKey });
  
  const defaultProjectName = 'home'; // Or load from config/determine dynamically
  const projectDir = path.join(projectBasePath, defaultProjectName);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  // const projectVectorStorePath = path.join(projectDir, 'vectorStore'); // No longer needed here like this
  
  // Replace the old vector store loading/creation block with a call to the new function
  const projectVectorStore = await initializeProjectVectorStore(defaultProjectName, projectDir, embeddings, appConfig);

  // Remove or comment out the old diagnostic log here, as the new function logs counts.
  // if (projectVectorStore && projectVectorStore.docstore && (projectVectorStore.docstore as any)._docs) {
  //   log(LogLevel.DEBUG, `DIAGNOSTIC_VECTOR_STORE: Loaded store document count: ${(projectVectorStore.docstore as any)._docs.size}`);
  // } else {
  //   log(LogLevel.DEBUG, `DIAGNOSTIC_VECTOR_STORE: Could not determine loaded store document count (docstore or _docs missing).`);
  // }
  
  await initializeAgentExecutorService(projectVectorStore);
  log(LogLevel.INFO, "AgentExecutorService initialized.");

  // Initialize scheduler
  // Pass the agentRespond function as the callback for scheduled agent tasks
  await initSchedulerService(schedulerAgentCallback);
  log(LogLevel.INFO, "SchedulerService initialized.");

  // Load plugins - this needs to happen after core services that plugins might depend on are ready
  // (like scheduler, config, logger).
  // It also needs to happen before agent executor tools are finalized if plugins provide tools.
  // And before scheduler catch-up tasks if plugins provide scheduled functions.
  await loadPlugins();
  log(LogLevel.INFO, "Plugins loaded.");
  
  // Process any tasks that were missed while the application was offline
  // This should happen AFTER plugins are loaded, in case plugins define scheduled tasks
  await processCatchUpTasks();
  log(LogLevel.INFO, "Catch-up tasks processed.");


  // Start interactive REPL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  console.log("Wooster is ready. Type 'exit' to quit, or enter your command.");
  rl.prompt();

  let chatHistory: Array<{ role: string; content: string }> = [];

  rl.on('line', async (line) => {
    const input = line.trim();
    if (input.toLowerCase() === 'exit') {
      rl.close();
    return; 
  }
    if (input) {
      const response = await agentRespond(input, chatHistory, defaultProjectName);
      console.log(`Wooster: ${response}`);
      chatHistory.push({ role: 'user', content: input });
      chatHistory.push({ role: 'assistant', content: response });
      // Optional: Trim history to keep it manageable
      if (chatHistory.length > 20) { 
        chatHistory = chatHistory.slice(-20);
      }
    }
    rl.prompt();
  }).on('close', () => {
    log(LogLevel.INFO, 'Exiting Wooster. Goodbye!');
    process.exit(0);
  });
}

main().catch(error => {
  log(LogLevel.ERROR, 'Critical error in main function:', { 
    message: error.message, 
    stack: error.stack,
    name: error.name,
    cause: error.cause 
  });
  // Use console.error as logger might be part of the issue or not fully set up
  console.error('[CRITICAL FALLBACK] Error in main:', error);
  process.exit(1);
});