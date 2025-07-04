import { Document } from 'langchain/document'
import { FaissStore } from '@langchain/community/vectorstores/faiss'
import path from 'path';
import fs from 'fs';
import { EmbeddingService } from './embeddings/EmbeddingService';
import { getConfig } from './configLoader';

const DEFAULT_VECTOR_STORE_PATH = path.join(process.cwd(), 'vector_data', 'default_store');
export const USER_PROFILE_VECTOR_STORE_PATH = path.join(process.cwd(), 'vector_data', 'user_profile_store');

export function getEmbeddingsModel() {
  const config = getConfig();
  return EmbeddingService.getUserProfileEmbeddings(config).getEmbeddings();
}

/**
 * Initialize an empty FAISS vector store with embeddings.
 * Tries to load from a default path, otherwise creates a new one.
 */
export async function initVectorStore(storePath: string = DEFAULT_VECTOR_STORE_PATH): Promise<FaissStore> {
  const embeddings = getEmbeddingsModel();

  try {
    await fs.promises.access(path.join(storePath, "faiss.index"));
    console.log(`Loading existing vector store from ${storePath}...`);
    return FaissStore.load(storePath, embeddings);
  } catch (error) {
    console.log(`No existing store found at ${storePath} (or error accessing). Creating new one.`);
    const placeholderDoc = new Document({ pageContent: "Initial placeholder document." });
    const store = await FaissStore.fromDocuments([placeholderDoc], embeddings);
    await fs.promises.mkdir(storePath, { recursive: true });
    await store.save(storePath);
    console.log(`New store created and saved to ${storePath}.`);
    return store;
  }
}

/**
 * Upsert a document into the vector store.
 */
export async function upsertDocument(
  store: FaissStore,
  text: string,
  nodeId: number
) {
  const doc: Document = { pageContent: text, metadata: { nodeId } };
  await store.addDocuments([doc]);
}

/**
 * Retrieve nearest neighbors from the vector store.
 */
export async function retrieveContext(
  store: FaissStore,
  query: string,
  k = 5
): Promise<Document[]> {
  const results = await store.similaritySearch(query, k)
  return results
}

export async function initUserProfileStore(): Promise<FaissStore> {
  const embeddings = getEmbeddingsModel();
  const storePath = USER_PROFILE_VECTOR_STORE_PATH;

  try {
    await fs.promises.access(path.join(storePath, "faiss.index"));
    console.log(`Loading existing user profile vector store from ${storePath}...`);
    return FaissStore.load(storePath, embeddings);
  } catch (error) {
    console.log(`No existing user profile store found at ${storePath} (or error accessing). Creating new one.`);
    const placeholderDoc = new Document({ pageContent: "Initial user profile placeholder." });
    const store = await FaissStore.fromDocuments([placeholderDoc], embeddings);
    await fs.promises.mkdir(storePath, { recursive: true });
    await store.save(storePath);
    console.log(`New user profile store created and saved to ${storePath}.`);
    return store;
  }
}

export async function addUserFactToProfileStore(
  fact: string,
  store: FaissStore
): Promise<void> {
  if (!fact || fact.trim() === "") {
    console.warn("Attempted to add an empty fact to User Profile store. Skipping.");
    return;
  }
  const newDoc = new Document({ pageContent: fact });
  try {
    await store.addDocuments([newDoc]);
    await store.save(USER_PROFILE_VECTOR_STORE_PATH);
  } catch (error) {
    console.error(`Error adding fact to User Profile store at ${USER_PROFILE_VECTOR_STORE_PATH}:`, error);
  }
}

export async function searchVectorStore(store: FaissStore, query: string, k: number = 3) {
  const results = await store.similaritySearch(query, k);
  return results
}
