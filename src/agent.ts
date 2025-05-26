import { ChatOpenAI, ChatOpenAICallOptions } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
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
import { scheduleAgentTask } from './tools/scheduler';
import { recallUserContextFunc } from "./tools/userContextTool";
import { performWebSearch } from "./tools/webSearchTool"; // Corrected path
// import { queryKnowledgeBaseTool, QueryKnowledgeBaseParams } from './tools/knowledgeBaseTool'; // REMOVE - File missing, handled in agentRespond

import { log, LogLevel, logLLMInteraction } from './logger';
import { AppConfig, EmailConfig } from "./configLoader";
import { logWoosterAction } from "./projectMetadataService"; // CORRECTED PATH

// Define a standard interface for our tools
export interface AgentTool {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call: (params: any) => Promise<string>; 
  // Input schema can be added here for more robust validation if needed later
  // inputSchema?: z.ZodObject<any, any, any>; 
}

let availableTools: AgentTool[] = [];
let appConfigInstance: AppConfig | null = null;

interface StandardToolInput {
    query: string; // Standardizing input for UCM tool for simplicity with current agent prompt
}

interface WebSearchToolInput {
    query: string;
}

export function setAgentConfig(config: AppConfig): void {
  appConfigInstance = config;
  // Initialize tools based on config if necessary
  // For now, tools are hardcoded but could be filtered by config.tools array
  initializeTools(config); 
}

function initializeTools(config: AppConfig): void {
  availableTools = []; // Reset tools

  // SendEmail Tool (wrapping sendEmail function)
  if (sendEmail && config.email) { // Check if function and email config exist
    availableTools.push({
      name: "sendEmail", 
      description: "Sends an email. Use this to send emails to users or other recipients. The input should be an object with 'to', 'subject', and 'body'. Use 'SELF_EMAIL_RECIPIENT' as 'to' to send to your configured personal email.",
      call: async (params: EmailArgs) => {
        if (!appConfigInstance?.email) { // Guard against null config, though checked above
            log(LogLevel.ERROR, "Agent: Email config missing at time of call for sendEmail tool.");
            return "Error: Email configuration is missing.";
        }
        return sendEmail(params, appConfigInstance.email);
      }
    });
    log(LogLevel.INFO, "Agent: sendEmail tool added.");
  } else {
    log(LogLevel.WARN, "Agent: sendEmail tool not added (function not imported or email config missing).");
  }
  
  // ScheduleAgentTask Tool
  if (scheduleAgentTask) { 
    availableTools.push(scheduleAgentTask); 
    log(LogLevel.INFO, "Agent: scheduleAgentTask tool added.");
  } else {
    log(LogLevel.WARN, "Agent: scheduleAgentTask not found or not imported correctly.");
  }
  
  // QueryUserContext Tool (wrapping recallUserContextFunc)
  if (config.ucm?.enabled) {
    if (recallUserContextFunc) { 
      availableTools.push({
        name: "queryUserContext", // Name agent.ts expects
        description: "Queries the User Context Model (UCM) to retrieve facts previously learned about the user or their preferences. Input should be an object with 'query' detailing what information is sought (e.g., 'what is my preferred programming language?').",
        call: async (params: StandardToolInput) => recallUserContextFunc({ topic: params.query }), // Adapt to recallUserContextFunc's {topic: string} input
      });
      log(LogLevel.INFO, "Agent: queryUserContext tool added (UCM enabled).");
    } else {
      log(LogLevel.WARN, "Agent: recallUserContextFunc not found or not imported correctly, though UCM is enabled.");
    }
  } else {
    log(LogLevel.INFO, "Agent: queryUserContext tool not added as UCM is disabled in config.");
  }

  // Add Tavily Web Search tool if API key is configured
  if (config.tavilyApiKey && performWebSearch) {
    availableTools.push({
      name: "webSearch",
      description: "Performs a web search to find current information, real-time event dates, or facts not in the agent's immediate knowledge base. Use for questions about current events, future dates for public events, or specific up-to-date information. Input should be an object with a 'query' key detailing the search term (e.g., {'query': 'when is the next solar eclipse?'}).",
      call: async (params: WebSearchToolInput) => performWebSearch(params.query),
    });
    log(LogLevel.INFO, "Agent: webSearch (Tavily) tool added.");
  } else {
    if (!config.tavilyApiKey) {
      log(LogLevel.INFO, "Agent: webSearch tool not added as Tavily API key is missing in config.");
    } else {
      log(LogLevel.WARN, "Agent: webSearch tool not added because performWebSearch function is not available.");
    }
  }

  // queryKnowledgeBase is not added here as a separate tool import,
  // its functionality is directly invoked via ragQueryFunction in agentRespond.
  log(LogLevel.INFO, `Agent: Total tools initialized: ${availableTools.length}`);
}

export function getCurrentAvailableTools(): AgentTool[] {
  return [...availableTools];
}

// This is a simplified agentRespond. More complex logic will be needed for multi-turn conversations and context management.
export async function agentRespond(
  input: string,
  llm: ChatOpenAI,
  ragQueryFunction: (query: string) => Promise<string>, // For queryKnowledgeBase
  chatHistory: Array<{ role: string; content: string }>, // Added chatHistory
  projectName?: string, // Added projectName for logging
  isScheduledTask: boolean = false // To differentiate calls from scheduler
): Promise<string> {
  log(LogLevel.INFO, `Agent responding to input (isScheduledTask: ${isScheduledTask}): "${input}"`, { projectName, chatHistoryLength: chatHistory.length });

  const systemMessageContent = `You are Wooster, a helpful AI assistant.
  You have access to the following tools:
  ${availableTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

  When deciding which tool to use, consider the user's query carefully.
  If a user asks for something to be done at a later time (e.g., "in 5 minutes", "tomorrow at 6pm"), you MUST use the 'scheduleAgentTask' tool.
  The 'taskPayload' for 'scheduleAgentTask' should be the original user query that needs to be executed later, including any specific details.
  For example, if the user says "email me the weather report tomorrow at 6am", the 'taskPayload' for scheduleAgentTask should be "email me the weather report tomorrow at 6am".
  
  If you need to find out information that might be in project documents or general knowledge, use 'queryKnowledgeBase'. This is good for information specific to the user's active project.
  If you need to recall specific facts about the user's general preferences or information they've previously told you outside of a specific project, use 'queryUserContext'.
  If you need to find current information, specific dates for public events (like holidays or festivals), or facts not in your existing knowledge base and not specific to the user's project documents, use 'webSearch'.
  If you need to send an email, use 'sendEmail'.

  Respond with a JSON object matching the tool to use, and the parameters for that tool.
  The JSON object should have a "tool" key (the name of the tool) and a "toolInput" key (an object with the parameters for the tool).
  Example for webSearch: {"tool": "webSearch", "toolInput": {"query": "current weather in London"}}
  Example for sendEmail: {"tool": "sendEmail", "toolInput": {"to": "user@example.com", "subject": "Hello", "body": "Hi there!"}}
  If no tool is appropriate, or if you can answer directly, respond with a JSON object with a "tool" key set to "finalAnswer" and a "toolInput" key containing your answer as a string.
  Example: {"tool": "finalAnswer", "toolInput": "The capital of France is Paris."}
  
  If the user's query involves a time component for a future action (e.g. "in 5 minutes", "tomorrow morning"), you MUST use the scheduleAgentTask. Do not attempt to perform the action directly if it's meant for later.
  
  If multiple tools seem appropriate for a single user query (e.g. scheduling an email), prioritize the tool that defers the core action if a time delay is specified. For example, for "email me the weather report in 1 hour", the primary tool should be 'scheduleAgentTask' with the taskPayload "email me the weather report". The actual fetching of the weather report and sending the email will happen when the scheduled task executes. Do not call sendEmail or webSearch directly in this case.
  
  However, if the user asks to "send an email now and also schedule a reminder", then it is appropriate to identify both tools. For now, the system will execute the first tool call identified.
  
  Current date and time is: ${new Date().toISOString()}`;

  // Prepare messages for the LLM, including system prompt, history, and current input
  const messages: BaseMessage[] = [
    new SystemMessage(systemMessageContent),
    // Map chatHistory to BaseMessage instances
    ...chatHistory.map(msg => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content);
      } else if (msg.role === 'assistant') {
        return new AIMessage(msg.content);
      } else if (msg.role === 'system') {
        // System messages in history might need special handling or filtering
        // For now, let's include them as generic AIMessages or filter them
        // depending on how your LLM expects history.
        // Langchain's AIMessage is typically for assistant's previous responses.
        // Let's assume system messages from history aren't typically passed this way
        // or should be consolidated into the main system prompt.
        // For simplicity, we'll filter them out here, but this could be revisited.
        return null; 
      }
      return null; // Should not happen with well-formed history
    }).filter(Boolean) as BaseMessage[], // Filter out any nulls
    new HumanMessage(input),
  ];

  if (appConfigInstance?.logging.logAgentLLMInteractions) {
    logLLMInteraction('Agent Prompt', messages.map(m => ({ type: m._getType(), content: m.content }) ));
  }

  const response = await llm.invoke(messages);
  let toolResponse = "";

  if (appConfigInstance?.logging.logAgentLLMInteractions) {
    logLLMInteraction('Agent Raw LLM Response', { content: response.content });
  }

  try {
    const toolChoice = JSON.parse(response.content as string);
    log(LogLevel.DEBUG, "Agent parsed LLM tool choice:", toolChoice);

    if (toolChoice.tool && toolChoice.toolInput) {
      const selectedTool = availableTools.find(t => t.name === toolChoice.tool);

      if (selectedTool) {
        log(LogLevel.INFO, `Agent selected tool: ${selectedTool.name} with input:`, toolChoice.toolInput);
        if (selectedTool.name === 'queryKnowledgeBase') {
          // Special handling for queryKnowledgeBase as it uses the passed-in RAG function
          toolResponse = await ragQueryFunction(toolChoice.toolInput.query);
        } else {
          toolResponse = await selectedTool.call(toolChoice.toolInput);
        }
        log(LogLevel.INFO, `Agent tool "${selectedTool.name}" executed. Result: ${toolResponse}`);

        // Log Wooster Action
        if (projectName) {
          try {
            await logWoosterAction(projectName, selectedTool.name, toolChoice.toolInput, toolResponse);
            log(LogLevel.INFO, `Wooster action logged for project: ${projectName}, tool: ${selectedTool.name}`);
          } catch (logError) {
            log(LogLevel.ERROR, `Failed to log Wooster action for project ${projectName}:`, logError);
          }
        }


      } else if (toolChoice.tool === "finalAnswer") {
        toolResponse = toolChoice.toolInput as string;
        log(LogLevel.INFO, `Agent providing final answer: ${toolResponse}`);
      } else {
        toolResponse = "I'm not sure how to respond to that, or the tool chosen was invalid.";
        log(LogLevel.WARN, `Agent: Invalid tool choice or 'finalAnswer' structure from LLM: ${toolChoice.tool}`);
      }
    } else {
      // If LLM doesn't return a valid JSON tool/finalAnswer structure, treat its response as a direct answer.
      toolResponse = response.content as string;
      log(LogLevel.WARN, "Agent: LLM response was not a valid tool/finalAnswer JSON. Treating as direct answer.", { responseContent: response.content});
    }
  } catch (error) {
    log(LogLevel.ERROR, "Agent: Error parsing LLM response or executing tool. LLM raw response:", response.content, error);
    // Fallback: return the raw LLM content if parsing fails or it's not a structured tool call.
    // This can happen if the LLM directly answers without using the JSON format.
    toolResponse = response.content as string; 
  }

  if (appConfigInstance?.logging.logAgentLLMInteractions && !isScheduledTask) {
    logLLMInteraction('Agent Final Response', { content: toolResponse });
  }
  return toolResponse;
} 