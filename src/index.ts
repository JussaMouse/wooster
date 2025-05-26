import 'dotenv/config'; // Load .env file into process.env
import readline from 'readline'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'

import type { FaissStore } from '@langchain/community/vectorstores/faiss'
import { ChatOpenAI } from '@langchain/openai'
// import type { BaseLanguageModel } from '@langchain/core/language_models/base'

// import { addNode } from './memorySql'
import { initUserContextStore, addUserFactToContextStore } from './memoryVector'
import { initializeUserKnowledgeExtractor, extractUserKnowledge } from './userKnowledgeExtractor'
import { setUserContextStore as setUCMStoreForTool } from "./tools/userContextTool"
// import { buildRagChain } from './ragChain'
import { agentRespond, setAgentConfig, getCurrentAvailableTools } from './agent'
import type { AgentTool } from './agent'
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

// RAG Query function
async function performRagQuery(query: string): Promise<string> {
  if (!ragChain) {
    log(LogLevel.WARN, "RAG chain not ready for query.");
    return "Knowledge base is not ready.";
  }
  // Correctly use conversationHistory for the RAG chain context
  const relevantHistory = conversationHistory.map(m => ({ role: m_roleToString(m), content: m.content as string }));
  const result = await ragChain.invoke({ input: query, chat_history: relevantHistory });
  return result.answer;
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
    log(LogLevel.ERROR, 'Critical: Missing or placeholder OpenAI API key in config.json (openai.apiKey). Please set it.');
    process.exit(1);
  }

  llm = new ChatOpenAI({
    apiKey: appConfig.openai.apiKey,
    modelName: appConfig.openai.modelName || "gpt-4o-mini", // Default if not in config
    temperature: 0.2 
  });
  log(LogLevel.INFO, 'ChatOpenAI LLM initialized with model: %s', llm.modelName);
  setAgentConfig(appConfig); // Pass full config to agent for its own needs (e.g. logging LLM interactions)

  initializeUserKnowledgeExtractor(llm)
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
    vectorStore = await createProjectStore(currentProjectName); // Load 'home' project store
    log(LogLevel.INFO, 'Vector store for default project "home" initialized.');
  } catch (error: any) {
    log(LogLevel.ERROR, 'Failed to initialize vector store for default project "home": %s', error.message);
    process.exit(1); // Critical failure if default project store can't load
  }

  if (appConfig.ucm.enabled) {
    userContextStore = await initUserContextStore()
    setUCMStoreForTool(userContextStore)
    log(LogLevel.INFO, 'User Context Memory (UCM) store initialized and set for tool because ucm.enabled is true.');
  } else {
    log(LogLevel.INFO, 'User Context Memory (UCM) is disabled via config.ucm.enabled = false.');
    // Ensure ucmStore is not used if disabled; tools should handle it being null.
    // setUserContextStore in userContextTool already sets a global `ucmStore` which defaults to null.
    // If we don't call setUCMStoreForTool, it remains null, which is desired.
  }

  await initializeRagChain()
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
              vectorStore = await createProjectStore(currentProjectName);
              await initializeRagChain(); 
              log(LogLevel.INFO, 'Existing project "%s" loaded.', currentProjectName);
              // Initialize Project Metadata Service for the newly loaded project
              if (currentProjectName) initProjectMetadataService(currentProjectName);
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
            // vectorStore = await initVectorStore(); // This is not needed anymore, createProjectStore handles all.
            vectorStore = await createProjectStore(projectNameToLoad);
            currentProjectName = projectNameToLoad;
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
        vectorStore = await createProjectStore(currentProjectName);
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
    } else if (input.toLowerCase() === 'list tools') {
      const currentTools: AgentTool[] = getCurrentAvailableTools();
      if (currentTools.length === 0) {
        log(LogLevel.INFO, "No tools currently available to the agent based on configuration.");
      } else {
        log(LogLevel.INFO, "Available agent tools:");
        currentTools.forEach((t: AgentTool) => {
          log(LogLevel.INFO, '- %s: %s', t.name, t.description);
        });
      }
    } else {
      // Default to treating input as a query for the agent
      const mappedHistory = conversationHistory.map(m => ({ role: m_roleToString(m), content: m.content as string }));
      const agentLLMResponse = await agentRespond(
        input,
        llm,
        performRagQuery,
        mappedHistory, // Pass the mapped history
        currentProjectName || undefined,
        false // isScheduledTask
      );
      log(LogLevel.INFO, "Agent's response: %s", agentLLMResponse);
      console.log(chalk.cyan("Wooster:"), agentLLMResponse);
      conversationHistory.push(new AIMessage(agentLLMResponse));
      // Cap history
      if (conversationHistory.length > 10) {
        conversationHistory = conversationHistory.slice(-10);
      }

      if (currentProjectName) {
        await logConversationTurn(currentProjectName, input, agentLLMResponse);
      }

      // Post-response UCM learning cycle
      if (appConfig.ucm.enabled && userContextStore) {
        log(LogLevel.INFO, "UCM: Extracting knowledge from conversation turn for UCM.");
        // Pass conversation history to extractUserKnowledge as well
        const extractedFact: string | null = await extractUserKnowledge(input, agentLLMResponse, currentProjectName);
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
      llm, 
      performRagQuery, 
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