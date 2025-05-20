import { Document } from 'langchain/document'
import { FaissStore } from '@langchain/community/vectorstores/faiss'
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers'
import path from 'path';
import fs from 'fs';

const DEFAULT_VECTOR_STORE_PATH = path.join(process.cwd(), 'vector_data', 'default_store');

/**
 * Initialize an empty FAISS vector store with embeddings.
 * Tries to load from a default path, otherwise creates a new one.
 */
export async function initVectorStore(): Promise<FaissStore> {
  const embeddings = new HuggingFaceTransformersEmbeddings({ modelName: "Xenova/all-MiniLM-L6-v2" });

  try {
    if (fs.existsSync(path.join(DEFAULT_VECTOR_STORE_PATH, 'docstore.json')) && 
        fs.existsSync(path.join(DEFAULT_VECTOR_STORE_PATH, 'faiss.index'))) {
      console.log(`Loading default vector store from ${DEFAULT_VECTOR_STORE_PATH}...`);
      const store = await FaissStore.load(DEFAULT_VECTOR_STORE_PATH, embeddings);
      // @ts-ignore // Accessing private _index for check
      if (store && store._index) {
        console.log('Default vector store loaded successfully and index exists.');
        return store;
      } else {
        console.warn('Loaded default vector store but index is missing. Re-initializing.');
      }
    } else {
      console.log('No existing default vector store found. Initializing a new one.');
    }
  } catch (e) {
    console.warn(`Failed to load default vector store from ${DEFAULT_VECTOR_STORE_PATH}. Initializing a new one. Error:`, e);
  }

  // If loading failed or store didn't exist, create a new one
  console.log('Creating a new default vector store with a placeholder document...');
  const placeholderDoc: Document = {
    pageContent: "Wooster initial knowledge placeholder. This ensures the vector store is properly initialized.",
    metadata: { source: 'system', type: 'placeholder', nodeId: 0 }
  };
  
  const store = await FaissStore.fromDocuments([placeholderDoc], embeddings);
  
  // @ts-ignore // Accessing private _index for check
  if (store && store._index) {
    console.log('New default vector store created successfully and index exists.');
    try {
      if (!fs.existsSync(DEFAULT_VECTOR_STORE_PATH)) {
        fs.mkdirSync(DEFAULT_VECTOR_STORE_PATH, { recursive: true });
      }
      await store.save(DEFAULT_VECTOR_STORE_PATH);
      console.log(`New default vector store saved to ${DEFAULT_VECTOR_STORE_PATH}`);
    } catch (saveError) {
      console.error('Error saving new default vector store:', saveError);
    }
  } else {
    console.error('CRITICAL: Failed to create a new default vector store or its index is missing!');
    // This is a critical failure. Depending on desired robustness, you might throw an error
    // or return a non-functional store, but the latter will lead to errors later.
    // For now, we log an error and return the potentially broken store, but this needs attention if it happens.
  }
  return store;
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
