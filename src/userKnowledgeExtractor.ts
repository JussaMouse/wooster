import { ChatOpenAI } from "@langchain/openai";
import { getConfig } from './configLoader';
import { log, LogLevel } from './logger'; // Import new logger

// This will be initialized and potentially passed in, or accessed globally
// For now, let's assume it will be passed or available in a shared context
let llm: ChatOpenAI;

export function initializeUserKnowledgeExtractor(openAILlm: ChatOpenAI) {
  llm = openAILlm;
}

/**
 * Analyzes a conversation turn to extract a user-specific fact or preference.
 * @param userInput The user's latest message.
 * @param assistantResponse Wooster's latest response.
 * @param currentProjectName The name of the currently loaded project, if any.
 * @returns A string containing the extracted fact, or null if no clear fact is found.
 */
export async function extractUserKnowledge(
  userInput: string,
  assistantResponse: string,
  currentProjectName: string | null
): Promise<string | null> {
  if (!llm) {
    // console.warn("UserKnowledgeExtractor LLM not initialized. Skipping fact extraction.");
    log(LogLevel.WARN, "UserKnowledgeExtractor LLM not initialized. Skipping fact extraction.");
    return null;
  }

  const config = getConfig();
  const configuredPrompt = config.userProfile.extractorLlmPrompt;

  const defaultPromptTemplate = `Analyze the following conversation turn:
User: "${userInput}"
Assistant: "${assistantResponse}"
Current Project Context: ${currentProjectName || 'None'}

Based ONLY on the USER'S statement, identify one single, concise fact or preference explicitly stated by the user about themselves.
If the fact seems tied to the Current Project Context, prefix it with "[Project: ${currentProjectName || 'N/A'}] ".
If no clear user-specific fact or preference is stated by the user, output "null".
Examples:
- "User likes coffee."
- "[Project: Screenwriting] User prefers short scenes."
Output only the fact string or "null".`;

  const finalPrompt = typeof configuredPrompt === 'string' && configuredPrompt.trim() !== '' 
    ? configuredPrompt
        .replace('${userInput}', userInput) 
        .replace('${assistantResponse}', assistantResponse)
        .replace('${currentProjectName}', currentProjectName || 'None')
    : defaultPromptTemplate;

  // console.debug("UCM Extractor Final Prompt:", { prompt: finalPrompt });
  log(LogLevel.DEBUG, "UCM Extractor Final Prompt:", { prompt: finalPrompt });

  try {
    const response = await llm.invoke(finalPrompt);
    const extractedText = response.content.toString().trim();
    // console.debug("UCM Extractor Raw LLM Response:", { extractedText });
    log(LogLevel.DEBUG, "UCM Extractor Raw LLM Response:", { extractedText });

    if (extractedText.toLowerCase() === "null" || extractedText === "") {
      // console.debug("UCM Extractor: No specific fact extracted by LLM.");
      log(LogLevel.DEBUG, "UCM Extractor: No specific fact extracted by LLM.");
      return null;
    }
    // console.debug("UCM Extractor: Fact extracted by LLM:", { extractedText });
    log(LogLevel.DEBUG, "UCM Extractor: Fact extracted by LLM:", { extractedText });
    return extractedText;
  } catch (error: any) {
    // console.error("Error during UCM knowledge extraction:", error);
    log(LogLevel.ERROR, "Error during UCM knowledge extraction:", error);
    return null;
  }
} 