import 'dotenv/config'
import readline from 'readline'
import fs from 'fs'
import path from 'path'

import type { FaissStore } from '@langchain/community/vectorstores/faiss'
import { ChatOpenAI } from '@langchain/openai'
// import type { BaseLanguageModel } from '@langchain/core/language_models/base'

// import { addNode } from './memorySql'
import { initVectorStore, initUserContextStore, addUserFactToContextStore, USER_CONTEXT_VECTOR_STORE_PATH } from './memoryVector'
import { initializeUserKnowledgeExtractor, extractUserKnowledge } from './userKnowledgeExtractor'
import { setUserContextStore as setUCMStoreForTool } from "./tools/userContextTool"
// import { buildRagChain } from './ragChain'
import { agentRespond, availableTools } from './agent'
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
import { initLogger, log, LogLevel } from './logger'
// Removed placeholder imports: яйцо, 간단한툴, وزارة_الداخلية, списокИнструментов

import { createRetrievalChain } from 'langchain/chains/retrieval'
import { createStuffDocumentsChain } from "langchain/chains/combine_documents"
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"
import { AIMessage, HumanMessage } from "@langchain/core/messages"
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever"

// Module-scoped variables
let vectorStore: FaissStore
let userContextStore: FaissStore
let ragChain: any
let llm: ChatOpenAI
let currentProjectName: string | null = null
let conversationHistory: (HumanMessage | AIMessage)[] = []
let config: AppConfig; // Declare module-scoped config

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

async function main() {
  initLogger(); // Initialize logger first

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // console.error('Error: Missing OPENAI_API_KEY in .env')
    log(LogLevel.ERROR, 'Error: Missing OPENAI_API_KEY in .env');
    process.exit(1)
  }
  loadConfig(); // Load configuration first
  config = getConfig(); // Initialize module-scoped config
  // initFileLogger() // Initialize logger (logger itself might use config later)

  // console.log('Starting Wooster...', { initialConfig: config }); 
  log(LogLevel.INFO, 'Starting Wooster...', { initialConfig: config });

  llm = new ChatOpenAI({ apiKey, modelName: process.env.OPENAI_MODEL_NAME || "gpt-3.5-turbo", temperature: 0.2 })
  // console.log('ChatOpenAI LLM initialized.');
  log(LogLevel.INFO, 'ChatOpenAI LLM initialized with model: %s', llm.modelName);

  initializeUserKnowledgeExtractor(llm)
  // console.log('UserKnowledgeExtractor initialized.');
  log(LogLevel.INFO, 'UserKnowledgeExtractor initialized.');

  initSchedulerDB()
  // console.log('Scheduler database initialized.');
  log(LogLevel.INFO, 'Scheduler database initialized.');

  await initSchedulerService(schedulerAgentCallback)
  // console.log('Scheduler service initialized.');
  log(LogLevel.INFO, 'Scheduler service initialized.');

  initHeartbeatService()
  // console.log('Heartbeat service initialized.');
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
    vectorStore = await createProjectStore(currentProjectName); // Load 'home' project store
    log(LogLevel.INFO, 'Vector store for default project "home" initialized.');
  } catch (error: any) {
    log(LogLevel.ERROR, 'Failed to initialize vector store for default project "home": %s', error.message);
    process.exit(1); // Critical failure if default project store can't load
  }

  if (config.ucm.enabled) {
    userContextStore = await initUserContextStore()
    setUCMStoreForTool(userContextStore)
    // console.log('User Context Memory (UCM) store initialized and set for tool because ucm.enabled is true.');
    log(LogLevel.INFO, 'User Context Memory (UCM) store initialized and set for tool because ucm.enabled is true.');
  } else {
    // console.log('User Context Memory (UCM) is disabled via config.ucm.enabled = false.');
    log(LogLevel.INFO, 'User Context Memory (UCM) is disabled via config.ucm.enabled = false.');
    // Ensure ucmStore is not used if disabled; tools should handle it being null.
    // setUserContextStore in userContextTool already sets a global `ucmStore` which defaults to null.
    // If we don't call setUCMStoreForTool, it remains null, which is desired.
  }

  await initializeRagChain()
  // console.log('RAG chain initialized.');
  log(LogLevel.INFO, 'RAG chain initialized.');

  await loadPlugins()
  // console.log('Plugins loaded.');
  log(LogLevel.INFO, 'Plugins loaded.');

  await initPlugins({ apiKey, vectorStore, ragChain })
  // console.log('Plugins initialized.');
  log(LogLevel.INFO, 'Plugins initialized.');

  // Start interactive REPL
  startREPL()
  // console.log('REPL started. Wooster operational.');
  log(LogLevel.INFO, 'REPL started. Wooster operational.');
}

function startREPL() {
  log(LogLevel.INFO, "Wooster is operational. Type 'exit' or 'quit' to stop.");
  log(LogLevel.INFO, "Available commands: 'create project <name_or_path>', 'load project <name>', 'quit project', 'list files', 'list plugins', 'list tools', 'exit'.");
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
    // console.log(`User input: ${input}`);
    log(LogLevel.INFO, 'User input: %s', input); // Use %s for string formatting with util.format
    conversationHistory.push(new HumanMessage(input))
    // Cap history to last 10 messages (5 pairs)
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-10)
    }

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      stopHeartbeatService()
      // console.log('Exit command received. Shutting down Wooster...');
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
              vectorStore = await createProjectStore(currentProjectName);
              await initializeRagChain(); 
              log(LogLevel.INFO, 'Existing project "%s" loaded.', currentProjectName);
            } catch (error: any) {
              log(LogLevel.ERROR, 'Failed to load existing project "%s": %s', currentProjectName, error.message);
              // Revert to home project if loading failed
              currentProjectName = 'home';
              vectorStore = await createProjectStore(currentProjectName);
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
            vectorStore = await createProjectStore(currentProjectName);
            await initializeRagChain(); // Re-initialize RAG chain with the new store
            log(LogLevel.INFO, 'Newly created project "%s" is now active.', currentProjectName);
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
            // vectorStore = await initVectorStore(); // This is not needed anymore, createProjectStore handles all.
            vectorStore = await createProjectStore(projectNameToLoad);
            currentProjectName = projectNameToLoad;
            await initializeRagChain();
            log(LogLevel.INFO, 'Project "%s" loaded successfully and is now active.', currentProjectName);
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
      log(LogLevel.INFO, 'Command: quit project / exit project');
      if (currentProjectName === 'home') {
        log(LogLevel.INFO, 'Already in "home" project. No change.');
      } else {
        try {
          currentProjectName = 'home';
          vectorStore = await createProjectStore(currentProjectName);
          await initializeRagChain();
          log(LogLevel.INFO, 'Switched to "home" project.');
        } catch (error: any) {
          log(LogLevel.ERROR, 'Failed to switch to "home" project: %s. Current project remains "%s"', error.message, currentProjectName || "None");
          // Attempt to keep the current project or handle error more gracefully if needed
        }
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
    } else if (input.toLowerCase() === 'list tools') {
      if (availableTools.length === 0) {
        // console.log("No tools currently available to the agent.")
        log(LogLevel.INFO, "No tools currently available to the agent.");
      } else {
        // console.log("Available agent tools:")
        // availableTools.forEach(t => console.log(`- ${t.name}: ${t.description}`))
        log(LogLevel.INFO, "Available agent tools:");
        availableTools.forEach(t => log(LogLevel.INFO, '- %s: %s', t.name, t.description));
      }
    } else {
      if (!ragChain) {
        // console.warn("RAG chain not ready for agent response.");
        log(LogLevel.WARN, "RAG chain not ready for agent response.");
        // console.log("Assistant is not ready yet, RAG chain is initializing...")
        log(LogLevel.INFO, "Assistant is not ready yet, RAG chain is initializing...");
        rl.prompt()
        return
      }
      // log(LogLevel.DEBUG, `Calling agentRespond with input: "${input}"`); // Already logged user input
      const response = await agentRespond(input, llm, async (query) => {
        // log(LogLevel.DEBUG, `RAG callback received query: "${query}"`);
        const result = await ragChain.invoke({ input: query, chat_history: conversationHistory })
        // log(LogLevel.DEBUG, `RAG callback result:`, result);
        return result.answer
      }) // Removed currentProjectName from here as agentRespond doesn't take it directly
      
      // console.log(`Assistant response: ${response}`);
      log(LogLevel.INFO, 'Assistant response: %s', response);
      // console.log("Assistant:", response)
      // log(LogLevel.INFO, "Assistant:", response); // Redundant if above is good.
      if (response) {
        conversationHistory.push(new AIMessage(response))

        // UCM Learning Step (only if UCM is enabled)
        if (config.ucm.enabled && userContextStore) { 
          try {
            const userFact = await extractUserKnowledge(input, response, currentProjectName);
            if (userFact) {
              await addUserFactToContextStore(userFact, userContextStore);
              // console.debug(`[UCM Learned]: ${userFact}`);
              log(LogLevel.DEBUG, '[UCM Learned]: %s', userFact);
            }
          } catch (ucmError: any) {
            // console.error("Error during UCM processing:", ucmError);
            log(LogLevel.ERROR, 'Error during UCM processing: %s', ucmError.message ? ucmError.message : ucmError);
          }
        } else if (config.ucm.enabled && !userContextStore) {
            // console.warn("UCM is enabled in config, but userContextStore is not initialized. Skipping UCM learning step.");
            log(LogLevel.WARN, "UCM is enabled in config, but userContextStore is not initialized. Skipping UCM learning step.");
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
    // console.error("Vector store not initialized. Cannot create RAG chain.");
    log(LogLevel.ERROR, "Vector store not initialized. Cannot create RAG chain.");
    return
  }
  // console.debug('Initializing RAG chain...');
  log(LogLevel.DEBUG, 'Initializing RAG chain...');
  const retriever = vectorStore.asRetriever()
  // No need to check if retriever is null, asRetriever() should return one or throw if store is invalid

  const historyAwareRetrieverChain = await createHistoryAwareRetriever({
    llm,
    retriever,
    rephrasePrompt: historyAwarePrompt,
  })

  const stuffDocumentsChain = await createStuffDocumentsChain({
    llm,
    prompt: answerPrompt,
  })

  ragChain = await createRetrievalChain({
    retriever: historyAwareRetrieverChain,
    combineDocsChain: stuffDocumentsChain,
  })
  // console.log("RAG chain initialized successfully.")
  log(LogLevel.INFO, "RAG chain initialized successfully.");
  // console.log("RAG chain initialized successfully."); // Redundant
}

// Define the agent execution callback for the scheduler
async function schedulerAgentCallback(taskPayload: string): Promise<void> {
  // console.log(`Scheduler executing agent task. Payload: "${taskPayload}"`);
  log(LogLevel.INFO, 'Scheduler executing agent task. Payload: "%s"', taskPayload);
  try {
    if (!ragChain || !llm) {
      // console.error("RAG chain or LLM not initialized for scheduled task.");
      log(LogLevel.ERROR, "RAG chain or LLM not initialized for scheduled task.");
      return
    }
    const response = await agentRespond(taskPayload, llm, async (query) => {
      const result = await ragChain.invoke({ input: query, chat_history: [] })
      return result.answer
    }, undefined, true);
    // console.log(`Scheduled agent task response: "${response}" (Note: This is the agent's textual response, actual tool actions like email would have occurred silently)`);
    log(LogLevel.INFO, 'Scheduled agent task response: "%s" (Note: This is the agent\'s textual response, actual tool actions like email would have occurred silently)', response);
  } catch (error: any) {    
    // console.error("Error during scheduled agent task execution:", error);
    log(LogLevel.ERROR, 'Error during scheduled agent task execution: %s', error.message ? error.message : error);
  }
}

main().catch((error: any) => {
  // console.error("Critical error in main:", error); // Fallback for now
  log(LogLevel.ERROR, "Critical error in main function."); // Changed to double quotes
  stopHeartbeatService();
  process.exit(1);
});
