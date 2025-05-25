import { ChatOpenAI } from '@langchain/openai';
import type { FaissStore } from '@langchain/community/vectorstores/faiss';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { ChatPromptTemplate } from "@langchain/core/prompts";
import { log, LogLevel, logLLMInteraction } from './logger'; // Import new logger
import type { AppConfig, EmailConfig } from './configLoader'; // Import AppConfig
// Logger and config imports related to logging removed
// import { getConfig } from './configLoader';

// Import actual tool functions
import { sendEmail as sendEmailActual, EmailArgs } from './tools/email';
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

// Module-scoped variable to hold the loaded application configuration
let agentAppConfig: AppConfig | null = null;

/**
 * Sets the application configuration for the agent module.
 * Called once from index.ts after config is loaded.
 */
export function setAgentConfig(config: AppConfig): void {
  agentAppConfig = config;
  log(LogLevel.INFO, "Agent configuration set.");
}

// Function to dynamically get available tools based on configuration
function getAvailableTools(): AgentTool[] {
  if (!agentAppConfig) {
    log(LogLevel.ERROR, "Agent configuration not set. Cannot determine available tools.");
    return []; // Or throw an error
  }

  const tools: AgentTool[] = [];

  // Email Tool (conditional)
  if (agentAppConfig.email.enabled && agentAppConfig.email.sendingEmailAddress && agentAppConfig.email.emailAppPassword) {
    tools.push({
      name: 'sendEmail',
      description: 'Sends an email *immediately*. Use this only if the user requests an email to be sent now, without specifying a future time or delay. If a future time is mentioned, use scheduleAgentTask instead. To send to yourself (i.e., your configured userPersonalEmailAddress, or sendingEmailAddress if the former is not set), use "SELF_EMAIL_RECIPIENT" as the recipient.',
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "The recipient email address. Use 'SELF_EMAIL_RECIPIENT' to send to your configured personal email address." },
          subject: { type: "string", description: "The subject of the email." },
          body: { type: "string", description: "The body content of the email." },
        },
        required: ["to", "subject", "body"],
      },
      execute: async (args: EmailArgs) => {
        if (!agentAppConfig) throw new Error("Agent config not available for sendEmail"); // Should not happen if tool is added
        return sendEmailActual(args, agentAppConfig.email);
      },
    });
  } else {
    log(LogLevel.INFO, "Email tool not available because it is not enabled or fully configured in config.json.");
  }

  // Scheduler Tool (always available if defined)
  tools.push(scheduleAgentTask); 

  // Knowledge Base Tool
  tools.push({
    name: 'queryKnowledgeBase',
    description: "Queries Wooster's internal knowledge base (documents from the active project) to find information. Use this when you need to answer a question based on available documents or to get context before performing another action.",
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
  });

  // UCM Recall Tool (always available, function itself checks UCM store)
  tools.push({
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
  });
  
  return tools;
}

// Export a function for external modules (like index.ts for 'list tools') to get the current list.
export function getCurrentAvailableTools(): AgentTool[] {
    return getAvailableTools();
}

// Keep the old export for now if something else imports it, but it might become unused.
// export const availableTools: AgentTool[] = []; // Will be dynamically generated

export async function agentRespond(
  userInput: string,
  llm: ChatOpenAI,
  ragChain: RagChain, // RAG chain for fallback and knowledge base tool
  promptTemplate?: ChatPromptTemplate, // Optional, for more complex agent prompting
  isScheduledTaskExecution: boolean = false // New parameter
): Promise<string> {
  if (!agentAppConfig) {
    log(LogLevel.ERROR, "Agent configuration not set. Agent cannot respond.");
    return "Error: Agent is not properly configured.";
  }

  log(LogLevel.INFO, 'Agent received input for processing: "%s"', userInput, { isScheduledTask: isScheduledTaskExecution });
  if (isScheduledTaskExecution) {
    log(LogLevel.INFO, "Agent is executing a scheduled task.");
  }

  const currentAvailableTools = getAvailableTools();
  if (currentAvailableTools.length === 0 && !isScheduledTaskExecution) {
      // If no tools are available (e.g. email not configured) and it's not a scheduled task (which might not need tools other than scheduler implicitly),
      // we might just go straight to RAG or simple LLM response.
      // For now, let it proceed, but this is a point of consideration.
      log(LogLevel.WARN, "No agent tools are currently available based on configuration.");
  }

  const llmWithTools = llm.bindTools(
    currentAvailableTools.map(tool => ({
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
    messages = messages.concat(formattedMessages as (HumanMessage | AIMessage | SystemMessage)[]);
  } else {
    messages.push(new HumanMessage(userInput));
  }
  
  if (agentAppConfig.logging.logAgentLLMInteractions) {
    logLLMInteraction("LLM Invocation with messages:", JSON.stringify(messages, null, 2));
  }
  const responseMessage = await llmWithTools.invoke(messages);
  
  if (agentAppConfig.logging.logAgentLLMInteractions) {
    logLLMInteraction("LLM Response message:", JSON.stringify(responseMessage, null, 2));
  }
  
  const toolCalls = responseMessage.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    // Prioritize scheduleAgentTask if it's called among others (though usually it's exclusive)
    const scheduleToolCall = toolCalls.find(tc => tc.name === 'scheduleAgentTask');
    const toolToExecuteCall = scheduleToolCall || toolCalls[0]; // Execute scheduler first if present

    const selectedTool = currentAvailableTools.find(t => t.name === toolToExecuteCall.name);

    if (selectedTool) {
      log(LogLevel.INFO, 'Agent selected tool: %s with args: %j', selectedTool.name, toolToExecuteCall.args);
      try {
        const toolResult = await selectedTool.execute(toolToExecuteCall.args, llm, ragChain);
        log(LogLevel.INFO, 'Tool %s executed successfully. Result: %s', selectedTool.name, toolResult);
        // If the primary tool was the scheduler, we usually return its result directly.
        // If other tools were called (should be rare if scheduler is also called), this logic might need refinement
        // or the LLM should be prompted to make only one *primary* tool call.
        return toolResult;
      } catch (error: any) {
        log(LogLevel.ERROR, 'Error executing tool %s. Args: %j', selectedTool.name, toolToExecuteCall.args, error);
        return `Error during tool execution: ${error.message}`;
      }
    } else {
      log(LogLevel.ERROR, 'Tool %s called by LLM but not found in availableTools.', toolToExecuteCall.name);
      return "I tried to use a tool, but I couldn't find the right one based on current configuration.";
    }
  } else if (responseMessage.content && typeof responseMessage.content === 'string') {
    log(LogLevel.INFO, "Agent providing direct LLM response (no tool called).");
    return responseMessage.content;
  } else {
    log(LogLevel.INFO, "Agent falling back to RAG chain (no tool called, no direct content).");
    return ragChain(userInput);
  }
} 