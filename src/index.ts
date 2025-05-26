import 'dotenv/config'; // Load .env file into process.env
import readline from 'readline'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'

import type { FaissStore } from '@langchain/community/vectorstores/faiss'
// import { ChatOpenAI } from '@langchain/openai' // LLM now managed by AgentExecutorService
// import type { BaseLanguageModel } from '@langchain/core/language_models/base'

// import { addNode } from './memorySql'
import { initUserContextStore, addUserFactToContextStore, IProjectVectorStore } from './memoryVector' // Added IProjectVectorStore
import { initializeUserKnowledgeExtractor, extractUserKnowledge } from './userKnowledgeExtractor'
import { setUserContextStore as setUCMStoreForTool } from "./tools/userContextTool"
// import { buildRagChain } from './ragChain'
import { agentRespond, setAgentConfig } from './agent' // Removed getCurrentAvailableTools
// import type { AgentTool } from './agent' // AgentTool interface is removed from agent.ts
import {
  loadPlugins,
  initPlugins,
  // handleUserInput, // Part of pluginManager, but direct calls might be superseded by agent logic
  // handleAssistantResponse, // Part of pluginManager
  listPlugins,
} from './pluginManager'
import { createProjectStore, listProjectFiles } from './projectIngestor'
import { initDatabase as initSchedulerDB } from './scheduler/reminderRepository'
import { initSchedulerService } from './scheduler/schedulerService'
import { initHeartbeatService, stopHeartbeatService } from './heartbeat'
import { loadConfig, getConfig, AppConfig } from './configLoader'
import { bootstrapLogger, applyLoggerConfig, log, LogLevel, logLLMInteraction } from './logger'
import { initProjectMetadataService, logConversationTurn } from './projectMetadataService'
import { initializeWebSearchTool } from "./tools/webSearchTool"; // Added for Tavily
import { initializeAgentExecutorService } from './agentExecutorService'; // New import
// Removed placeholder imports: яйцо, 간단한툴, وزارة_الداخلية, списокИнструментов

import { createRetrievalChain } from 'langchain/chains/retrieval'
import { createStuffDocumentsChain } from "langchain/chains/combine_documents"
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"
import { AIMessage, HumanMessage, BaseMessage } from "@langchain/core/messages" // Added BaseMessage
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever"
import { ChatOpenAI } from '@langchain/openai'; // Keep for RAG chain if needed, or move to AgentExecutorService later

// Module-scoped variables
let vectorStore: FaissStore // Changed back to FaissStore
let userContextStore: FaissStore | undefined // Can be undefined if UCM is disabled
let ragChain: any // This will be specific to the project vector store
let llmForRag: ChatOpenAI // Specifically for RAG chain, agent has its own LLM
let currentProjectName: string | null = null
let conversationHistory: BaseMessage[] = [] // Changed to BaseMessage[] to match agent.ts expectations
let appConfig: AppConfig; // Renamed from 'config' to avoid confusion with parameter name

// Prompts moved to module scope
const historyAwarePrompt = ChatPromptTemplate.fromMessages([
    new MessagesPlaceholder("chat_history"),
    ["user", "{input}"],
    ["user", "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation"],
])

const answerPrompt = ChatPromptTemplate.fromMessages([
    ["system", "Answer the user's questions based on the below context. If you don't know the answer, say you don't know.\n\n{context}"],
    new MessagesPlaceholder("chat_history"),
    ["user", "{input}"],
])

// RAG Query function - This might be refactored or moved if AgentExecutorService handles RAG internally via a tool
async function performRagQuery(query: string): Promise<string> {
  if (!ragChain) {
    log(LogLevel.WARN, "RAG chain not ready for query.");
    return "Knowledge base is not ready for the current project.";
  }
  // Convert BaseMessage to the format expected by this specific RAG chain if necessary
  const ragHistory = conversationHistory.map(m => ({ role: m._getType(), content: m.content as string }));
  const result = await ragChain.invoke({ input: query, chat_history: ragHistory });
  return result.answer || "No answer found from knowledge base.";
}

async function main() {
  bootstrapLogger(); // Bootstrap logger for very early messages
  // dotenv/config is already loaded at the top for any early .env access

  loadConfig(); // Load configuration from config.json
  appConfig = getConfig(); // Initialize module-scoped config

  applyLoggerConfig(appConfig.logging); // Apply full logger config

  log(LogLevel.INFO, 'Starting Wooster...', { initialConfig: appConfig });

  // Validate essential OpenAI configuration
  if (!appConfig.openai.apiKey || appConfig.openai.apiKey === 'YOUR_OPENAI_API_KEY_HERE') {
    log(LogLevel.ERROR, 'Critical: Missing or placeholder OpenAI API key. Please set OPENAI_API_KEY environment variable.');
    process.exit(1);
  }

  // LLM for RAG chain specifically. AgentExecutorService will create its own LLM.
  llmForRag = new ChatOpenAI({
    apiKey: appConfig.openai.apiKey,
    modelName: appConfig.openai.modelName, 
    temperature: appConfig.openai.temperature 
  });
  log(LogLevel.INFO, 'ChatOpenAI LLM for RAG initialized with model: %s', llmForRag.modelName);
  
  setAgentConfig(appConfig); // Pass config to agent.ts (mainly for logging settings now)

  initializeUserKnowledgeExtractor(llmForRag) // UCM extractor can use the RAG LLM for now
  log(LogLevel.INFO, 'UserKnowledgeExtractor initialized.');

  initializeWebSearchTool(appConfig); // Initialize Tavily Search Tool
  log(LogLevel.INFO, 'WebSearchTool potentially initialized (check logs for Tavily status).');

  initSchedulerDB()
  log(LogLevel.INFO, 'Scheduler database initialized.');

  await initSchedulerService(schedulerAgentCallback)
  log(LogLevel.INFO, 'Scheduler service initialized.');

  initHeartbeatService()
  log(LogLevel.INFO, 'Heartbeat service initialized.');

  // Ensure 'home' project directory exists
  const homeProjectDir = path.resolve(process.cwd(), 'projects', 'home');
  if (!fs.existsSync(homeProjectDir)) {
    try {
      fs.mkdirSync(homeProjectDir, { recursive: true });
      log(LogLevel.INFO, 'Default project directory "projects/home" created.');
    } catch (error: any) {
      log(LogLevel.ERROR, 'Failed to create default project directory "projects/home". Error: %s', error.message);
      process.exit(1); // Exit if we can't create the essential home project dir
    }
  }
  currentProjectName = 'home'; // Set default project
  log(LogLevel.INFO, 'Default project set to "home".');

  try {
    vectorStore = await createProjectStore(currentProjectName); // Directly assign FaissStore
    log(LogLevel.INFO, 'Vector store for default project "home" initialized.');
  } catch (error: any) {
    log(LogLevel.ERROR, 'Failed to initialize vector store for default project "home": %s', error.message);
    process.exit(1); 
  }

  if (appConfig.ucm.enabled) {
    userContextStore = await initUserContextStore()
    setUCMStoreForTool(userContextStore) 
    log(LogLevel.INFO, 'User Context Memory (UCM) store initialized and set for tool.');
  } else {
    log(LogLevel.INFO, 'User Context Memory (UCM) is disabled.');
  }

  await initializeAgentExecutorService(userContextStore, vectorStore); // Pass FaissStore as projectStore
  log(LogLevel.INFO, 'AgentExecutorService initialized.');

  await initializeRagChain(); 
  log(LogLevel.INFO, 'RAG chain initialized.');

  await loadPlugins()
  log(LogLevel.INFO, 'Plugins loaded.');

  await initPlugins({ apiKey: appConfig.openai.apiKey, vectorStore, ragChain })
  log(LogLevel.INFO, 'Plugins initialized.');

  // Initialize Project Metadata Service for the current (default) project
  if (currentProjectName) {
    initProjectMetadataService(currentProjectName);
  }

  // Start interactive REPL
  startREPL()
  log(LogLevel.INFO, 'REPL started. Wooster operational.');
}

function startREPL() {
  log(LogLevel.INFO, "Wooster is operational. Type 'exit' or 'quit' to stop.");
  log(LogLevel.INFO, "Available commands: 'create project <name_or_path>', 'load project <name>', 'quit project', 'list files', 'list plugins', 'exit'.");
  log(LogLevel.INFO, "Otherwise, type your query for Wooster.");
  // console.log("Wooster is operational. Type 'exit' or 'quit' to stop.")
  // console.log("Available commands: 'list files', 'list plugins', 'list tools', 'ingest default', 'exit', 'quit'.")
  // console.log("Otherwise, type your query for Wooster.")

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  })

  rl.prompt()
  rl.on('line', async (line) => {
    const input = line.trim()
    log(LogLevel.INFO, 'User input: %s', input);
    conversationHistory.push(new HumanMessage(input))
    // Cap history to last 10 messages (5 pairs)
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-10)
    }

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      stopHeartbeatService()
      log(LogLevel.INFO, 'Exit command received. Shutting down Wooster...');
      rl.close()
      return
    } else if (input.toLowerCase().startsWith('create project')) {
      const projectArg = input.substring('create project'.length).trim();
      if (!projectArg) {
        log(LogLevel.WARN, 'Command: create project - no project name or path provided.');
        log(LogLevel.INFO, "Please specify a project name or a full directory path. Usage: create project <name_or_path>");
      } else {
        let projectPath = '';
        // Check if projectArg is a full path or just a name
        if (path.isAbsolute(projectArg) || projectArg.includes(path.sep)) {
          projectPath = path.resolve(projectArg); // Resolve to make sure it's an absolute, clean path
        } else {
          projectPath = path.resolve(process.cwd(), 'projects', projectArg);
        }

        log(LogLevel.INFO, 'Command: create project. Target path: "%s"', projectPath);

        if (fs.existsSync(projectPath)) {
          log(LogLevel.WARN, 'Project directory ""%s"" already exists.', projectPath);
          // Still load it if it exists and was specified by name (implicit load)
          if (projectArg === path.basename(projectPath)) { // was a name, not a full path
            currentProjectName = path.basename(projectPath);
            try {
              vectorStore = await createProjectStore(currentProjectName); // Assign FaissStore
              await initializeAgentExecutorService(userContextStore, vectorStore); // Re-initialize with new project store
              await initializeRagChain(); 
              log(LogLevel.INFO, 'Existing project "%s" loaded.', currentProjectName);
              // Initialize Project Metadata Service for the newly loaded project
              if (currentProjectName) initProjectMetadataService(currentProjectName);
            } catch (error: any) {
              log(LogLevel.ERROR, 'Failed to load existing project "%s": %s', currentProjectName, error.message);
              // Revert to home project if loading failed
              currentProjectName = 'home';
              vectorStore = await createProjectStore(currentProjectName); // Assign FaissStore
              await initializeAgentExecutorService(userContextStore, vectorStore); // Re-initialize with home store
              await initializeRagChain(); 
              log(LogLevel.WARN, 'Reverted to "home" project due to loading error.');
            }
          }
        } else {
          try {
            fs.mkdirSync(projectPath, { recursive: true });
            log(LogLevel.INFO, 'Project directory ""%s"" created successfully.', projectPath);
            // Automatically load the newly created project
            currentProjectName = path.basename(projectPath);
            vectorStore = await createProjectStore(currentProjectName); // Assign FaissStore
            await initializeAgentExecutorService(userContextStore, vectorStore); // Re-initialize with new project store
            await initializeRagChain(); // Re-initialize RAG chain with the new store
            log(LogLevel.INFO, 'Newly created project "%s" is now active.', currentProjectName);
            // Initialize Project Metadata Service for the newly created project
            if (currentProjectName) initProjectMetadataService(currentProjectName);
          } catch (error: any) {
            log(LogLevel.ERROR, 'Failed to create project directory ""%s"". Error: %s', projectPath, error.message);
          }
        }
      }
    } else if (input.toLowerCase().startsWith('load project')) {
      const projectNameToLoad = input.substring('load project'.length).trim();
      if (projectNameToLoad) {
        if (projectNameToLoad === currentProjectName) {
          log(LogLevel.INFO, 'Project "%s" is already loaded.', projectNameToLoad);
        } else {
          log(LogLevel.INFO, 'Command: load project "%s". Attempting to switch from "%s"', projectNameToLoad, currentProjectName);
          try {
            vectorStore = await createProjectStore(projectNameToLoad);
            currentProjectName = projectNameToLoad;
            await initializeAgentExecutorService(userContextStore, vectorStore); // Re-initialize with new project store
            await initializeRagChain();
            log(LogLevel.INFO, 'Project "%s" loaded successfully and is now active.', currentProjectName);
            // Initialize Project Metadata Service for the newly loaded project
            initProjectMetadataService(currentProjectName);
          } catch (error: any) {
            log(LogLevel.ERROR, 'Failed to load project "%s": %s. Previous project "%s" remains active.', projectNameToLoad, error.message, currentProjectName);
            // Optionally, try to reload the currentProjectName's store if it failed mid-switch, 
            // but createProjectStore should be robust. For now, just log that the current one remains active.
          }
        }
      } else {
        log(LogLevel.WARN, 'Command: load project - no project name provided.');
        // console.log("Please specify a project name. Usage: load project <name>");
        log(LogLevel.INFO, "Please specify a project name. Usage: load project <name>");
      }
    } else if (input.toLowerCase() === 'quit project' || input.toLowerCase() === 'exit project') {
      log(LogLevel.INFO, 'Command: quit project. Reverting to "home" project.');
      currentProjectName = 'home';
      try {
        vectorStore = await createProjectStore(currentProjectName); // Assign FaissStore
        await initializeAgentExecutorService(userContextStore, vectorStore); // Re-initialize with home store
        await initializeRagChain();
        log(LogLevel.INFO, 'Switched to "home" project.');
        // Initialize Project Metadata Service for the home project
        initProjectMetadataService(currentProjectName);
      } catch (error: any) {
        log(LogLevel.ERROR, 'Failed to load "home" project: %s', error.message);
        // This is a critical state, consider exiting or specific recovery
      }
    } else if (input.toLowerCase() === 'list files') {
      // console.log('Command: list files');
      log(LogLevel.INFO, 'Command: list files');
      if (currentProjectName) {
        try {
          const files = await listProjectFiles(currentProjectName)
          // console.log(`Project files for "${currentProjectName}":\n`, files.join('\n'))
          log(LogLevel.INFO, 'Project files for "%s":\n%s', currentProjectName, files.join('\n'));
        } catch (error: any) {
          // console.error(`Error listing files for project "${currentProjectName}": ${error.message}`)
          log(LogLevel.ERROR, 'Error listing files for project "%s": %s', currentProjectName, error.message);
        }
      } else {
        // console.log("No project loaded. Use 'load project <name>' to load a project first. (This command lists files for the currently loaded project)")
        log(LogLevel.INFO, "No project loaded. Use 'load project <name>' to load a project first. (This command lists files for the currently loaded project)");
      }
    } else if (input.toLowerCase() === 'list plugins') {
      const pluginNames = listPlugins()
      if (pluginNames.length === 0) {
        // console.log("No plugins currently registered.")
        log(LogLevel.INFO, "No plugins currently registered.");
      } else {
        // console.log("Registered plugin names:")
        // pluginNames.forEach(name => console.log(`- ${name}`))
        log(LogLevel.INFO, "Registered plugin names:");
        pluginNames.forEach(name => log(LogLevel.INFO, '- %s', name));
      }
    } else {
      // Default to Wooster agent response
      const mappedHistory = conversationHistory.map(m => ({role: m._getType() === 'human' ? 'user' : 'assistant', content: m.content as string}));
      const assistantResponse = await agentRespond(input, mappedHistory, currentProjectName || undefined);
      console.log(chalk.cyan("Wooster:"), assistantResponse);
      conversationHistory.push(new AIMessage(assistantResponse));
      // Cap history
      if (conversationHistory.length > 10) {
        conversationHistory = conversationHistory.slice(-10);
      }

      if (currentProjectName) {
        await logConversationTurn(currentProjectName, input, assistantResponse);
      }

      // Post-response UCM learning cycle
      if (appConfig.ucm.enabled && userContextStore) {
        log(LogLevel.INFO, "UCM: Extracting knowledge from conversation turn for UCM.");
        // Pass conversation history to extractUserKnowledge as well
        const extractedFact: string | null = await extractUserKnowledge(input, assistantResponse, currentProjectName);
        if (extractedFact) {
          log(LogLevel.INFO, `UCM: Adding new fact to UCM: "${extractedFact}"`);
          await addUserFactToContextStore(extractedFact, userContextStore);
        } else {
          log(LogLevel.DEBUG, "UCM: No new fact extracted from this turn.");
        }
      }
    }
    rl.prompt()
  })

  rl.on('close', () => {
    stopHeartbeatService()
    // console.log('REPL closed. Wooster shutting down.');
    log(LogLevel.INFO, 'REPL closed. Wooster shutting down.');
    // closeFileLogger removed;
    log(LogLevel.INFO, 'Exiting Wooster...');
    process.exit(0)
  })
}

async function initializeRagChain() {
  if (!vectorStore) {
    log(LogLevel.ERROR, "Vector store not initialized. Cannot create RAG chain.");
    return; 
  }
  // vectorStore is now directly FaissStore
  const retriever = vectorStore.asRetriever();

  const historyAwareRetriever = await createHistoryAwareRetriever({
    llm: llmForRag,
    retriever,
    rephrasePrompt: historyAwarePrompt,
  })

  const stuffDocumentsChain = await createStuffDocumentsChain({
    llm: llmForRag,
    prompt: answerPrompt,
  })

  ragChain = await createRetrievalChain({
    retriever: historyAwareRetriever,
    combineDocsChain: stuffDocumentsChain,
  })
  log(LogLevel.INFO, "RAG chain initialized successfully.");
}

// Helper to convert Langchain message role type to string for history
function m_roleToString(message: HumanMessage | AIMessage): 'user' | 'assistant' | 'system' {
  if (message._getType() === 'human') return 'user';
  if (message._getType() === 'ai') return 'assistant';
  // System messages aren't directly stored in conversationHistory in this structure, but good to have a case
  if (message._getType() === 'system') return 'system'; 
  return 'user'; // Fallback, though should ideally not be reached with current history structure
}

// Define the agent execution callback for the scheduler
async function schedulerAgentCallback(taskPayload: string): Promise<void> {
  log(LogLevel.INFO, `Scheduler: Executing scheduled task: "${taskPayload}"`);
  try {
    // For scheduled tasks, we pass an empty chat history for now.
    // We could potentially retrieve relevant past context if tasks were more complex or linked.
    const response = await agentRespond(
      taskPayload, 
      [], // Empty chat history for scheduled tasks
      currentProjectName || undefined, 
      true // isScheduledTask = true
    );
    log(LogLevel.INFO, `Scheduler: Task "${taskPayload}" executed. Response: "${response}"`);
    // Here, you might want to notify the user of the result, e.g., via a (future) notification system or logging.
    // For now, just logging it.
  } catch (error) {
    log(LogLevel.ERROR, `Scheduler: Error executing task "${taskPayload}":`, error);
  }
}

main().catch((error: any) => {
  // console.error("Critical error in main:", error); // Fallback for now
  log(LogLevel.ERROR, "Critical error in main function."); // Changed to double quotes
  stopHeartbeatService();
  process.exit(1);
});