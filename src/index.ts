import 'dotenv/config'
import readline from 'readline'

import type { MemoryVectorStore } from 'langchain/vectorstores/memory'

import { addNode } from './memorySql'
import { initVectorStore, upsertDocument } from './memoryVector'
import { buildRagChain } from './ragChain'
import {
  loadPlugins,
  initPlugins,
  handleUserInput,
  handleAssistantResponse,
} from './pluginManager'

// Module-scoped variables for REPL handlers
let vectorStore: MemoryVectorStore
let ragChain: any

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('Error: Missing OPENAI_API_KEY in .env')
    process.exit(1)
  }

  // Initialize vector store and RAG chain
  vectorStore = await initVectorStore()
  ragChain = await buildRagChain(apiKey, vectorStore)

  // Load and initialize plugins
  await loadPlugins()
  await initPlugins({ apiKey, vectorStore, ragChain })

  // Start interactive REPL
  startREPL()
}

function startREPL() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  })

  rl.prompt()
  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }

    // Plugin pre-processing
    const userText = await handleUserInput(input)

    // Record user message in SQL memory and vector store
    const userNodeId = addNode(userText, 'user')
    await upsertDocument(vectorStore, userText, userNodeId)

    // Invoke the RAG chain and extract just the answer
    const { answer: assistantText } = await ragChain.invoke({ input: userText }) as any

    // Record assistant message in memory
    const assistNodeId = addNode(assistantText, 'assistant', [userNodeId])
    await upsertDocument(vectorStore, assistantText, assistNodeId)

    // Plugin post-processing
    await handleAssistantResponse(assistantText)

    console.log('Assistant:', assistantText)
    rl.prompt()
  })

  rl.on('close', () => {
    console.log('Goodbye!')
    process.exit(0)
  })
}

main()
