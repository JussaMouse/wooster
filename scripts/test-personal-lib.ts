import { KnowledgeBaseService } from '../src/services/knowledgeBase/KnowledgeBaseService';
import { IngestionService } from '../src/services/ingestion/IngestionService';
import { getConfig, loadConfig } from '../src/configLoader';
import { applyLoggerConfig, bootstrapLogger, LogLevel } from '../src/logger';
import fs from 'fs';

async function testPersonalLib() {
  bootstrapLogger();
  loadConfig();
  const config = getConfig();
  applyLoggerConfig({ ...config.logging, consoleLogLevel: LogLevel.INFO });

  console.log('--- Testing Personal Library ---');

  // 1. Initialize KB
  const kb = KnowledgeBaseService.getInstance();
  console.log('KB Initialized.');

  // 2. Ingest a test file
  const testFile = 'notes/test-note-manual.md';
  if (!fs.existsSync('notes')) fs.mkdirSync('notes');
  
  fs.writeFileSync(testFile, `---
title: Manual Test Note
tags: [test, manual]
---
# Manual Test

This is a note created to test the ingestion service manually.
It links to [[proj-home]].
`);

  console.log(`Created test file: ${testFile}`);

  // 3. Manually trigger ingest (via IngestionService, usually watcher does this)
  const ingestion = IngestionService.getInstance();
  ingestion.queueFile(testFile);
  
  // Wait for processing
  console.log('Waiting for ingestion...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 4. Query
  console.log('Querying KB...');
  const result = await kb.queryHybrid({ query: 'manual test', topK: 3 });
  
  console.log('Query Results:', JSON.stringify(result.contexts, null, 2));

  if (result.contexts.length > 0) {
      console.log('✅ Success: Found inserted note.');
  } else {
      console.error('❌ Failure: No results found.');
  }
  
  // Clean up
  // fs.unlinkSync(testFile);
  // kb.deleteDocument(testFile); // Optional
}

testPersonalLib().catch(console.error);

