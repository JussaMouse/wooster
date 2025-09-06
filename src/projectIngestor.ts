import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import path from 'path'
import fg from 'fast-glob'
import { Document } from 'langchain/document'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { MemoryVectorStore } from "langchain/vectorstores/memory"
import { OpenAIEmbeddings } from "@langchain/openai"
import { log, LogLevel } from './logger'
import { AppConfig } from './configLoader'

const getVectorDataPath = (projectName: string) => path.join(process.cwd(), 'vector_data', projectName)
const getVectorStoreJsonPath = (projectName: string) => path.join(getVectorDataPath(projectName), 'vector_store.json')
const getVectorMetaPath = (projectName: string) => path.join(getVectorDataPath(projectName), 'meta.json')

interface VectorStoreMeta {
  provider: 'openai' | 'local' | 'server'
  model: string
  dimensions?: number
  createdAt: string
  chunks: number
  fileVersion: number
}

/**
 * Create a fresh FAISS vector store for the given project.
 */
export async function createProjectStore(
  projectName: string,
  embeddings: OpenAIEmbeddings,
  appConfig: AppConfig
): Promise<MemoryVectorStore> {
  log(LogLevel.INFO, 'Creating new vector store from source files for project "%s"', projectName)
  
  const projectsPath = path.resolve('projects.json')
  let catalog: Record<string, string | string[]> = {}
  if (fsSync.existsSync(projectsPath)) {
    try {
      catalog = JSON.parse(fsSync.readFileSync(projectsPath, 'utf8'))
    } catch (err: any) {
      log(LogLevel.WARN, 'projects.json found but could not be parsed. Proceeding without catalog. Error: %s', err.message)
    }
  }

  const projectEntry = catalog[projectName]
  let patterns: string[] = []
  if (projectEntry) {
    const entries = typeof projectEntry === 'string' ? [projectEntry] : projectEntry
    patterns = entries.map(p => path.isAbsolute(p) ? p : path.resolve(process.cwd(), p))
  } else {
    const defaultProjectDir = path.resolve(process.cwd(), 'projects', projectName)
    if (fsSync.existsSync(defaultProjectDir)) {
      patterns = [path.join(defaultProjectDir, '**/*')]
    } else {
      throw new Error(`Unknown or unconfigured project: ${projectName}`)
    }
  }

  const files = await fg(patterns, { onlyFiles: true, ignore: ['**/node_modules/**', '**/vector_data/**'] })
  
  let docs: Document[] = []
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8')
    docs.push(new Document({ pageContent: content, metadata: { source: path.basename(file), full_path: file } }))
  }

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 })
  const chunks = await splitter.splitDocuments(docs)
  log(LogLevel.DEBUG, 'Split %d documents into %d chunks for project "%s".', docs.length, chunks.length, projectName)
  
  // Save chunks to JSON for future fast loads
  const vectorStoreJsonPath = getVectorStoreJsonPath(projectName)
  try {
    await fs.mkdir(getVectorDataPath(projectName), { recursive: true })
    await fs.writeFile(vectorStoreJsonPath, JSON.stringify(chunks, null, 2))
    log(LogLevel.INFO, `Saved processed documents to ${vectorStoreJsonPath} for future use.`)
  } catch (e: any) {
    log(LogLevel.ERROR, `Failed to save vector_store.json`, { error: e.message })
  }
  
  const store = await MemoryVectorStore.fromDocuments(chunks, embeddings)
  log(LogLevel.INFO, 'MemoryVectorStore created successfully for project "%s" with %d chunks.', projectName, chunks.length)

  // Write meta.json describing embedding model used
  try {
    const meta: VectorStoreMeta = {
      provider: 'openai', // current default; future: read from EmbeddingService config
      model: (embeddings as any)?.modelName || appConfig.openai.embeddingModelName,
      dimensions: undefined,
      createdAt: new Date().toISOString(),
      chunks: chunks.length,
      fileVersion: 1,
    }
    await fs.writeFile(getVectorMetaPath(projectName), JSON.stringify(meta, null, 2))
    log(LogLevel.INFO, `Saved vector store metadata to ${getVectorMetaPath(projectName)}`)
  } catch (e: any) {
    log(LogLevel.WARN, `Failed to save vector store metadata for project "${projectName}": ${e.message}`)
  }

  return store
}

async function createVectorStoreFromJson(jsonPath: string, embeddings: OpenAIEmbeddings): Promise<MemoryVectorStore> {
  log(LogLevel.INFO, `Loading vector store from JSON: ${jsonPath}`)
  const jsonContent = await fs.readFile(jsonPath, 'utf-8')
  const revivedDocs = (JSON.parse(jsonContent) as any[]).map(
    (doc) => new Document({ pageContent: doc.pageContent, metadata: doc.metadata })
  )
  return MemoryVectorStore.fromDocuments(revivedDocs, embeddings)
}

export async function initializeProjectVectorStore(
  projectName: string,
  embeddings: OpenAIEmbeddings,
  appConfig: AppConfig
): Promise<MemoryVectorStore> {
  const vectorStoreJsonPath = getVectorStoreJsonPath(projectName)
  const metaPath = getVectorMetaPath(projectName)

  try {
    await fs.access(vectorStoreJsonPath)
    // If meta exists, compare against current embeddings
    let mismatch = false
    try {
      const metaRaw = await fs.readFile(metaPath, 'utf-8')
      const meta = JSON.parse(metaRaw) as VectorStoreMeta
      const currentModel = (embeddings as any)?.modelName || appConfig.openai.embeddingModelName
      if (meta?.model && meta.model !== currentModel) {
        log(LogLevel.WARN, `Vector store for project "${projectName}" was built with model '${meta.model}', current is '${currentModel}'.`)
        mismatch = true
      }
    } catch {
      log(LogLevel.WARN, `Vector store metadata not found for project "${projectName}". Proceeding without compatibility check.`)
    }
    if (!mismatch) {
      return await createVectorStoreFromJson(vectorStoreJsonPath, embeddings)
    }
    // Mismatch: keep existing store for now; user can rebuild via REPL command
    log(LogLevel.WARN, `Embedding model mismatch for project "${projectName}". Using existing vector store for now. Use 'rebuild embeddings' in REPL to re-index.`)
    return await createVectorStoreFromJson(vectorStoreJsonPath, embeddings)
  } catch (error) {
    // fall-through to (re)create
  }

  // If we reach here, file missing → create fresh
  return await createProjectStore(projectName, embeddings, appConfig)
}

/**
 * List all files for a given project without loading the vector store.
 */
export async function listProjectFiles(projectName: string): Promise<string[]> {
  log(LogLevel.INFO, 'Listing files for project "%s"', projectName)
  const projectsPath = path.resolve('projects.json')
  let catalog: Record<string, string | string[]> = {}
  let patterns: string[] = []

  if (fsSync.existsSync(projectsPath)) {
    try {
      catalog = JSON.parse(fsSync.readFileSync(projectsPath, 'utf8'))
      log(LogLevel.DEBUG, 'Loaded projects.json catalog for listProjectFiles.')
    } catch (err: any) {
      log(LogLevel.WARN, 'projects.json found but could not be parsed for listProjectFiles. Proceeding without catalog. Error: %s', err.message)
    }
  }

  const projectEntry = catalog[projectName]
  if (projectEntry) {
    log(LogLevel.DEBUG, 'Project "%s" found in projects.json for listing files.', projectName)
    const entries = typeof projectEntry === 'string' ? [projectEntry] : projectEntry
    patterns = entries.map(p => {
      const resolvedPath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
      if (fsSync.existsSync(resolvedPath) && fsSync.statSync(resolvedPath).isDirectory()) {
        return path.join(resolvedPath, '**/*')
      }
      return resolvedPath
    })
  } else {
    log(LogLevel.DEBUG, 'Project "%s" not in projects.json for listing. Checking default directory.', projectName)
    const defaultProjectDir = path.resolve(process.cwd(), 'projects', projectName)
    if (fsSync.existsSync(defaultProjectDir) && fsSync.statSync(defaultProjectDir).isDirectory()) {
      log(LogLevel.DEBUG, 'Found directory for project "%s" at: %s for listing files.', projectName, defaultProjectDir)
      patterns = [path.join(defaultProjectDir, '**/*')]
    } else {
      log(LogLevel.ERROR, 'Project "%s" not found in projects.json and no corresponding directory found for listing files.', projectName)
      throw new Error(`Unknown or unconfigured project: ${projectName} (for listing files)`)
    }
  }

  log(LogLevel.DEBUG, 'Using patterns for listing files in project "%s": %j', projectName, patterns)

  if (patterns.length === 0) {
    log(LogLevel.INFO, 'No patterns defined for project "%s", cannot list files.', projectName)
    return [] // Or throw an error if patterns are strictly required from one of the sources
  }

  const files: string[] = await fg(patterns, {
    onlyFiles: true,
    dot: true,
    ignore: [
      '**/.git/**',
      '**/.DS_Store',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.env',
      '**/.env.*',
      '**/vector_data/**'
    ],
    caseSensitiveMatch: false,
    absolute: true
  })

  log(LogLevel.INFO, 'Found %d files for project "%s".', files.length, projectName)
  return files.map(f => path.relative(process.cwd(), f)) // Return relative paths for cleaner output
}