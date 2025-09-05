import { BaseMessage } from '@langchain/core/messages';
import { log, LogLevel } from './logger';
import { getConfig } from './configLoader';
import { getModelRouter } from './routing/ModelRouterService';
import { CodeSandbox } from './codeAgent/CodeSandbox';
import { createToolApi } from './codeAgent/tools';
import { HumanMessage } from '@langchain/core/messages';

function extractJsCodeBlock(response: string): string | null {
  const codeBlockRegex = /```(?:js|javascript)\n([\s\S]+?)\n```/;
  const match = response.match(codeBlockRegex);
  return match ? match[1].trim() : null;
}

async function buildCodeAgentPrompt(userInput: string, chatHistory: BaseMessage[]): Promise<BaseMessage[]> {
  // This will be expanded in Step 5.
  const systemPrompt = `You can solve tasks by emitting a single JavaScript code block, and nothing else.
Rules:
- Output exactly one fenced code block: \`\`\`js ... \`\`\` and no prose outside it.
- Use only the provided APIs: webSearch(query), fetchText(url), queryRAG(query), writeNote(text), schedule(time, text), discordNotify(msg), signalNotify(msg), finalAnswer(text).
- Call finalAnswer once at the end.`;
  
  // A simple prompt for now
  return [new HumanMessage(systemPrompt + "\n\n" + userInput)];
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
