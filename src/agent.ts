import { ChatOpenAI } from '@langchain/openai';
import type { FaissStore } from '@langchain/community/vectorstores/faiss';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import { type ChatPromptTemplate } from "@langchain/core/prompts";

// Import actual tool functions
import { sendEmail, EmailArgs } from './tools/email';
import { scheduleAgentTask } from './tools/scheduler'; // Import the new tool
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
    description: 'Queries Wooster\'s internal knowledge base (documents, previous conversations) to find information. Use this when you need to answer a question based on available documents or to get context before performing another action.',
    parameters: {
      type: "object",
      properties: {
        queryString: { type: "string", description: "The question or query to search for in the knowledge base." },
      },
      required: ["queryString"],
    },
    execute: async (args: { queryString: string }, llm?: ChatOpenAI, ragChain?: any) => {
      if (!ragChain) {
        return "Knowledge base (RAG chain) is not available at the moment.";
      }
      console.log(`Agent using queryKnowledgeBase with query: "${args.queryString}"`);
      return ragChain(args.queryString);
    },
  },
  // Add other tools like listFiles here once they are created in src/tools/
];

export async function agentRespond(
  userInput: string,
  llm: ChatOpenAI,
  ragChain: RagChain, // RAG chain for fallback and knowledge base tool
  promptTemplate?: ChatPromptTemplate, // Optional, for more complex agent prompting
  isScheduledTaskExecution: boolean = false // New parameter
): Promise<string> {
  console.log(`Agent received input: "${userInput}"`);
  if (isScheduledTaskExecution) {
    console.log("Agent is executing a scheduled task.");
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

  console.log("LLM response with tool binding:", JSON.stringify(responseMessage, null, 2));

  const toolCalls = responseMessage.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    const scheduleToolCall = toolCalls.find(tc => tc.name === 'scheduleAgentTask');

    if (scheduleToolCall) {
      console.log(`Agent prioritizing tool: ${scheduleToolCall.name} with args: ${JSON.stringify(scheduleToolCall.args)}`);
      const schedulerTool = availableTools.find(t => t.name === 'scheduleAgentTask');
      if (schedulerTool) {
        try {
          return await schedulerTool.execute(scheduleToolCall.args, llm, ragChain);
        } catch (error: any) {
          console.error(`Error executing scheduled tool ${scheduleToolCall.name}:`, error);
          return `Error during scheduled tool execution: ${error.message}`;
        }
      } else {
           return "I tried to use the scheduler tool, but I couldn't find it.";
      }
    } else {
      // Original logic: execute the first tool call if scheduler is not present
      const toolCall = toolCalls[0];
      const selectedTool = availableTools.find(t => t.name === toolCall.name);

      if (selectedTool) {
        console.log(`Agent selected tool: ${selectedTool.name} with args: ${JSON.stringify(toolCall.args)}`);
        try {
          return await selectedTool.execute(toolCall.args, llm, ragChain);
        } catch (error: any) {
          console.error(`Error executing tool ${selectedTool.name}:`, error);
          return `Error during tool execution: ${error.message}`;
        }
      } else {
        return "I tried to use a tool, but I couldn't find the right one.";
      }
    }
  } else if (responseMessage.content && typeof responseMessage.content === 'string') {
    // If no tool is called, and there's direct content, return it.
    // This could be a direct answer from the LLM without needing a tool.
    console.log("Agent providing direct LLM response.");
    return responseMessage.content;
  } else {
    // Fallback if LLM doesn't call a tool and doesn't provide direct content.
    // This was the original RAG fallback.
    console.log("Agent falling back to RAG chain.");
    return ragChain(userInput);
  }
} 