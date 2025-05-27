import fs from 'fs';
import path from 'path';
import { BaseCallbackHandler, CallbackHandlerMethods } from "@langchain/core/callbacks/base";
import { Serialized } from "langchain/load/serializable";
import { AgentAction as CoreAgentAction, AgentFinish as CoreAgentFinish } from "@langchain/core/agents";
import { LLMResult } from "@langchain/core/outputs";
import { BaseMessage } from '@langchain/core/messages';

// Ensure the logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const chatDebugLogPath = path.join(logsDir, 'chat.debug');

// A simple writable stream for the chat debug log
const chatDebugStream = fs.createWriteStream(chatDebugLogPath, { flags: 'a' });

function safelyStringify(obj: any): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return `[Unserializable Object: ${e instanceof Error ? e.message : String(e)}]`;
  }
}

export class ChatDebugFileCallbackHandler extends BaseCallbackHandler implements CallbackHandlerMethods {
  name = "ChatDebugFileCallbackHandler";

  constructor() {
    super();
    chatDebugStream.write(`\n--- New Session: ${new Date().toISOString()} ---\n`);
  }

  private appendToLog(text: string): void {
    chatDebugStream.write(text + "\n");
  }

  handleLLMStart(llm: Serialized, prompts: string[], runId: string, parentRunId?: string | undefined, extraParams?: Record<string, unknown> | undefined, tags?: string[] | undefined, metadata?: Record<string, unknown> | undefined): void | Promise<void> {
    this.appendToLog(`[LLM_START] Run ID: ${runId}`);
    this.appendToLog(`  LLM: ${safelyStringify(llm)}`);
    this.appendToLog(`  Prompts:\n${prompts.map(p => `    ${p}`).join('\n')}`);
    if (extraParams) this.appendToLog(`  Extra Params: ${safelyStringify(extraParams)}`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
    if (metadata) this.appendToLog(`  Metadata: ${safelyStringify(metadata)}`);
  }

  handleChatModelStart(llm: Serialized, messages: BaseMessage[][], runId: string, parentRunId?: string | undefined, extraParams?: Record<string, unknown> | undefined, tags?: string[] | undefined, metadata?: Record<string, unknown> | undefined, name?: string | undefined): void | Promise<void> {
    this.appendToLog(`[CHAT_MODEL_START] Run ID: ${runId} (${name || 'Unknown'}) `);
    this.appendToLog(`  LLM: ${safelyStringify(llm)}`);
    this.appendToLog(`  Messages:\n${messages.map(mgroup => mgroup.map(m => `    [${m._getType()}] ${m.content instanceof Array ? m.content.map(part => part.type === 'text' ? part.text : '{non-text-part}').join(' ') : m.content}`).join('\n')).join('\n---\n')}`);
    if (extraParams) this.appendToLog(`  Extra Params: ${safelyStringify(extraParams)}`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
    if (metadata) this.appendToLog(`  Metadata: ${safelyStringify(metadata)}`);
  }

  handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): void | Promise<void> {
    this.appendToLog(`[LLM_END] Run ID: ${runId}`);
    this.appendToLog(`  Output: ${safelyStringify(output)}`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
  }

  handleLLMError(err: Error, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): void | Promise<void> {
    this.appendToLog(`[LLM_ERROR] Run ID: ${runId}`);
    this.appendToLog(`  Error: ${err.message}\n${err.stack || ''}`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
  }

  handleChainStart(chain: Serialized, inputs: Record<string, any>, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, metadata?: Record<string, unknown> | undefined, runType?: string | undefined, name?: string | undefined): void | Promise<void> {
    this.appendToLog(`[CHAIN_START] Run ID: ${runId} (${name || 'Unknown Chain'})`);
    this.appendToLog(`  Chain: ${safelyStringify(chain)}`);
    this.appendToLog(`  Inputs: ${safelyStringify(inputs)}`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
    if (metadata) this.appendToLog(`  Metadata: ${safelyStringify(metadata)}`);
  }

  handleChainEnd(outputs: Record<string, any>, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, kwargs?: { inputs?: Record<string, any> | undefined; }): void | Promise<void> {
    this.appendToLog(`[CHAIN_END] Run ID: ${runId}`);
    this.appendToLog(`  Outputs: ${safelyStringify(outputs)}`);
    if (kwargs?.inputs) this.appendToLog(`  (Original Inputs): ${safelyStringify(kwargs.inputs)}`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
  }

  handleChainError(err: Error, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, kwargs?: { inputs?: Record<string, any> | undefined; }): void | Promise<void> {
    this.appendToLog(`[CHAIN_ERROR] Run ID: ${runId}`);
    this.appendToLog(`  Error: ${err.message}\n${err.stack || ''}`);
    if (kwargs?.inputs) this.appendToLog(`  (Original Inputs): ${safelyStringify(kwargs.inputs)}`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
  }

  handleToolStart(tool: Serialized, input: string, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined, metadata?: Record<string, unknown> | undefined, name?: string | undefined): void | Promise<void> {
    this.appendToLog(`[TOOL_START] Run ID: ${runId} (${name || 'Unknown Tool'})`);
    this.appendToLog(`  Tool: ${safelyStringify(tool)}`);
    this.appendToLog(`  Input: "${input}"`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
    if (metadata) this.appendToLog(`  Metadata: ${safelyStringify(metadata)}`);
  }

  handleToolEnd(output: string, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): void | Promise<void> {
    this.appendToLog(`[TOOL_END] Run ID: ${runId}`);
    this.appendToLog(`  Output: "${output}"`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
  }

  handleToolError(err: Error, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): void | Promise<void> {
    this.appendToLog(`[TOOL_ERROR] Run ID: ${runId}`);
    this.appendToLog(`  Error: ${err.message}\n${err.stack || ''}`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
  }

  handleAgentAction(action: CoreAgentAction, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): void | Promise<void> {
    this.appendToLog(`[AGENT_ACTION] Run ID: ${runId}`);
    this.appendToLog(`  Action: ${safelyStringify(action)}`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
  }

  handleAgentEnd(action: CoreAgentFinish, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): void | Promise<void> {
    this.appendToLog(`[AGENT_END] Run ID: ${runId}`);
    this.appendToLog(`  Return Values: ${safelyStringify(action.returnValues)}`);
    this.appendToLog(`  Log: ${action.log}`);
    if (tags) this.appendToLog(`  Tags: ${tags.join(', ')}`);
  }
}

// Gracefully close the stream on exit
process.on('exit', () => {
  chatDebugStream.end();
});
process.on('SIGINT', () => {
  chatDebugStream.end();
  process.exit();
});
process.on('SIGTERM', () => {
  chatDebugStream.end();
  process.exit();
}); 