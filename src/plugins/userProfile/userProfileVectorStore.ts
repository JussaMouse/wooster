import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import path from 'path';
import { promises as fs } from 'fs';
import { log, LogLevel } from '../../logger';

const getBaseVectorStorePath = (storePath: string) => path.join(storePath, 'user_profile_vector_store.json');

async function safeWrite(filePath: string, data: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;
  const dir = path.dirname(filePath);
  
  // --- Sanity Check ---
  try {
    const stats = await fs.stat(filePath);
    if (Buffer.byteLength(data, 'utf8') < stats.size) {
      log(LogLevel.ERROR, 'Potential data loss detected. New user profile data is smaller than existing. Aborting write.', { newSize: Buffer.byteLength(data, 'utf8'), oldSize: stats.size });
      throw new Error('Aborted write to prevent potential data loss.');
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') { // If it's not a "file not found" error, re-throw.
      throw error;
    }
    // File doesn't exist, which is fine for the first write.
  }

  // --- Manage Dated Backups ---
  try {
    const backupFiles = (await fs.readdir(dir)).filter(f => f.match(/^user_profile_vector_store\.\d{4}-\d{2}-\d{2}\.bak$/));
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const latestBackup = backupFiles
      .map(f => new Date(f.split('.')[1]))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    if (!latestBackup || latestBackup < sevenDaysAgo) {
      const dateStamp = new Date().toISOString().split('T')[0];
      const newBackupPath = path.join(dir, `user_profile_vector_store.${dateStamp}.bak`);
      await fs.copyFile(filePath, newBackupPath);
      log(LogLevel.INFO, `Created new weekly user profile backup: ${newBackupPath}`);

      // Prune oldest if we have more than 3
      if (backupFiles.length >= 3) {
        const oldestBackup = backupFiles.sort()[0];
        await fs.unlink(path.join(dir, oldestBackup));
        log(LogLevel.INFO, `Pruned oldest user profile backup: ${oldestBackup}`);
      }
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') { // It's ok if the source file doesn't exist for the first backup
      log(LogLevel.WARN, 'Could not manage dated backups.', { error: error.message });
    }
  }

  // --- Atomic Write ---
  await fs.writeFile(tempPath, data, 'utf8');
  try {
    await fs.rename(filePath, backupPath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') { throw error; }
  }
  await fs.rename(tempPath, filePath);
  log(LogLevel.INFO, `User profile data safely written to ${filePath}`);
}

async function createVectorStoreFromJson(jsonPath: string, embeddings: OpenAIEmbeddings): Promise<MemoryVectorStore> {
  const jsonContent = await fs.readFile(jsonPath, 'utf-8');
  const revivedDocs = (JSON.parse(jsonContent) as any[]).map(
    (doc) => new Document({ pageContent: doc.pageContent, metadata: doc.metadata })
  );
  return MemoryVectorStore.fromDocuments(revivedDocs, embeddings);
}

export async function initUserProfileStore(storePath: string): Promise<MemoryVectorStore> {
  const embeddings = new OpenAIEmbeddings();
  const vectorStoreJsonPath = getBaseVectorStorePath(storePath);

  try {
    await fs.access(vectorStoreJsonPath);
    return await createVectorStoreFromJson(vectorStoreJsonPath, embeddings);
  } catch (error) {
    log(LogLevel.INFO, 'No user profile vector store found. Creating a new one.');
    await fs.mkdir(storePath, { recursive: true });
    
    const placeholderDoc = new Document({
      pageContent: "This is the beginning of the user's profile. Information about the user will be stored here.",
      metadata: { source: 'initialization' },
    });
    
    await safeWrite(vectorStoreJsonPath, JSON.stringify([placeholderDoc], null, 2));

    return MemoryVectorStore.fromDocuments([placeholderDoc], embeddings);
  }
}

async function saveStore(store: MemoryVectorStore, storePath: string) {
  const docs = store.memoryVectors.map(
    (mv: { content: string; metadata: object; }) => new Document({ pageContent: mv.content, metadata: mv.metadata })
  );
  const vectorStoreJsonPath = getBaseVectorStorePath(storePath);
  await safeWrite(vectorStoreJsonPath, JSON.stringify(docs, null, 2));
}

export async function addTextToUserProfile(
  store: MemoryVectorStore,
  text: string,
  metadata: object,
  storePath: string
): Promise<void> {
  await store.addDocuments([new Document({ pageContent: text, metadata })]);
  await saveStore(store, storePath);
}

export async function searchUserProfile(
  store: MemoryVectorStore,
  query: string,
  k = 3
): Promise<Array<{ pageContent: string; metadata: object }>> {
  const results = await store.similaritySearch(query, k);
  return results.map((doc: Document) => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata,
  }));
} 