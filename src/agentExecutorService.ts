import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { Tool, DynamicTool } from "@langchain/core/tools";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import * as fs from 'fs';
import * as path from 'path';
import { calendar_v3 } from 'googleapis';

import { AppConfig, getConfig } from "./configLoader";
import { log, LogLevel } from "./logger";
import { parseDateString } from "./scheduler/scheduleParser";
import { getPluginAgentTools } from "./pluginManager";
import { ChatDebugFileCallbackHandler } from "./chatDebugFileCallbackHandler";
import { scheduleAgentTaskTool } from "./schedulerTool";
import { createFileTool, readFileTool } from './fileSystemTool';
import { initializeProjectVectorStore } from './projectStoreManager';

let userProfileStoreInstance: FaissStore | null = null;
let projectVectorStoreInstance: FaissStore | null = null;
let tools: any[] = [];
let agentExecutorInstance: AgentExecutor | null = null;
let appConfig: AppConfig;
let agentLlm: ChatOpenAI;

// New module-level variables for active project management
let currentActiveProjectName: string | null = null;
let currentActiveProjectPath: string | null = null;
let embeddingsInstance: OpenAIEmbeddings | null = null;
let projectStoreAppConfig: AppConfig | null = null; // To be used by initializeProjectVectorStore
const projectBasePath = path.join(process.cwd(), 'projects');

const historyAwarePrompt = ChatPromptTemplate.fromMessages([
    new MessagesPlaceholder("chat_history"),
    ["user", "{input}"],
    ["user", "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation"],
]);

const answerPrompt = ChatPromptTemplate.fromMessages([
    ["system", "Answer the user's questions based on the below context. If you don't know the answer, say you don't know or the information is not in the provided documents.\n\n{context}"],
    new MessagesPlaceholder("chat_history"),
    ["user", "{input}"],
]);

interface ScheduleAgentTaskArgs {
  taskPayload: string;
  timeExpression: string;
  humanReadableDescription: string;
}

async function initializeTools() {
  appConfig = await getConfig();
  agentLlm = new ChatOpenAI({
    modelName: appConfig.openai.modelName,
    temperature: appConfig.openai.temperature,
    openAIApiKey: appConfig.openai.apiKey,
  });

  const coreTools: any[] = [];

  const queryKnowledgeBase = new DynamicTool({
    name: "queryKnowledgeBase",
    description: "Searches and answers questions based exclusively on the documents and knowledge within the currently active project. Use for information specific to this project's context. Input should be a concise query string detailing what information is sought.",
    func: async (input: string, runManager?: any) => {
      if (!projectVectorStoreInstance) {
        log(LogLevel.ERROR, "Project vector store not initialized for queryKnowledgeBase tool.");
        return "Project knowledge base is not currently available.";
      }
      if (!agentLlm) {
        log(LogLevel.ERROR, "Agent LLM not initialized for queryKnowledgeBase tool.");
        return "LLM for knowledge base is not available.";
      }
      log(LogLevel.DEBUG, "queryKnowledgeBaseTool: Invoked", { input });
      try {
        const retriever = projectVectorStoreInstance.asRetriever();
        const currentChatHistory: BaseMessage[] = runManager?.config?.configurable?.chat_history || [];
        const ragChatHistory = currentChatHistory.filter(m => m._getType() === 'human' || m._getType() === 'ai');
        const historyAwareRetrieverChain = await createHistoryAwareRetriever({
            llm: agentLlm, 
            retriever,
            rephrasePrompt: historyAwarePrompt,
        });
        const documentChain = await createStuffDocumentsChain({
            llm: agentLlm,
            prompt: answerPrompt,
        });
        const retrievalChain = await createRetrievalChain({
            retriever: historyAwareRetrieverChain,
            combineDocsChain: documentChain,
        });
        const result = await retrievalChain.invoke({ 
            input: input, 
            chat_history: ragChatHistory,
        });
        log(LogLevel.DEBUG, "queryKnowledgeBaseTool: RAG chain result", { result });
        return result.answer || "No relevant information found in the project knowledge base.";
      } catch (error) {
        log(LogLevel.ERROR, "queryKnowledgeBaseTool: Error during RAG chain execution", { error });
        return "Error occurred while querying the project knowledge base.";
      }
    },
  });
  coreTools.push(queryKnowledgeBase);

  coreTools.push(scheduleAgentTaskTool);
  coreTools.push(createFileTool);
  coreTools.push(readFileTool);

  const pluginTools = getPluginAgentTools();
  log(LogLevel.INFO, "Retrieved %d tools from plugins.", pluginTools.length);

  const allToolsMap = new Map<string, any>();
  coreTools.forEach(tool => allToolsMap.set(tool.name, tool));
  pluginTools.forEach(tool => {
    if (!allToolsMap.has(tool.name)) {
      allToolsMap.set(tool.name, tool);
    } else {
      log(LogLevel.WARN, `Plugin tool \"${tool.name}\" conflicts with a core tool name. Core tool \"${allToolsMap.get(tool.name)?.description.substring(0,50)}...\" will be used.`);
    }
  });

  tools = Array.from(allToolsMap.values());
  log(LogLevel.INFO, "AgentExecutorService: Total tools initialized: %d. Tool names: %s", tools.length, tools.map(t => `${t.name} (desc: ${t.description.substring(0, 70)}...)`).join('\n'));
}

async function getAgentExecutor(): Promise<AgentExecutor> {
  if (agentExecutorInstance) {
    return agentExecutorInstance;
  }

  if (tools.length === 0 || !agentLlm) {
    await initializeTools();
  }
  
  let baseSystemPromptText = 
    "You are Wooster, a helpful AI assistant. Your goal is to assist the user with their tasks and questions." +
    "You have access to the following tools. Only use tools if necessary. If you can answer directly, do so." +
    "When using a tool, you must provide your reasoning and the exact input to the tool." +
    "If a tool provides an error or unusable results, try to analyze the error and retry if appropriate, or inform the user." +
    "Always strive to be helpful, polite, and provide clear, concise answers.";

  const promptsDirPath = path.join(process.cwd(), 'prompts');

  try {
    const basePromptFilePath = path.join(promptsDirPath, 'base_system_prompt.txt');
    if (fs.existsSync(basePromptFilePath)) {
      baseSystemPromptText = fs.readFileSync(basePromptFilePath, 'utf-8').trim();
      log(LogLevel.INFO, "Successfully loaded base system prompt from file: prompts/base_system_prompt.txt");
    } else {
      log(LogLevel.WARN, `Base system prompt file not found at ${basePromptFilePath}. Using default hardcoded prompt.`);
    }
  } catch (error) {
    log(LogLevel.ERROR, "Error reading base system prompt file. Using default hardcoded prompt.", { error });
  }

  let appendedPromptsText = "";
  try {
    if (fs.existsSync(promptsDirPath)) {
      const allFiles = fs.readdirSync(promptsDirPath);
      const additionalPromptFiles = allFiles
        .filter(file => file.endsWith('.txt') && file !== 'base_system_prompt.txt')
        .sort();

      for (const file of additionalPromptFiles) {
        try {
          const filePath = path.join(promptsDirPath, file);
          const content = fs.readFileSync(filePath, 'utf-8').trim();
          if (content) {
            appendedPromptsText += "\n\n" + content;
            log(LogLevel.INFO, `Appended content from prompt file: prompts/${file}`);
          }
        } catch (fileReadError) {
          log(LogLevel.ERROR, `Error reading additional prompt file: prompts/${file}. Skipping.`, { fileReadError });
        }
      }
    } else {
      log(LogLevel.INFO, "Prompts directory not found, no additional prompts will be appended.");
    }
  } catch (dirReadError) {
    log(LogLevel.ERROR, "Error reading prompts directory. No additional prompts will be appended.", { dirReadError });
  }
  
  const finalSystemPrompt = baseSystemPromptText + 
    appendedPromptsText +
    `\n\nYour current active project is '${currentActiveProjectName}'. For tools requiring a project name, like 'create_file', you should use this active project name by default. ` +
    "If the user explicitly specifies a different project for a particular action (e.g., 'save this note in project X'), then you should use the project name specified by the user for that action\'s tool call. " +
    `If you are unsure which project to use for an operation that requires one, and the user has not specified one, you should ask for clarification or use the active project '${currentActiveProjectName}'. ` +
    "Do not change the active project context itself without explicit instruction." +
    "\n\nTo add content to an existing file (e.g., add an entry to a log file), you should first use the 'read_file_content' tool to get the current content. Then, append your new content to the existing content in your internal thought process. Finally, use the 'create_file' tool to save the entire new combined content back to the same file. This ensures you don\'t overwrite existing data unintentionally when the user asks to add something." +
    "\n\nCurrent date and time: {current_date_time}";

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", finalSystemPrompt],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const agent = await createOpenAIToolsAgent({
    llm: agentLlm,
    tools,
    prompt,
  });

  let agentExecutorOptions: any = {
    agent,
    tools,
    handleParsingErrors: (err: unknown) => {
      log(LogLevel.ERROR, "Agent parsing error:", { error: err });
      return "There was an issue parsing the response. Please try rephrasing your request.";
    },
  };

  if (appConfig.logging.logAgentLLMInteractions) {
    agentExecutorOptions.callbacks = [new ChatDebugFileCallbackHandler()];
    agentExecutorOptions.verbose = false;
  } else {
    agentExecutorOptions.verbose = false;
  }

  agentExecutorInstance = new AgentExecutor(agentExecutorOptions);
  log(LogLevel.INFO, "AgentExecutor instance created.");
  return agentExecutorInstance;
}

export async function initializeAgentExecutorService(
  initialProjectName: string,
  initialProjectPath: string,
  initialProjectStore: FaissStore,
  initialEmbeddings: OpenAIEmbeddings,
  configForProjectStore: AppConfig
): Promise<void> { // This function's primary purpose is to set module-level state.
  currentActiveProjectName = initialProjectName;
  currentActiveProjectPath = initialProjectPath;
  projectVectorStoreInstance = initialProjectStore;
  embeddingsInstance = initialEmbeddings; 
  projectStoreAppConfig = configForProjectStore; 

  log(LogLevel.INFO, `AgentExecutorService: Initialized with project "${initialProjectName}". Vector Store ready.`);
  // This service exposes its functions (like executeAgent, setActiveProject, getActiveProjectPath)
  // as direct module exports, which pluginManager.ts then collects into the CoreServices object.
  // So, no explicit return of these functions is needed here.
}

export async function setActiveProject(newProjectName: string): Promise<void> {
  if (currentActiveProjectName === newProjectName) {
    log(LogLevel.INFO, `Project "${newProjectName}" is already active.`);
    return;
  }

  log(LogLevel.INFO, `Attempting to set active project to: "${newProjectName}"`);
  const projectDir = path.join(projectBasePath, newProjectName);
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    log(LogLevel.ERROR, `Project directory ${projectDir} not found for project "${newProjectName}".`);
    // Decide if we should throw an error or just log and not switch
    // For now, just log and don't switch, keep the current active project.
    // Or, should we switch to a "no project" state or a default "home" state?
    // For now, we prevent switching to a non-existent project.
    throw new Error(`Project '${newProjectName}' not found. Cannot set as active.`);
  }

  try {
    // Ensure projectStoreAppConfig and embeddingsInstance are available (should be from initializeAgentExecutorService)
    if (!projectStoreAppConfig || !embeddingsInstance) {
        log(LogLevel.ERROR, "Project store config or embeddings not available for setActiveProject.");
        throw new Error("Cannot switch project: Core components for vector store not initialized.");
    }
    const vectorStore = await initializeProjectVectorStore(newProjectName, projectDir, embeddingsInstance, projectStoreAppConfig);
    projectVectorStoreInstance = vectorStore;
    currentActiveProjectName = newProjectName;
    currentActiveProjectPath = projectDir; // Update the path
    log(LogLevel.INFO, `Successfully set active project to "${newProjectName}". Vector store loaded.`);

    // Re-initialize or update agent/tools if necessary, especially if project context affects tool behavior
    // For now, let's assume the agent's system prompt (which includes active project name) will be updated on next getAgentExecutor call.
    // And tools that depend on active project will use the getters.
    agentExecutorInstance = null; // Force re-creation of agent executor with new project context in prompt.
    await getAgentExecutor(); // Re-initialize agent executor
    log(LogLevel.INFO, `Agent executor re-initialized for project "${newProjectName}".`);

  } catch (error: any) {
    log(LogLevel.ERROR, `Failed to set active project to "${newProjectName}". Error: ${error.message}`, { stack: error.stack });
    // Optionally, re-throw the error if the switch is critical or handle gracefully
    throw error; // Re-throw to make the caller aware of the failure
  }
}

export async function executeAgent(
  userInput: string,
  chatHistory: BaseMessage[],
): Promise<string> {
  if (!agentExecutorInstance) {
    log(LogLevel.INFO, "Agent executor not initialized. Initializing now.");
    agentExecutorInstance = await getAgentExecutor();
  }

  const currentDateTime = new Date().toISOString();
  const formattedDateTime = parseDateString(currentDateTime) || currentDateTime;

  try {
    log(LogLevel.INFO, "Executing agent with input and chat history", { userInput, chatHistoryLength: chatHistory.length });
    const result = await agentExecutorInstance.invoke({
      input: userInput,
      chat_history: chatHistory,
      current_date_time: formattedDateTime,
    });
    log(LogLevel.DEBUG, "Agent execution result:", { result });
    return result.output;
  } catch (error: any) {
    log(LogLevel.ERROR, "Error during agent execution:", { error: error.message, stack: error.stack });
    return `An error occurred: ${error.message}`;
  }
}

// Getters for CoreServices
export function getCurrentActiveProjectName(): string | null {
  return currentActiveProjectName;
}

export function getCurrentActiveProjectPath(): string | null {
  return currentActiveProjectPath;
}

export function getActiveProjectPath(): string | null { // This is the new function
  return currentActiveProjectPath;
}