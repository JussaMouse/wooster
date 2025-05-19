import { FaissStore } from '@langchain/community/vectorstores/faiss'
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers'
import { Document } from 'langchain/document'
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load all .ts and .md files from src/ plus README.md into Document[].
 */
function loadSourceDocs(): Document[] {
  const docs: Document[] = [];
  const exts = [".ts", ".md"];

  function walk(dir: string) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (exts.includes(path.extname(full))) {
        docs.push({ pageContent: fs.readFileSync(full, "utf8"), metadata: { source: full } });
      }
    }
  }

  const srcDir = path.resolve("src");
  if (fs.existsSync(srcDir)) walk(srcDir);

  const readmePath = path.resolve("README.md");
  if (fs.existsSync(readmePath)) {
    docs.push({ pageContent: fs.readFileSync(readmePath, "utf8"), metadata: { source: readmePath } });
  }

  return docs;
}

/**
 * Initialize a persistent Chroma vector store with real embeddings.
 * On first run, ingests all source docs; on subsequent runs, loads existing.
 */
export async function initVectorStore() {
  const embeddings = new HuggingFaceTransformersEmbeddings({
    modelName: "Xenova/all-MiniLM-L6-v2"
  })
  
  let store: FaissStore
  
  // Create vector_data directory if it doesn't exist
  if (!fs.existsSync('./vector_data')) {
    fs.mkdirSync('./vector_data', { recursive: true })
  }

  try {
    // Try to load existing store
    store = await FaissStore.load('./vector_data', embeddings)
  } catch (e) {
    // If loading fails, create new store
    store = await FaissStore.fromDocuments([], embeddings)
    await ingestDocuments(store)
    await store.save('./vector_data')
  }

  return store
}

// Ingest src/ + README.md into vector store
async function ingestDocuments(store: FaissStore) {
  // Use our custom loader to get all docs
  const docs = loadSourceDocs()
  
  // Split documents into chunks with context overlap
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  })
  
  const splitDocs = await splitter.splitDocuments(docs.map(d => 
    new Document({
      pageContent: d.pageContent,
      metadata: {
        source: d.metadata.source,
        // Add line numbers for code files
        ...(d.metadata.source.endsWith('.ts') && {
          lines: extractLineNumbers(d.pageContent)
        })
      }
    })
  ))

  console.log(`Ingesting ${splitDocs.length} document chunks from ${docs.length} files...`)
  await store.addDocuments(splitDocs)
  console.log('Ingestion complete!')
}

// Helper to track code line numbers (for context citations)
function extractLineNumbers(content: string) {
  const lines = content.split('\n')
  return { start: 1, end: lines.length }
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
  console.log(`Found ${results.length} relevant chunks`)
  return results.sort((a, b) => {
    const aLine = a.metadata.lines?.start || 0
    const bLine = b.metadata.lines?.start || 0
    return aLine - bLine
  })
}
