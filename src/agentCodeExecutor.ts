import { BaseMessage } from '@langchain/core/messages';
import { log, LogLevel, logCodeAgentInteraction } from './logger';
import { AppConfig, getConfig } from './configLoader';
import { getModelRouter } from './routing/ModelRouterService';
import { CodeSandbox } from './codeAgent/CodeSandbox';
import { createToolApi } from './codeAgent/tools';
import { getRegisteredService, getPluginAgentTools } from './pluginManager';
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
  
  const pluginTools = getPluginAgentTools();
  // Format plugin tools for prompt
  const pluginToolSignatures = pluginTools.map(t => `      - ${t.name}(jsonInput?): ${t.description.replace(/\n/g, ' ').slice(0, 150)}`).join('\n');

    const codeAgentHeader = `You can solve tasks by emitting a single JavaScript code block, and nothing else.
    Rules:
    - Output exactly one fenced code block: \`\`\`js ... \`\`\` and no prose outside it.
    - Use only the provided APIs:
      - webSearch(query): Search the public web.
      - fetchText(url): Read a webpage.
      - kb_query(query, scope?): Hybrid search (Text+Vector) of your Personal Library. Returns JSON string of hits.
      - read_note(name): Read the full content of a note by title or path (e.g. "inbox", "project-alpha"). Returns string.
      - zk_create(title, body, tags?): Create a new note. Returns status string.
      - queryRAG(query): DEPRECATED (maps to kb_query).
      - writeNote(text): Append to daily journal.
      - capture(text), schedule(time, text)
      - list_scheduled_tasks(): Returns an array of formatted strings (e.g. "ID: ... | Time: ...").
      - delete_scheduled_task(id): Delete a scheduled task by ID.
      - toggle_scheduled_task(id, active): Enable/Disable a task (boolean active).
      - list_plugins(): List all active plugins (returns string[]). JOIN WITH '\\n' for display.
      - calendarList(opts?), calendarCreate(event), sendEmail(args), discordNotify(msg), signalNotify(msg), sendSignal(msg), finalAnswer(text).
      
      // Dynamic Plugin Tools:
${pluginToolSignatures}

    - Keep code concise (≤ ~60 lines). Use try/catch and small helpers. Call finalAnswer once at the end.
    - Summarize long tool outputs before re-feeding them into the model. Do not print secrets.
    - When using kb_query or webSearch, READ the results (often JSON) and SYNTHESIZE a natural language answer. 
    - For list_scheduled_tasks and list_plugins, join the items with newlines for readability.`;

    const fewShotExamples = `
    // Example 1: Web search and summarize
    const searchResults = await webSearch('latest news on AI');
    const firstResultUrl = searchResults.results[0].url;
    const content = await fetchText(firstResultUrl);
    const summary = content.slice(0, 500); // simplified summary
    finalAnswer(\`Here's a summary from the first result: \${summary}\`);

    // Example 2: Personal Library (KB) query and cite
    const kbResponse = await kb_query('What is the project status?');
    // Parse and summarize the JSON result
    const hits = JSON.parse(kbResponse);
    if (hits.length === 0) {
        finalAnswer("I couldn't find any information on that in your library.");
    } else {
        // Use top 3 hits or filter to most relevant to synthesize answer
        const relevantHits = hits.slice(0, 3);
        const summary = relevantHits.map(h => \`- \${h.title}: \${h.text.slice(0, 150)}...\`).join('\\n');
        finalAnswer(\`According to your notes:\\n\${summary}\`);
    }

    // Example 3: Send a Signal message using env defaults
    await sendSignal('Test from Wooster');
    finalAnswer('Signal send requested.');
    `;
  
  const finalSystemPrompt = `${baseSystemPrompt}\n\n${codeAgentHeader}\n\n${fewShotExamples}`;

  const messages: BaseMessage[] = [
    new SystemMessage(finalSystemPrompt),
    ...chatHistory,
    new HumanMessage(userInput),
  ];
  
  return messages;
}

async function classifyToolNeed(prompt: string): Promise<'NONE' | 'TOOLS'> {
  // Heuristic fast-path: if the user explicitly asks to send via Signal, force tools
  const p = (prompt || '').toLowerCase();
  
  // Force tools for signal, library, search, notes, tasks, schedule
  if (/(\bsendsignal\b|\bsignal_notify\b|send\s+via\s+signal|via\s+signal|signal\s+message|search\s+library|search\s+notes|my\s+notes|recall|what\s+does\s+.*mean|next\s+action|add\s+task|new\s+task|todo|remind\s+me|schedule|capture)/i.test(p)) {
    return 'TOOLS';
  }

  try {
    const router = getModelRouter();
    const model = await router.selectModel({
      task: 'COMPLEX_REASONING',
      context: router.createContext('COMPLEX_REASONING', { priority: 'fast' })
    });
    const system = new SystemMessage(
      'Task: Decide if the user request needs tools or can be answered directly.\n' +
      'Respond with ONLY one token: NONE or TOOLS.\n' +
      'NONE if trivial Q&A or general knowledge; TOOLS if web, RAG, file write, schedule, email, calendar, notifications, or multi-step research.'
    );
    const human = new HumanMessage(prompt);
    const res = await (model as any).invoke([system, human], { maxTokens: 8, temperature: 0.1 });
    const text = String((res?.content ?? '')).trim().toUpperCase();
    if (text.includes('NONE')) return 'NONE';
    if (text.includes('TOOLS')) return 'TOOLS';
  } catch (e) {
    log(LogLevel.WARN, '[CodeAgent] pre-classifier failed, defaulting to TOOLS');
  }
  return 'TOOLS';
}

async function answerDirectly(userInput: string, chatHistory: BaseMessage[]): Promise<string> {
  const router = getModelRouter();
  const model = await router.selectModel({
    task: 'COMPLEX_REASONING',
    context: router.createContext('COMPLEX_REASONING', { priority: 'fast' })
  });
  const basePrompt = await buildCodeAgentPrompt('', []);
  const systemOnly = basePrompt[0] as SystemMessage;
  const answerSystem = new SystemMessage(
    `${systemOnly.content}\n\nAnswer the user directly in plain text. Do not output code.`
  );
  const messages: BaseMessage[] = [answerSystem, ...chatHistory, new HumanMessage(userInput)];
  const res = await (model as any).invoke(messages, { temperature: 0.3 });
  return String(res?.content ?? '').trim();
}

export async function executeCodeAgent(
  userInput: string,
  chatHistory: BaseMessage[],
): Promise<string> {
  logCodeAgentInteraction({ event: 'start', details: { userInput } });
  const config = getConfig();
  const { maxAttempts, stepTimeoutMs, totalTimeoutMs } = config.codeAgent;
  const startTime = Date.now();

  // Pre-classifier: try to avoid sandbox when unnecessary
  try {
    const decision = await classifyToolNeed(userInput);
    logCodeAgentInteraction({ event: 'tool_call', details: { classifier_decision: decision } });
    if (decision === 'NONE') {
      const answer = await answerDirectly(userInput, chatHistory);

      // Fallback: If the model outputted a code block despite being told not to,
      // treat it as a tool use attempt and execute it.
      const codeMatch = extractJsCodeBlock(answer);
      if (codeMatch) {
         log(LogLevel.WARN, '[CodeAgent] Classifier said NONE, but model outputted code. Falling back to execution.');
         // Let's run the sandbox directly here with the code we found.
         logCodeAgentInteraction({ event: 'code_extracted', details: { code: codeMatch, fallback: true } });
         const sandbox = new CodeSandbox(stepTimeoutMs, totalTimeoutMs);
         const toolApi = createToolApi();
         logCodeAgentInteraction({ event: 'sandbox_run', details: { code: codeMatch } });
         const result = await sandbox.run(codeMatch, toolApi, Math.min(stepTimeoutMs, totalTimeoutMs));
         if (result.finalAnswer) {
             logCodeAgentInteraction({ event: 'final_answer', details: { finalAnswer: result.finalAnswer } });
             logCodeAgentInteraction({ event: 'finish', details: { finalAnswer: result.finalAnswer, status: 'success' } });
             return result.finalAnswer;
         }
         // If execution failed, we could return the error or let the loop retry.
         // For now, let's return the error message if any, or the original text if nothing else.
         if (result.error) {
             return `I tried to execute the code but failed: ${result.error}`;
         }
      }

      // Legacy signal handling (can be kept or removed if covered by generic fallback)
      try {
        const legacyCodeMatch = answer.match(/```(?:js|javascript)?\n([\s\S]*?)```/i);
        if (legacyCodeMatch && legacyCodeMatch[1]) {
          const code = legacyCodeMatch[1];
          const callMatch = code.match(/(?:sendSignal|signal_notify|signalNotify)\s*\(\s*([\s\S]*?)\s*\)/);
          if (callMatch) {
            let rawArg = (callMatch[1] || '').trim();
            let msg: string | null = null;
            if (rawArg.startsWith('{')) {
              try { const o = JSON.parse(rawArg); if (o && typeof o.message === 'string') msg = o.message; } catch {}
            }
            if (!msg) {
              const s = rawArg.match(/^(["'])([\s\S]*?)\1$/);
              if (s) msg = s[2];
            }
            if (msg && msg.trim()) {
              const svc = getRegisteredService<{ send: (m: string) => Promise<void> }>('SignalService');
              if (svc && typeof svc.send === 'function') {
                try {
                  await svc.send(msg.trim());
                  const out = `Signal message sent: ${msg.trim()}`;
                  logCodeAgentInteraction({ event: 'finish', details: { finalAnswer: out, status: 'success' } });
                  return out;
                } catch (e: any) {
                  const out = `Error sending Signal message: ${e?.message || String(e)}`;
                  logCodeAgentInteraction({ event: 'finish', details: { finalAnswer: out, status: 'failure' } });
                  return out;
                }
              }
            }
          }
        }
      } catch {}

      logCodeAgentInteraction({ event: 'final_answer', details: { finalAnswer: answer } });
      logCodeAgentInteraction({ event: 'finish', details: { finalAnswer: answer, status: 'success' } });
      return answer;
    }
  } catch {}

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
