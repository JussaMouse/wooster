import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { FakeEmbeddings } from 'langchain/embeddings/fake'
import { Document } from 'langchain/document'

/**
 * Initialize a persistent Chroma vector store.
 */
export async function initVectorStore() {
  const embeddings = new FakeEmbeddings()
  return MemoryVectorStore.fromTexts([], [], embeddings)
}

/**
 * Upsert a document into the vector store and persist.
 */
export async function upsertDocument(
  store: MemoryVectorStore,
  text: string,
  nodeId: number
) {
  const doc: Document = { pageContent: text, metadata: { nodeId } }
  await store.addDocuments([doc])
}

/**
 * Retrieve nearest neighbors from the vector store.
 */
export async function retrieveContext(
  store: MemoryVectorStore,
  query: string,
  k = 5
): Promise<Document[]> {
  return store.similaritySearch(query, k)
}
