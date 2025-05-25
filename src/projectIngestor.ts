import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import { Document } from 'langchain/document'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { FaissStore } from '@langchain/community/vectorstores/faiss'
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers'
import { log, LogLevel } from './logger'

/**
 * Create a fresh FAISS vector store for the given project.
 */
export async function createProjectStore(projectName: string) {
  log(LogLevel.INFO, 'Creating project store for "%s"', projectName)
  const projectsPath = path.resolve('projects.json')
  let catalog: Record<string, string | string[]> = {}
  let patterns: string[] = []
  let projectDefinedInCatalog = false

  if (fs.existsSync(projectsPath)) {
    try {
      catalog = JSON.parse(fs.readFileSync(projectsPath, 'utf8'))
      log(LogLevel.DEBUG, 'Loaded projects.json catalog.')
    } catch (err: any) {
      log(LogLevel.WARN, 'projects.json found but could not be parsed. Proceeding without catalog. Error: %s', err.message)
      // catalog remains empty
    }
  }

  const projectEntry = catalog[projectName]
  if (projectEntry) {
    log(LogLevel.DEBUG, 'Project "%s" found in projects.json.', projectName)
    projectDefinedInCatalog = true
    const entries = typeof projectEntry === 'string' ? [projectEntry] : projectEntry
    patterns = entries.map(p => {
      // Resolve path relative to workspace root if not absolute
      const resolvedPath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
        return path.join(resolvedPath, '**/*')
      }
      return resolvedPath // Assume it's a glob or specific file path
    })
  } else {
    log(LogLevel.DEBUG, 'Project "%s" not found in projects.json. Checking default project directory.', projectName)
    const defaultProjectDir = path.resolve(process.cwd(), 'projects', projectName)
    if (fs.existsSync(defaultProjectDir) && fs.statSync(defaultProjectDir).isDirectory()) {
      log(LogLevel.DEBUG, 'Found directory for project "%s" at: %s', projectName, defaultProjectDir)
      patterns = [path.join(defaultProjectDir, '**/*')]
    } else {
      log(LogLevel.ERROR, 'Project "%s" not found in projects.json and no corresponding directory found in projects/.', projectName)
      throw new Error(`Unknown or unconfigured project: ${projectName}`)
    }
  }

  log(LogLevel.DEBUG, 'Using patterns for project "%s": %j', projectName, patterns)

  // Collect files matching patterns
  const files: string[] = await fg(patterns, {
    onlyFiles: true,
    dot: true, // Include dotfiles, but common ones are often in .gitignore or explicit ignore patterns
    ignore: [
      '**/.git/**',
      '**/.DS_Store',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.env',
      '**/.env.*',
      '**/vector_data/**' // Don't ingest existing vector stores
    ],
    caseSensitiveMatch: false,
    absolute: true // Ensure paths are absolute for consistency
  })

  let docs: Document[] = []
  if (files.length === 0) {
    log(LogLevel.INFO, 'No files matched for project "%s". An empty vector store will be created.', projectName)
    // docs remains an empty array
  } else {
    log(LogLevel.INFO, 'Found %d files to ingest for project "%s".', files.length, projectName)
    // Load file contents into documents
    docs = files.map((file: string) => {
      const content = fs.readFileSync(file, 'utf8')
      return new Document({ pageContent: content, metadata: { source: path.basename(file), full_path: file } })
    })
  }

  // Split into chunks
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 })
  const chunks = await splitter.splitDocuments(docs)
  log(LogLevel.DEBUG, 'Split %d documents into %d chunks for project "%s".', docs.length, chunks.length, projectName)

  // Build embeddings and store
  const embeddings = new HuggingFaceTransformersEmbeddings({ modelName: 'Xenova/all-MiniLM-L6-v2' })
  log(LogLevel.DEBUG, 'Initializing FaissStore for project "%s".', projectName)
  const store = await FaissStore.fromDocuments(chunks, embeddings)
  log(LogLevel.INFO, 'FaissStore created successfully for project "%s" with %d chunks.', projectName, chunks.length)

  return store
}

/**
 * List all files for a given project without loading the vector store.
 */
export async function listProjectFiles(projectName: string): Promise<string[]> {
  log(LogLevel.INFO, 'Listing files for project "%s"', projectName);
  const projectsPath = path.resolve('projects.json');
  let catalog: Record<string, string | string[]> = {};
  let patterns: string[] = [];

  if (fs.existsSync(projectsPath)) {
    try {
      catalog = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
      log(LogLevel.DEBUG, 'Loaded projects.json catalog for listProjectFiles.');
    } catch (err: any) {
      log(LogLevel.WARN, 'projects.json found but could not be parsed for listProjectFiles. Proceeding without catalog. Error: %s', err.message);
    }
  }

  const projectEntry = catalog[projectName];
  if (projectEntry) {
    log(LogLevel.DEBUG, 'Project "%s" found in projects.json for listing files.', projectName);
    const entries = typeof projectEntry === 'string' ? [projectEntry] : projectEntry;
    patterns = entries.map(p => {
      const resolvedPath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
        return path.join(resolvedPath, '**/*');
      }
      return resolvedPath;
    });
  } else {
    log(LogLevel.DEBUG, 'Project "%s" not in projects.json for listing. Checking default directory.', projectName);
    const defaultProjectDir = path.resolve(process.cwd(), 'projects', projectName);
    if (fs.existsSync(defaultProjectDir) && fs.statSync(defaultProjectDir).isDirectory()) {
      log(LogLevel.DEBUG, 'Found directory for project "%s" at: %s for listing files.', projectName, defaultProjectDir);
      patterns = [path.join(defaultProjectDir, '**/*')];
    } else {
      log(LogLevel.ERROR, 'Project "%s" not found in projects.json and no corresponding directory found for listing files.', projectName);
      throw new Error(`Unknown or unconfigured project: ${projectName} (for listing files)`);
    }
  }

  log(LogLevel.DEBUG, 'Using patterns for listing files in project "%s": %j', projectName, patterns);

  if (patterns.length === 0) {
    log(LogLevel.INFO, 'No patterns defined for project "%s", cannot list files.', projectName);
    return []; // Or throw an error if patterns are strictly required from one of the sources
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
  });

  log(LogLevel.INFO, 'Found %d files for project "%s".', files.length, projectName);
  return files.map(f => path.relative(process.cwd(), f)); // Return relative paths for cleaner output
}