import { BaseMessage } from '@langchain/core/messages';
import { log, LogLevel, logCodeAgentInteraction } from './logger';
import { AppConfig, getConfig } from './configLoader';
import { getModelRouter } from './routing/ModelRouterService';
import { CodeSandbox } from './codeAgent/CodeSandbox';
import { createToolApi } from './codeAgent/tools';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import * as fs from 'fs/promises';
import * as path from 'path';

function extractJsCodeBlock(response: string): string | null {
  const codeBlockRegex = /```(?:js|javascript)\n([\s\S]+?)\n```/;
  const match = response.match(codeBlockRegex);
  return match ? match[1].trim() : null;
}

async function buildCodeAgentPrompt(userInput: string, chatHistory: BaseMessage[]): Promise<BaseMessage[]> {
  const baseSystemPrompt = await fs.readFile(path.join(process.cwd(), 'prompts', 'base_system_prompt.txt'), 'utf-8');
  
  const codeAgentHeader = `You can solve tasks by emitting a single JavaScript code block, and nothing else.
Rules:
- Output exactly one fenced code block: \`\`\`js ... \`\`\` and no prose outside it.
- Use only the provided APIs: webSearch(query), fetchText(url), queryRAG(query), writeNote(text), schedule(time, text), discordNotify(msg), signalNotify(msg), finalAnswer(text).
- Keep code concise (≤ ~60 lines). Use try/catch and small helpers. Call finalAnswer once at the end.
- Summarize long tool outputs before re-feeding them into the model. Do not print secrets.`;

  const fewShotExamples = `
// Example 1: Web search and summarize
const searchResults = await webSearch('latest news on AI');
const firstResultUrl = searchResults.results[0].url;
const content = await fetchText(firstResultUrl);
const summary = content.slice(0, 500); // simplified summary
finalAnswer(\`Here's a summary from the first result: \${summary}\`);

// Example 2: RAG query and cite
const ragResponse = await queryRAG('What is the project status?');
finalAnswer(\`Project status: \${ragResponse}\`);
`;
  
  const finalSystemPrompt = `${baseSystemPrompt}\n\n${codeAgentHeader}\n\n${fewShotExamples}`;

  const messages: BaseMessage[] = [
    new SystemMessage(finalSystemPrompt),
    ...chatHistory,
    new HumanMessage(userInput),
  ];
  
  return messages;
}

export async function executeCodeAgent(
  userInput: string,
  chatHistory: BaseMessage[],
): Promise<string> {
  logCodeAgentInteraction({ event: 'start', details: { userInput } });
  const config = getConfig();
  const { maxAttempts, stepTimeoutMs, totalTimeoutMs } = config.codeAgent;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remainingTime = totalTimeoutMs - (Date.now() - startTime);
    if (remainingTime <= 0) {
      log(LogLevel.WARN, 'Code Agent execution timed out.');
      return "I took too long to think and could not complete the request.";
    }

    const modelRouter = getModelRouter();
    const model = await modelRouter.selectModel({
      task: 'CODE_ASSISTANCE',
      context: modelRouter.createContext('CODE_ASSISTANCE'),
    });

    const prompt = await buildCodeAgentPrompt(userInput, chatHistory);
    logCodeAgentInteraction({ event: 'llm_request', details: { prompt } });
    const response = await model.invoke(prompt);
    const responseContent = response.content as string;
    logCodeAgentInteraction({ event: 'llm_response', details: { response: responseContent } });
    const code = extractJsCodeBlock(responseContent);

    if (!code) {
      logCodeAgentInteraction({ event: 'error', details: { message: 'No code block found in LLM response.', attempt } });
      log(LogLevel.WARN, `Attempt ${attempt}: No code block found in LLM response.`);
      if (attempt === maxAttempts) {
        const errorMessage = "I couldn't generate the right code to answer your request. Please try rephrasing.";
        logCodeAgentInteraction({ event: 'finish', details: { finalAnswer: errorMessage, status: 'failure' } });
        return errorMessage;
      }
      continue;
    }
    logCodeAgentInteraction({ event: 'code_extracted', details: { code } });

    const sandbox = new CodeSandbox(stepTimeoutMs, totalTimeoutMs);
    const toolApi = createToolApi();
    logCodeAgentInteraction({ event: 'sandbox_run', details: { code } });
    const result = await sandbox.run(code, toolApi, Math.min(stepTimeoutMs, remainingTime));

    if (result.finalAnswer) {
      logCodeAgentInteraction({ event: 'final_answer', details: { finalAnswer: result.finalAnswer } });
      logCodeAgentInteraction({ event: 'finish', details: { finalAnswer: result.finalAnswer, status: 'success' } });
      return result.finalAnswer;
    }

    if (result.error) {
      logCodeAgentInteraction({ event: 'error', details: { message: 'Sandbox execution failed.', error: result.error, attempt } });
      log(LogLevel.WARN, `Attempt ${attempt}: Sandbox execution failed.`, { error: result.error });
      // Here you could add the error to the prompt for the next attempt.
    }
  }
  const finalMessage = "I tried my best but couldn't get a final answer. Please check the logs for more details.";
  logCodeAgentInteraction({ event: 'finish', details: { finalAnswer: finalMessage, status: 'failure' } });
  return finalMessage;
}
