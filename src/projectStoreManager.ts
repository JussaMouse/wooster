import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { AppConfig } from './configLoader';
import { initializeProjectVectorStore as initialize } from './projectIngestor';

export async function initializeProjectVectorStore(
  projectName: string,
  embeddings: OpenAIEmbeddings,
  appConfig: AppConfig
): Promise<MemoryVectorStore> {
  // This is now a pass-through to the real implementation in the ingestor.
  return initialize(projectName, embeddings, appConfig);
} 