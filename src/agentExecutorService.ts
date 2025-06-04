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
let currentActiveProjectName: string = 'home'; // Default
let currentActiveProjectPath: string = ''; 
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
      log(LogLevel.WARN, `Plugin tool \"${tool.name}\" conflicts with a core tool name. Core tool \"${allToolsMap.get(tool.name)?.description.substring(0,50)}...\" will be used.`)
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
): Promise<void> {
  currentActiveProjectName = initialProjectName;
  currentActiveProjectPath = initialProjectPath;
  projectVectorStoreInstance = initialProjectStore;
  embeddingsInstance = initialEmbeddings; // Store the embeddings instance
  projectStoreAppConfig = configForProjectStore; // Store the appConfig for project store use

  // appConfig for agent tools and LLM is still loaded via getConfig() in initializeTools if needed
  // Or, if configForProjectStore is the same appConfig, we can assign it to the module 'appConfig' here too.
  // For now, let's assume initializeTools will fetch its own appConfig as it does currently.

  log(LogLevel.INFO, `AgentExecutorService: Initialized with project "${initialProjectName}". Vector Store ready.`);
}

export async function setActiveProject(newProjectName: string): Promise<void> {
  if (!embeddingsInstance || !projectStoreAppConfig) {
    log(LogLevel.ERROR, "AgentExecutorService.setActiveProject: Embeddings or AppConfig for project store not initialized.");
    // This might happen if initializeAgentExecutorService was not called correctly.
    // Or if this is called before Wooster main startup has set these.
    // Consider throwing an error or specific handling if this state is critical.
    return;
  }

  const newProjectPath = path.join(projectBasePath, newProjectName);

  if (!fs.existsSync(newProjectPath) || !fs.statSync(newProjectPath).isDirectory()) {
    log(LogLevel.ERROR, `AgentExecutorService.setActiveProject: Project directory not found at ${newProjectPath}`);
    // Maybe throw an error to signal failure to the caller
    throw new Error(`Project '${newProjectName}' not found at ${newProjectPath}.`);
  }

  log(LogLevel.INFO, `AgentExecutorService: Attempting to set active project to "${newProjectName}"`);
  try {
    projectVectorStoreInstance = await initializeProjectVectorStore(
      newProjectName,
      newProjectPath,
      embeddingsInstance,
      projectStoreAppConfig
    );
    currentActiveProjectName = newProjectName;
    currentActiveProjectPath = newProjectPath;
    agentExecutorInstance = null; // Force re-creation of agent with new project context in prompt
    log(LogLevel.INFO, `AgentExecutorService: Active project successfully set to "${newProjectName}". Vector store updated.`);
  } catch (error) {
    log(LogLevel.ERROR, `AgentExecutorService: Failed to set active project to "${newProjectName}".`, { error });
    // Re-throw or handle as appropriate. The project was not changed.
    throw error; 
  }
}

export async function executeAgent(
  userInput: string,
  chatHistory: BaseMessage[],
): Promise<string> {
  log(LogLevel.INFO, "AgentExecutorService: Executing agent", { userInput, chatHistoryLength: chatHistory.length });
  
  const executor = await getAgentExecutor(); // This will now build with currentActiveProjectName in prompt
  const currentDateTime = new Date().toLocaleString();

  try {
    const processedChatHistory = chatHistory.map(msg => {
      if (msg._getType() === 'human' && typeof msg.content === 'string') {
        return new HumanMessage({ content: [{ type: "text", text: msg.content }], name: msg.name, id: msg.id });
      }
      if (msg._getType() === 'ai' && typeof msg.content === 'string') {
        const aiMsg = msg as AIMessage;
        return new AIMessage({ 
          content: [{ type: "text", text: aiMsg.content }], 
          name: aiMsg.name, 
          id: aiMsg.id,
          tool_calls: aiMsg.tool_calls, 
          invalid_tool_calls: aiMsg.invalid_tool_calls,
          additional_kwargs: aiMsg.additional_kwargs,
          response_metadata: aiMsg.response_metadata,
        });
      }
      if (msg._getType() === 'tool' && typeof msg.content === 'string') {
        const toolMsg = msg as ToolMessage;
        return new ToolMessage({ 
            content: [{ type: "text", text: toolMsg.content }], 
            tool_call_id: toolMsg.tool_call_id,
            name: toolMsg.name, 
            id: toolMsg.id,
            additional_kwargs: toolMsg.additional_kwargs,
         });
      }
      return msg;
    });

    log(LogLevel.DEBUG, "executeAgent: Processed chat history", { processedChatHistory });

    const result = await executor.invoke({
      input: userInput,
      chat_history: processedChatHistory,
      current_date_time: currentDateTime,
      current_project_name: currentActiveProjectName, // Use dynamic project name
    });

    log(LogLevel.DEBUG, "AgentExecutorService: Raw execution result", { result });
    if (result && typeof result.output === 'string') {
      log(LogLevel.INFO, "AgentExecutorService: Agent execution successful", { output: result.output });
      return result.output;
    }
    log(LogLevel.ERROR, "AgentExecutorService: Agent execution did not return a string output", { result });
    return "I received an unexpected response structure from the agent.";
  } catch (error) {
    log(LogLevel.ERROR, "AgentExecutorService: Error during agent execution", { error });
    return `An error occurred while processing your request: ${error instanceof Error ? error.message : String(error)}`;
  }
}