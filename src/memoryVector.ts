import { Document } from 'langchain/document'
import { FaissStore } from '@langchain/community/vectorstores/faiss'
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers'

/**
 * Initialize an empty FAISS vector store with embeddings.
 */
export async function initVectorStore() {
  const embeddings = new HuggingFaceTransformersEmbeddings({modelName: "Xenova/all-MiniLM-L6-v2"})
  const store = await FaissStore.fromDocuments([], embeddings)
  return store
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
