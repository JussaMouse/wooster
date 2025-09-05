import { BaseMessage } from '@langchain/core/messages';
import { log, LogLevel } from './logger';
import { getConfig } from './configLoader';
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
  log(LogLevel.INFO, 'Executing Code Agent...');
  const config = getConfig();
  const { maxAttempts, stepTimeoutMs, totalTimeoutMs } = config.codeAgent;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const modelRouter = getModelRouter();
    const model = await modelRouter.selectModel({
      task: 'CODE_ASSISTANCE',
      context: modelRouter.createContext('CODE_ASSISTANCE'),
    });

    const prompt = await buildCodeAgentPrompt(userInput, chatHistory);
    const response = await model.invoke(prompt);
    const code = extractJsCodeBlock(response.content as string);

    if (!code) {
      log(LogLevel.WARN, `Attempt ${attempt}: No code block found in LLM response.`);
      if (attempt === maxAttempts) {
        return "I couldn't generate the right code to answer your request. Please try rephrasing.";
      }
      continue;
    }

    const sandbox = new CodeSandbox(stepTimeoutMs, totalTimeoutMs);
    const toolApi = createToolApi();
    const result = await sandbox.run(code, toolApi);

    if (result.finalAnswer) {
      return result.finalAnswer;
    }

    if (result.error) {
      log(LogLevel.WARN, `Attempt ${attempt}: Sandbox execution failed.`, { error: result.error });
      // Here you could add the error to the prompt for the next attempt.
    }
  }

  return "I tried my best but couldn't get a final answer. Please check the logs for more details.";
}
