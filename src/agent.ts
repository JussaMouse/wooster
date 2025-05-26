import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { executeAgent } from "./agentExecutorService";
// import { PromptTemplate } from "@langchain/core/prompts"; // Less likely needed for this direct tool use pattern
// import { ToolExecutor } from "@langchain/langgraph/prebuilt"; // REMOVE
// import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents"; // REMOVE
// import { RunnableSequence } from "@langchain/core/runnables"; // REMOVE
// import { formatToOpenAIToolMessages } from "langchain/agents/format_scratchpad/openai_tools"; // REMOVE
// import { OpenAIToolsAgentOutputParser } from "langchain/agents/openai/output_parser"; // REMOVE
// import { TavilySearchResults } from "@langchain/community/tools/tavily_search_results"; // REMOVE
// import { createRetrieverTool } from "langchain/tools/retriever"; // REMOVE
// import type { FaissStore } from "@langchain/community/vectorstores/faiss"; // REMOVE if retriever tool is gone


import { sendEmail, EmailArgs } from './tools/email';
// import { scheduleAgentTask } from './tools/scheduler';
import { recallUserContextFunc } from "./tools/userContextTool";
import { performWebSearch } from "./tools/webSearchTool"; // Corrected path
// import { queryKnowledgeBaseTool, QueryKnowledgeBaseParams } from './tools/knowledgeBaseTool'; // REMOVE - File missing, handled in agentRespond

import { log, LogLevel, logLLMInteraction } from './logger';
import { AppConfig /*, EmailToolConfig */ } from "./configLoader";
// import { logWoosterAction } from "./projectMetadataService"; // CORRECTED PATH

let appConfigInstance: AppConfig | null = null;

export function setAgentConfig(config: AppConfig): void {
  appConfigInstance = config;
  log(LogLevel.INFO, "Agent: AppConfig set. AgentExecutorService will handle tool and LLM initialization.");
}

export async function agentRespond(
  input: string,
  chatHistory: Array<{ role: string; content: string }>, 
  projectName?: string, 
  isScheduledTask: boolean = false 
): Promise<string> {
  log(LogLevel.INFO, `Agent responding to input (isScheduledTask: ${isScheduledTask}): "${input}"`, { projectName, chatHistoryLength: chatHistory.length });

  if (!appConfigInstance) {
    log(LogLevel.ERROR, "Agent: AppConfig not set. Call setAgentConfig first.");
    // Consider throwing an error here or ensuring AppConfig is always available
    return "Error: Agent configuration is missing. Please ensure setAgentConfig has been called.";
  }

  const mappedChatHistory: BaseMessage[] = chatHistory.map(msg => {
    if (msg.role === 'user' || msg.role === 'human') {
      return new HumanMessage(msg.content);
    } else if (msg.role === 'assistant' || msg.role === 'ai') {
      return new AIMessage(msg.content);
    } else if (msg.role === 'system') {
      // AgentExecutor prompts can usually handle system messages in history if designed for it.
      return new SystemMessage(msg.content); 
    }
    log(LogLevel.WARN, `Unknown role in chat history: ${msg.role}. Skipping message.`);
    return null; // Should be filtered out by .filter(Boolean)
  }).filter(Boolean) as BaseMessage[];

  let agentResponse: string;
  try {
    // Delegate to AgentExecutorService for the core logic
    agentResponse = await executeAgent(input, mappedChatHistory);
    log(LogLevel.INFO, `Agent received response from AgentExecutorService successfully.`);
  } catch (error) {
    log(LogLevel.ERROR, "Agent: Error calling AgentExecutorService.executeAgent", { error });
    agentResponse = "Sorry, I encountered an internal error while processing your request. The AgentExecutorService might be misconfigured or experienced an issue.";
  }
  
  // Detailed LLM interaction logging is handled by AgentExecutorService (via verbose or callbacks)
  // Log the final response that will be sent to the user.
  if (appConfigInstance?.logging.logAgentLLMInteractions && !isScheduledTask) {
    logLLMInteraction('Agent Final Output to User', { content: agentResponse });
  }
  return agentResponse;
} 