import { Document } from 'langchain/document';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import path from 'path';
import fs from 'fs';
import { getEmbeddingsModel, retrieveContext as generalRetrieveContext } from '../../memoryVector'; // Assuming memoryVector.ts stays in src/

export async function initUserProfileStore(storePath: string): Promise<FaissStore> {
  const embeddings = getEmbeddingsModel();

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
  store: FaissStore,
  storePath: string
): Promise<void> {
  if (!fact || fact.trim() === "") {
    console.warn("Attempted to add an empty fact to User Profile store. Skipping.");
    return;
  }
  const newDoc = new Document({ pageContent: fact });
  try {
    await store.addDocuments([newDoc]);
    await store.save(storePath);
  } catch (error) {
    console.error(`Error adding fact to User Profile store at ${storePath}:`, error);
    // It might be better to re-throw or handle more gracefully depending on desired behavior
  }
}

// Re-export or wrap retrieveContext if its interface is perfectly suitable
// Or create a specific version if UserProfile needs different parameters/logic for retrieval
export async function retrieveUserProfileContext(
  store: FaissStore,
  query: string,
  k = 2 // Default k for user profile, can be overridden
): Promise<Document[]> {
  return generalRetrieveContext(store, query, k);
} 