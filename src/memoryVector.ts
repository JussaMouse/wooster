import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { OpenAIEmbeddings } from '@langchain/openai'
import { Document } from 'langchain/document'
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import * as fs from 'fs';
import * as path from 'path';

// File to persist vectors
const VECTOR_STORE_PATH = './vector_data/store.json'

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
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY
  })
  
  let store: MemoryVectorStore

  // Load from disk if exists
  if (fs.existsSync(VECTOR_STORE_PATH)) {
    const data = JSON.parse(fs.readFileSync(VECTOR_STORE_PATH, 'utf8'))
    store = await MemoryVectorStore.fromDocuments(
      data.vectors.map((v: any) => new Document(v)),
      embeddings
    )
  } else {
    store = new MemoryVectorStore(embeddings)
  }

  const count = store.memoryVectors.length
  if (!count || count === 0) {
    await ingestDocuments(store)
    // Save to disk after ingestion
    fs.mkdirSync(path.dirname(VECTOR_STORE_PATH), { recursive: true })
    fs.writeFileSync(VECTOR_STORE_PATH, JSON.stringify({
      vectors: store.memoryVectors
    }))
  }

  return store
}

// Ingest src/ + README.md into vector store
async function ingestDocuments(store: MemoryVectorStore) {
  // Load all TypeScript and Markdown files
  const loader = new DirectoryLoader('src', {
    '.ts': (p) => new TextLoader(p),
  })
  const readmeLoader = new TextLoader('README.md')

  const docs = [
    ...await loader.load(),
    ...await readmeLoader.load()
  ]

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

  await store.addDocuments(splitDocs)
  console.log(`Ingested ${splitDocs.length} document chunks`)
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
  store: MemoryVectorStore,
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
  store: MemoryVectorStore,
  query: string,
  k = 5
): Promise<Document[]> {
  return store.similaritySearch(query, k);
}
