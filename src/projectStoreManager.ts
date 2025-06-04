import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import path from 'path';
import fs from 'fs';
import { log, LogLevel } from './logger';
import { AppConfig } from './configLoader';

/**
 * Initializes or rebuilds a FaissStore vector store for a given project.
 * Reads .md and .txt files from the project's root directory, splits them into chunks,
 * generates embeddings using OpenAI, and saves the store to a 'vectorStore' subdirectory
 * within the project's path. If an existing store is found, it's cleared first.
 *
 * @param projectName The name of the project.
 * @param projectPath The absolute path to the project's root directory.
 * @param embeddingsInstance An instance of OpenAIEmbeddings.
 * @param appConfig The application configuration.
 * @returns A Promise that resolves to the initialized FaissStore.
 */
export async function initializeProjectVectorStore(projectName: string, projectPath: string, embeddingsInstance: OpenAIEmbeddings, appConfig: AppConfig): Promise<FaissStore> {
  const storeDirPath = path.join(projectPath, 'vectorStore');
  log(LogLevel.INFO, `Initializing vector store for project \"${projectName}\" at ${storeDirPath}`);

  if (fs.existsSync(storeDirPath)) {
    log(LogLevel.INFO, `Clearing existing vector store at ${storeDirPath} to rebuild.`);
    const indexFilePath = path.join(storeDirPath, 'faiss.index');
    const docstoreFilePath = path.join(storeDirPath, 'docstore.json');
    try {
        if (fs.existsSync(indexFilePath)) {
            fs.unlinkSync(indexFilePath);
            log(LogLevel.DEBUG, `Deleted ${indexFilePath}`);
        }
        if (fs.existsSync(docstoreFilePath)) {
            fs.unlinkSync(docstoreFilePath);
            log(LogLevel.DEBUG, `Deleted ${docstoreFilePath}`);
        }
    } catch (err: any) {
        log(LogLevel.WARN, `Could not fully delete old vector store contents from ${storeDirPath}: ${err.message}`);
    }
  } else {
      fs.mkdirSync(storeDirPath, { recursive: true });
  }

  const documents: Document[] = [];
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100,
  });

  const filesToRead = fs.readdirSync(projectPath);

  for (const file of filesToRead) {
    const fileExtension = path.extname(file).toLowerCase();
    if (fileExtension === '.md' || fileExtension === '.txt') {
      const filePath = path.join(projectPath, file);
      if (fs.statSync(filePath).isFile()) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const chunks = await splitter.splitText(content);
          chunks.forEach((chunk, index) => {
            documents.push(new Document({
              pageContent: chunk,
              metadata: {
                source: file,
                project: projectName,
                chunkNumber: index + 1,
                totalChunks: chunks.length
              }
            }));
          });
          log(LogLevel.INFO, `Prepared document for indexing: ${file} (Project: ${projectName}, Chunks: ${chunks.length})`);
        } catch (err: any) {
          log(LogLevel.WARN, `Failed to read or prepare document ${filePath}: ${err.message}`);
        }
      }
    }
  }

  let store: FaissStore;
  if (documents.length > 0) {
    store = await FaissStore.fromDocuments(documents, embeddingsInstance);
    log(LogLevel.INFO, `Created vector store with ${documents.length} document(s) for project \"${projectName}\".`);
  } else {
    log(LogLevel.INFO, `No documents found to index for project \"${projectName}\". Creating an empty store with a dummy document.`);
    // Create a store with a placeholder document if no actual documents are found
    const placeholderContent = `This is the project space for '${projectName}'. No .md or .txt documents were found in its root directory at initialization.`;
    store = await FaissStore.fromTexts([placeholderContent], [{ project: projectName, source: 'placeholder' }], embeddingsInstance);
  }
  
  await store.save(storeDirPath);
  log(LogLevel.INFO, `Vector store for project \"${projectName}\" saved to ${storeDirPath}`);
  return store;
} 