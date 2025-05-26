import { ChatOpenAI } from "@langchain/openai";
import { DynamicTool } from "@langchain/core/tools";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";

import { AppConfig, getConfig } from "./configLoader";
import { log, LogLevel } from "./logger";
import { performWebSearch, initializeWebSearchTool as initTavilyTool } from "./tools/webSearchTool";
import { recallUserContextFunc, setUserContextStore as setGlobalUCMStore } from "./tools/userContextTool";
import { createAgentTaskSchedule } from "./scheduler/schedulerService";
import { parseDateString } from "./scheduler/scheduleParser";
import { getPluginAgentTools } from "./pluginManager";

let userContextStoreInstance: FaissStore | null = null;
let projectVectorStoreInstance: FaissStore | null = null;
let tools: DynamicTool[] = [];
let agentExecutorInstance: AgentExecutor | null = null;
let appConfig: AppConfig;
let agentLlm: ChatOpenAI;

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

  initTavilyTool(appConfig);

  const coreTools: DynamicTool[] = [];

  const webSearch = new DynamicTool({
    name: "web_search",
    description: "Searches the web for current information, news, facts, or any topic that requires up-to-date knowledge beyond the AI's training data. Input should be a concise search query string.",
    func: async (input: string) => performWebSearch(input),
  });
  coreTools.push(webSearch);

  const recallUserContext = new DynamicTool({
    name: "recall_user_context",
    description: "Recalls specific facts, preferences, or context about the current user to personalize responses or remember user-specific information. Input should be a question or topic to recall (e.g., 'my favorite color', 'what did I say about project X').",
    func: async (input: string) => {
      if (!userContextStoreInstance) {
        log(LogLevel.ERROR, "User context store not initialized for recall_user_context tool.");
        return "User Context Memory store is not currently available for this tool.";
      }
      return recallUserContextFunc({ topic: input });
    },
  });
  coreTools.push(recallUserContext);

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

        const historyAwareRetriever = await createHistoryAwareRetriever({
            llm: agentLlm, 
            retriever,
            rephrasePrompt: historyAwarePrompt,
        });

        const documentChain = await createStuffDocumentsChain({
            llm: agentLlm,
            prompt: answerPrompt,
        });

        const retrievalChain = await createRetrievalChain({
            retriever: historyAwareRetriever,
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

  const scheduleTaskTool = new DynamicTool({
    name: "scheduleAgentTask",
    description: "Schedules a task for the agent to perform at a specified future time. Input MUST be an object with three keys: 'taskPayload' (string: the core task for the agent to execute later, e.g., 'What is the weather in London?'), 'timeExpression' (string: a natural language expression for when the task should run, e.g., 'tomorrow at 10am', 'in 2 hours'), and 'humanReadableDescription' (string: a brief description of the task, e.g., 'Check London weather').",
    func: async (toolInput: string | Record<string, any>) => {
      let args: ScheduleAgentTaskArgs;
      if (typeof toolInput === 'string') {
        try {
          args = JSON.parse(toolInput) as ScheduleAgentTaskArgs;
        } catch (e) {
          return "Invalid input for scheduleAgentTask: Input string is not valid JSON. Expected object with 'taskPayload', 'timeExpression', 'humanReadableDescription'.";
        }
      } else if (typeof toolInput === 'object' && toolInput !== null) {
        args = toolInput as ScheduleAgentTaskArgs;
      } else {
        return "Invalid input type for scheduleAgentTask. Expected JSON string or object.";
      }

      const { taskPayload, timeExpression, humanReadableDescription } = args;
      log(LogLevel.INFO, '[AgentExecutorTool:scheduleAgentTask] Called', { taskPayload, timeExpression, humanReadableDescription });

      if (!taskPayload || !timeExpression || !humanReadableDescription) {
        log(LogLevel.WARN, '[AgentExecutorTool:scheduleAgentTask] Missing required arguments.', args);
        return "Missing required arguments. I need 'taskPayload', 'timeExpression', and 'humanReadableDescription'.";
      }

      const scheduleDate = parseDateString(timeExpression);
      if (!scheduleDate) {
        log(LogLevel.WARN, '[AgentExecutorTool:scheduleAgentTask] Could not parse timeExpression.', { timeExpression });
        return `Could not understand the time expression: "${timeExpression}". Please try a different phrasing.`;
      }
      if (scheduleDate.getTime() <= Date.now()) {
        log(LogLevel.WARN, '[AgentExecutorTool:scheduleAgentTask] Attempted to schedule in the past.', { scheduleDate: scheduleDate.toLocaleString(), timeExpression });
        return `The specified time (${scheduleDate.toLocaleString()}) is in the past. Please provide a future time.`;
      }
      try {
        const reminder = await createAgentTaskSchedule(humanReadableDescription, scheduleDate, taskPayload);
        if (reminder && reminder.id) {
          const confirmationMessage = `Okay, I've scheduled "${humanReadableDescription}" for ${scheduleDate.toLocaleString()}. (ID: ${reminder.id})`;
          log(LogLevel.INFO, '[AgentExecutorTool:scheduleAgentTask] Task scheduled successfully.', { reminderId: reminder.id });
          return confirmationMessage;
        } else {
          log(LogLevel.ERROR, '[AgentExecutorTool:scheduleAgentTask] createAgentTaskSchedule returned null or no ID.');
          return "There was an unexpected error scheduling your task.";
        }
      } catch (error: any) {
        log(LogLevel.ERROR, '[AgentExecutorTool:scheduleAgentTask] Error during execution:', { error });
        return `Failed to schedule task: ${error.message}`;
      }
    },
  });
  coreTools.push(scheduleTaskTool);

  const pluginTools = getPluginAgentTools();
  log(LogLevel.INFO, "Retrieved %d tools from plugins.", pluginTools.length);

  const allToolsMap = new Map<string, DynamicTool>();
  coreTools.forEach(tool => allToolsMap.set(tool.name, tool));
  pluginTools.forEach(tool => {
    if (!allToolsMap.has(tool.name)) {
      allToolsMap.set(tool.name, tool);
    } else {
      log(LogLevel.WARN, `Plugin tool "${tool.name}" conflicts with a core tool name. Core tool "${allToolsMap.get(tool.name)?.description.substring(0,50)}..." will be used.`)
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
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", 
      "You are Wooster, a helpful AI assistant. Your goal is to assist the user with their tasks and questions." +
      "You have access to the following tools. Only use tools if necessary. If you can answer directly, do so." +
      "When using a tool, you must provide your reasoning and the exact input to the tool." +
      "If a tool provides an error or unusable results, try to analyze the error and retry if appropriate, or inform the user." +
      "Always strive to be helpful, polite, and provide clear, concise answers." +
      "Current date and time: {current_date_time}"
    ],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const agent = await createOpenAIToolsAgent({
    llm: agentLlm,
    tools,
    prompt,
  });

  agentExecutorInstance = new AgentExecutor({
    agent,
    tools,
    verbose: appConfig.logging.logAgentLLMInteractions,
    handleParsingErrors: (err: unknown) => {
      log(LogLevel.ERROR, "Agent parsing error:", { error: err });
      return "There was an issue parsing the response. Please try rephrasing your request.";
    },
  });
  log(LogLevel.INFO, "AgentExecutor instance created.");
  return agentExecutorInstance;
}

export async function initializeAgentExecutorService(
  ucmStore?: FaissStore,
  projectStore?: FaissStore
): Promise<void> {
  appConfig = await getConfig();
  if (ucmStore) {
    userContextStoreInstance = ucmStore;
    setGlobalUCMStore(ucmStore);
    log(LogLevel.INFO, "AgentExecutorService: User Context Store initialized.");
  }
  if (projectStore) {
    projectVectorStoreInstance = projectStore;
    log(LogLevel.INFO, "AgentExecutorService: Project Vector Store initialized with FaissStore.");
  }
  // Ensure tools are not initialized here, but lazily by getAgentExecutor later
}

export async function executeAgent(
  userInput: string,
  chatHistory: BaseMessage[],
): Promise<string> {
  log(LogLevel.INFO, "AgentExecutorService: Executing agent", { userInput, chatHistoryLength: chatHistory.length });
  
  const executor = await getAgentExecutor();
  const currentDateTime = new Date().toLocaleString();

  try {
    const result = await executor.invoke({
      input: userInput,
      chat_history: chatHistory,
      current_date_time: currentDateTime,
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