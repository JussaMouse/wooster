import { ChatOpenAI } from '@langchain/openai';
import type { FaissStore } from '@langchain/community/vectorstores/faiss';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { ChatPromptTemplate } from "@langchain/core/prompts";
import { log, LogLevel } from './logger'; // Import new logger
// Logger and config imports related to logging removed
// import { getConfig } from './configLoader';

// Import actual tool functions
import { sendEmail, EmailArgs } from './tools/email';
import { scheduleAgentTask } from './tools/scheduler'; // Import the new tool
import { recallUserContextFunc } from "./tools/userContextTool"; // Import UCM tool function
// import { listFiles } from './tools/filesystem'; // Assuming you will create this
// import { scheduleAgentTask, ScheduleAgentTaskArgs } from './tools/scheduler'; // We'll create this tool's function later

// Define the structure for our tools recognizable by the agent
export interface AgentTool {
  name: string;
  description: string;
  // JSON schema for parameters, for OpenAI function calling
  parameters: { type: "object"; properties: Record<string, { type: string, description: string }>; required?: string[] };
  execute: (args: any, llm?: ChatOpenAI, ragChain?: any) => Promise<string>; // llm and ragChain are optional
}

// Placeholder for RAG chain type
type RagChain = (input: string) => Promise<string>;

// Available tools for the agent
// TODO: Dynamically load tools?
export const availableTools: AgentTool[] = [
  {
    name: 'sendEmail',
    description: 'Sends an email *immediately*. Use this only if the user requests an email to be sent now, without specifying a future time or delay. If a future time is mentioned, use scheduleAgentTask instead.',
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "The recipient email address. If the user says 'me' or 'my email', this tool will attempt to use a pre-configured user email. Otherwise, the specific email address is required." },
        subject: { type: "string", description: "The subject of the email." },
        body: { type: "string", description: "The body content of the email." },
      },
      required: ["to", "subject", "body"],
    },
    execute: async (args: EmailArgs) => sendEmail(args), 
  },
  scheduleAgentTask,
  {
    name: 'queryKnowledgeBase',
    description: "Queries Wooster's internal knowledge base (documents, previous conversations) to find information. Use this when you need to answer a question based on available documents or to get context before performing another action.",
    parameters: {
      type: "object",
      properties: {
        queryString: { type: "string", description: "The question or query to search for in the knowledge base." },
      },
      required: ["queryString"],
    },
    execute: async (args: { queryString: string }, llm?: ChatOpenAI, ragChain?: any) => {
      if (!ragChain) {
        log(LogLevel.WARN, 'queryKnowledgeBase tool called but RAG chain is unavailable.');
        return "Knowledge base (RAG chain) is not available at the moment.";
      }
      log(LogLevel.INFO, 'Agent using tool: queryKnowledgeBase with query: "%s"', args.queryString);
      return ragChain(args.queryString);
    },
  },
  {
    name: "recall_user_context",
    description: "Use this tool to retrieve stored preferences, facts, or directives previously stated by the user that could be relevant for personalizing the current response or action. Query with a concise topic, e.g., 'email formality preferences' or 'project X deadlines'.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "A concise phrase describing the specific user preference, fact, or context needed." },
      },
      required: ["topic"],
    },
    execute: async (args: { topic: string }) => recallUserContextFunc(args),
  }
  // Add other tools like listFiles here once they are created in src/tools/
];

export async function agentRespond(
  userInput: string,
  llm: ChatOpenAI,
  ragChain: RagChain, // RAG chain for fallback and knowledge base tool
  promptTemplate?: ChatPromptTemplate, // Optional, for more complex agent prompting
  isScheduledTaskExecution: boolean = false // New parameter
): Promise<string> {
  log(LogLevel.INFO, 'Agent received input for processing: "%s"', userInput, { isScheduledTask: isScheduledTaskExecution });
  if (isScheduledTaskExecution) {
    log(LogLevel.INFO, "Agent is executing a scheduled task.");
  }

  const llmWithTools = llm.bindTools(
    availableTools.map(tool => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))
  );

  let messages: (HumanMessage | AIMessage | SystemMessage)[] = [];
  if (isScheduledTaskExecution) {
    messages.push(new SystemMessage("You are executing a previously scheduled task. The user's request has already been scheduled. Focus on performing the core action described in the user input. Do not try to schedule the task again, even if the user input mentions a time or a delay. Prioritize tools that perform actions directly, like sending an email, if applicable."));
  }

  if (promptTemplate) {
    const formattedMessages = await promptTemplate.formatMessages({ input: userInput });
    // Assuming formatMessages returns an array of message-like objects
    // We need to ensure they are of the correct type for 'invoke'
    // For simplicity, let's assume they are compatible or convert them
    // This part might need adjustment based on actual ChatPromptTemplate output structure
    messages = messages.concat(formattedMessages as (HumanMessage | AIMessage | SystemMessage)[]);
  } else {
    messages.push(new HumanMessage(userInput));
  }
  
  // Ensure history (if any from promptTemplate) and current HumanMessage are included
  // If promptTemplate doesn't exist, messages will just be [SystemMessage (optional), HumanMessage]
  // If promptTemplate exists, its messages will be added.

  const responseMessage = await llmWithTools.invoke(messages);
  log(LogLevel.DEBUG, "[Agent LLM Interaction] Response received from LLM.", 
    { 
      hasContent: !!responseMessage.content,
      toolCallCount: responseMessage.tool_calls?.length || 0,
      firstToolName: responseMessage.tool_calls?.[0]?.name 
    });

  const toolCalls = responseMessage.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    const scheduleToolCall = toolCalls.find(tc => tc.name === 'scheduleAgentTask');

    if (scheduleToolCall) {
      log(LogLevel.INFO, 'Agent prioritizing tool: %s with args: %j', scheduleToolCall.name, scheduleToolCall.args);
      const schedulerTool = availableTools.find(t => t.name === 'scheduleAgentTask');
      if (schedulerTool) {
        try {
          const toolResult = await schedulerTool.execute(scheduleToolCall.args, llm, ragChain);
          log(LogLevel.INFO, 'Tool %s executed successfully. Result: %s', scheduleToolCall.name, toolResult);
          return toolResult;
        } catch (error: any) {
          log(LogLevel.ERROR, 'Error executing scheduled tool %s. Args: %j', scheduleToolCall.name, scheduleToolCall.args, error);
          return `Error during scheduled tool execution: ${error.message}`;
        }
      } else {
           log(LogLevel.ERROR, "Scheduler tool 'scheduleAgentTask' not found in availableTools.");
           return "I tried to use the scheduler tool, but I couldn't find it.";
      }
    } else {
      const toolCall = toolCalls[0];
      const selectedTool = availableTools.find(t => t.name === toolCall.name);

      if (selectedTool) {
        log(LogLevel.INFO, 'Agent selected tool: %s with args: %j', selectedTool.name, toolCall.args);
        try {
          const toolResult = await selectedTool.execute(toolCall.args, llm, ragChain);
          log(LogLevel.INFO, 'Tool %s executed successfully. Result: %s', selectedTool.name, toolResult);
          return toolResult;
        } catch (error: any) {
          log(LogLevel.ERROR, 'Error executing tool %s. Args: %j', selectedTool.name, toolCall.args, error);
          return `Error during tool execution: ${error.message}`;
        }
      } else {
        log(LogLevel.ERROR, 'Tool %s called by LLM but not found in availableTools.', toolCall.name);
        return "I tried to use a tool, but I couldn't find the right one.";
      }
    }
  } else if (responseMessage.content && typeof responseMessage.content === 'string') {
    log(LogLevel.INFO, "Agent providing direct LLM response (no tool called).");
    return responseMessage.content;
  } else {
    log(LogLevel.INFO, "Agent falling back to RAG chain (no tool called, no direct content).");
    return ragChain(userInput);
  }
} 