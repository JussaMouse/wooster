import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import { Document } from 'langchain/document'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { FaissStore } from '@langchain/community/vectorstores/faiss'
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers'

/**
 * Create a fresh FAISS vector store for the given project.
 */
export async function createProjectStore(projectName: string) {
  // Load project globs
  const projectsPath = path.resolve('projects.json')
  if (!fs.existsSync(projectsPath)) throw new Error('projects.json not found')
  const catalog = JSON.parse(fs.readFileSync(projectsPath, 'utf8'))
  const raw = catalog[projectName]
  if (!raw) throw new Error(`Unknown project: ${projectName}`)
  const entries = typeof raw === 'string' ? [raw] : raw as string[]
  // Convert directory paths to globs
  const patterns: string[] = entries.map(p => {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return path.join(p, '**/*')
    }
    return p
  })

  // Collect files matching patterns
  const files: string[] = await fg(patterns, {
    onlyFiles: true,
    ignore: ['**/.env', '**/.env.*']
  })
  if (files.length === 0) throw new Error(`No files matched for project ${projectName}`)

  // Load file contents into documents
  const docs: Document[] = files.map((file: string) => {
    const content = fs.readFileSync(file, 'utf8')
    return new Document({ pageContent: content, metadata: { source: file } })
  })

  // Split into chunks
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 })
  const chunks = await splitter.splitDocuments(docs)

  // Build embeddings and store
  const embeddings = new HuggingFaceTransformersEmbeddings({ modelName: 'Xenova/all-MiniLM-L6-v2' })
  const store = await FaissStore.fromDocuments(chunks, embeddings)

  return store
}

/**
 * List all files for a given project without loading the vector store.
 */
export async function listProjectFiles(projectName: string): Promise<string[]> {
  const projectsPath = path.resolve('projects.json')
  if (!fs.existsSync(projectsPath)) throw new Error('projects.json not found')
  const catalog = JSON.parse(fs.readFileSync(projectsPath, 'utf8'))
  const raw = catalog[projectName]
  if (!raw) throw new Error(`Unknown project: ${projectName}`)
  const entries: string[] = typeof raw === 'string' ? [raw] : (raw as string[])

  const result: Set<string> = new Set()

  // Recursive directory walk helper
  function walkDir(dir: string) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) {
        walkDir(full)
      } else {
        result.add(full)
      }
    }
  }

  for (const entry of entries) {
    const fullPath = path.resolve(entry)
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        walkDir(fullPath)
        continue
      }
      if (stat.isFile()) {
        result.add(fullPath)
        continue
      }
    }
    // Treat as glob pattern
    const matches = await fg(entry, { onlyFiles: true })
    for (const m of matches) {
      result.add(path.resolve(m))
    }
  }

  return Array.from(result)
}