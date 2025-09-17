import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { DynamicTool } from "@langchain/core/tools";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BaseMessage } from "@langchain/core/messages";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import * as fs from 'fs';
import * as path from 'path';

import { AppConfig, getConfig } from "./configLoader";
import { log, LogLevel } from "./logger";
import { parseDateString } from "./scheduler/scheduleParser";
import { getPluginAgentTools } from "./pluginManager";
import { ChatDebugFileCallbackHandler } from "./chatDebugFileCallbackHandler";
import { scheduleAgentTaskTool } from "./schedulerTool";
import { createFileTool, readFileTool } from './fileSystemTool';
import { initializeProjectVectorStore } from './projectStoreManager';

let projectVectorStoreInstance: MemoryVectorStore | null = null;
let tools: any[] = [];
let agentExecutorInstance: AgentExecutor | null = null;
let appConfig: AppConfig;
let agentLlm: ChatOpenAI;

// New module-level variables for active project management
let currentActiveProjectName: string | null = null;
let currentActiveProjectPath: string | null = null;
let embeddingsInstance: OpenAIEmbeddings | null = null;
let projectStoreAppConfig: AppConfig | null = null; // To be used by initializeProjectVectorStore

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

export async function queryKnowledgeBase(input: string, runManager?: any): Promise<string> {
  if (!projectVectorStoreInstance) {
    log(LogLevel.ERROR, "Project vector store not initialized for queryKnowledgeBase tool.");
    return "Error: Knowledge base not initialized.";
  }
  if (!agentLlm) {
    log(LogLevel.ERROR, "Agent LLM not initialized for queryKnowledgeBase tool.");
    return "Error: Agent LLM not initialized.";
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
}

async function initializeTools() {
  appConfig = await getConfig();
  
  // Initialize model router
  const { initializeModelRouter } = await import('./routing/ModelRouterService');
  const modelRouter = initializeModelRouter(appConfig);
  
  // Get model through router (Phase 1: returns existing ChatOpenAI)
  agentLlm = await modelRouter.selectModel({ 
    task: 'COMPLEX_REASONING',
    context: modelRouter.createContext('COMPLEX_REASONING')
  }) as ChatOpenAI;

  // Log which model/provider is active
  try {
    const info = (modelRouter as any).getCurrentModelInfo?.();
    if (info) {
      const provider = info.provider === 'local' ? 'LOCAL' : 'OPENAI';
      const at = info.baseURL ? ` @ ${info.baseURL}` : '';
      log(LogLevel.INFO, `ModelRouter: Active model => [${provider}] ${info.model}${at}`);
    }
  } catch {}

  const coreTools: any[] = [];

  const queryKnowledgeBaseTool = new DynamicTool({
    name: "queryKnowledgeBase",
    description:
      "Queries the project-specific knowledge base to answer questions. Use this for questions about the project's content, files, or context.",
    func: queryKnowledgeBase,
  });
  coreTools.push(queryKnowledgeBaseTool);

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

async function getAgentExecutor(forceRecreate = false): Promise<AgentExecutor> {
  if (agentExecutorInstance && !forceRecreate) {
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
    `
Your current active project is '${currentActiveProjectName}'. For tools requiring a project name, like 'create_file', you MUST use this exact active project name by default.
Only use a different project name if the user explicitly uses the phrase 'in project [name]' or 'save to project [name]' or similar direct project specification.
Do NOT extract project names from journal entries, file content, or casual mentions - always use the active project '${currentActiveProjectName}' unless explicitly told otherwise.
If you are unsure which project to use for an operation that requires one, always use the active project '${currentActiveProjectName}'.
Do not change the active project context itself without explicit instruction.

IMPORTANT: When adding journal entries, always append to the project's main journal file which is named '${currentActiveProjectName}.md' in the active project directory. Do NOT create separate 'journal.md' files.
To add content to an existing file (e.g., add an entry to a log file), you should first use the 'read_file_content' tool to get the current content. Then, append your new content to the existing content in your internal thought process. Finally, use the 'create_file' tool to save the entire new combined content back to the same file. This ensures you don't overwrite existing data unintentionally when the user asks to add something.

TOOLS-USAGE POLICY:
- Never output or print code when invoking tools. Call tools directly using the Tools API.
- If the user says "Use the tool X ...", you MUST call tool X and not print example code.
- For sending Signal messages: ALWAYS use the 'sendSignal' tool (alias: 'signal_notify'). Do not ask for a recipient; the plugin uses environment defaults (SIGNAL_GROUP_ID → SIGNAL_TO → Note-to-Self on SIGNAL_CLI_NUMBER). Provide the message as input (prefer JSON: {"message":"..."}).
- If a tool returns an error, report it succinctly; otherwise confirm success.

Current date and time: {current_date_time}`;

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
  initialProjectStore: MemoryVectorStore,
  initialEmbeddings: OpenAIEmbeddings,
  configForProjectStore: AppConfig
): Promise<AgentExecutor> {
  agentExecutorInstance = null; // Reset agent executor to rebuild on re-initialization
  currentActiveProjectName = initialProjectName.trim();
  currentActiveProjectPath = initialProjectPath.trim();
  projectVectorStoreInstance = initialProjectStore;
  embeddingsInstance = initialEmbeddings;
  projectStoreAppConfig = configForProjectStore;

  // Since we've reset the agent, we need to get the new one.
  const executor = await getAgentExecutor();
  log(LogLevel.INFO, `AgentExecutorService initialized for project: ${currentActiveProjectName}`);
  return executor;
}

export async function setActiveProject(newProjectName: string): Promise<void> {
  if (currentActiveProjectName === newProjectName) {
    log(LogLevel.INFO, `Project \"${newProjectName}\" is already active.`);
    return;
  }

  log(LogLevel.INFO, `Switching active project to: \"${newProjectName}\"`);
  
  // Guard against re-entrancy or null config
  if (!projectStoreAppConfig || !embeddingsInstance) {
    log(LogLevel.ERROR, 'Cannot switch project: project store dependencies not initialized.');
    throw new Error('Project store dependencies not available for project switch.');
  }

  const newProjectDir = path.join(process.cwd(), 'projects', newProjectName);
  if (!fs.existsSync(newProjectDir)) {
    fs.mkdirSync(newProjectDir, { recursive: true });
    log(LogLevel.INFO, `Created new project directory at: ${newProjectDir}`);
  }

  // Re-initialize the vector store for the new project.
  const newProjectStore = await initializeProjectVectorStore(newProjectName, embeddingsInstance, projectStoreAppConfig);

  // Update the global state
  currentActiveProjectName = newProjectName;
  currentActiveProjectPath = newProjectDir;
  projectVectorStoreInstance = newProjectStore;
  
  // Re-initialize the agent executor to get the new project context in the prompt
  await getAgentExecutor(true); // Force re-creation of the agent executor
  log(LogLevel.INFO, `Successfully switched to project \"${newProjectName}\".`);
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