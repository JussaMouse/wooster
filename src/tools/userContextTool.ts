import { FaissStore } from "@langchain/community/vectorstores/faiss";
// import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers"; // Embeddings are part of the store
import { log, LogLevel } from '../logger'; // Import logger

// This global variable will be set from src/index.ts after the store is initialized.
// This is a simplification for the PoC. A more robust solution might use a context object or a getter function.
let ucmStore: FaissStore | null = null;

export function setUserContextStore(store: FaissStore) {
  ucmStore = store;
}

interface RecallUserContextArgs {
  topic: string;
}

/**
 * Agent tool function to recall learned user context based on a topic.
 * @param args - Arguments for the tool, expecting a 'topic' string.
 * @returns A string containing relevant user facts or a message if none are found.
 */
export async function recallUserContextFunc(args: RecallUserContextArgs): Promise<string> {
  log(LogLevel.INFO, 'Tool: recallUserContextFunc called', { args });
  if (!ucmStore) {
    console.warn("UCM store not available to recallUserContextFunc. Ensure setUserContextStore was called.");
    log(LogLevel.ERROR, "UCM store not available to recallUserContextFunc. setUserContextStore likely not called.");
    return "User Context Memory store is not currently available.";
  }

  const { topic } = args;
  if (!topic || typeof topic !== 'string' || topic.trim() === '') {
    log(LogLevel.WARN, "recallUserContextFunc: No topic provided.", { args });
    return "No topic provided for user context recall. Please specify a topic.";
  }

  try {
    log(LogLevel.DEBUG, `recallUserContextFunc: Searching UCM for topic: "${topic}"`);
    // Retrieve top 2 relevant facts, can be adjusted
    const results = await ucmStore.similaritySearch(topic, 2);
    log(LogLevel.DEBUG, `recallUserContextFunc: UCM search results:`, { resultsCount: results.length, results });

    if (results.length === 0) {
      log(LogLevel.INFO, `recallUserContextFunc: No context found for topic: "${topic}".`);
      return `No specific preferences or context found for the topic: "${topic}".`;
    }

    const responseText = results.map(doc => doc.pageContent).join('\n---\n'); // Join multiple facts with a separator
    log(LogLevel.INFO, `recallUserContextFunc: Context found for topic "${topic}".`, { responseText });
    return responseText;
  } catch (error) {
    console.error(`Error recalling user context for topic "${topic}":`, error);
    log(LogLevel.ERROR, `Error recalling user context for topic "${topic}":`, { error });
    return `Error occurred while trying to recall user context for topic: "${topic}".`;
  }
} 