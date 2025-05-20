import 'dotenv/config'
import readline from 'readline'
// import fs from 'fs'
// import path from 'path'

import type { FaissStore } from '@langchain/community/vectorstores/faiss'
import { ChatOpenAI } from '@langchain/openai'
// import type { BaseLanguageModel } from '@langchain/core/language_models/base'

// import { addNode } from './memorySql'
import { initVectorStore } from './memoryVector'
// import { buildRagChain } from './ragChain'
import { agentRespond, availableTools } from './agent'
import {
  loadPlugins,
  initPlugins,
  // handleUserInput, // Part of pluginManager, but direct calls might be superseded by agent logic
  // handleAssistantResponse, // Part of pluginManager
  listPlugins,
} from './pluginManager'
import { createProjectStore, listProjectFiles } from './projectIngestor'
import { initDatabase as initSchedulerDB } from './scheduler/reminderRepository'
import { initSchedulerService } from './scheduler/schedulerService'
import { initHeartbeatService, stopHeartbeatService } from './heartbeat'
// Removed placeholder imports: яйцо, 간단한툴, وزارة_الداخلية, списокИнструментов

import { createRetrievalChain } from 'langchain/chains/retrieval'
import { createStuffDocumentsChain } from "langchain/chains/combine_documents"
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"
import { AIMessage, HumanMessage } from "@langchain/core/messages"
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever"

// Module-scoped variables
let vectorStore: FaissStore
let ragChain: any
let llm: ChatOpenAI
let currentProjectName: string | null = null
let conversationHistory: (HumanMessage | AIMessage)[] = []

// Prompts moved to module scope
const historyAwarePrompt = ChatPromptTemplate.fromMessages([
    new MessagesPlaceholder("chat_history"),
    ["user", "{input}"],
    ["user", "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation"],
])

const answerPrompt = ChatPromptTemplate.fromMessages([
    ["system", "Answer the user's questions based on the below context. If you don't know the answer, say you don't know.\n\n{context}"],
    new MessagesPlaceholder("chat_history"),
    ["user", "{input}"],
])

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('Error: Missing OPENAI_API_KEY in .env')
    process.exit(1)
  }

  llm = new ChatOpenAI({ apiKey, modelName: "gpt-4o", temperature: 0.2 })

  initSchedulerDB()

  await initSchedulerService(schedulerAgentCallback)
  initHeartbeatService()

  vectorStore = await initVectorStore()
  await initializeRagChain()

  // Load and initialize plugins (if still part of the desired architecture)
  // await loadPlugins()
  // await initPlugins({ apiKey, llm, vectorStore, ragChain })
  // Load and initialize plugins
  await loadPlugins()
  await initPlugins({ apiKey, vectorStore, ragChain })

  // Start interactive REPL
  startREPL()
}

function startREPL() {
  console.log("Wooster is operational. Type 'exit' or 'quit' to stop.")
  console.log("Available commands: 'list files', 'list plugins', 'list tools', 'ingest default', 'exit', 'quit'.")
  console.log("Otherwise, type your query for Wooster.")

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  })

  rl.prompt()
  rl.on('line', async (line) => {
    const input = line.trim()
    conversationHistory.push(new HumanMessage(input))
    // Cap history to last 10 messages (5 pairs)
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-10)
    }

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      stopHeartbeatService()
      console.log('Exiting Wooster...')
      rl.close()
      process.exit(0)
    } else if (input.toLowerCase() === 'ingest default') {
      console.log('Re-initializing default vector store...')
      vectorStore = await initVectorStore()
      await initializeRagChain()
      console.log('Default vector store re-initialized.')
    } else if (input.toLowerCase() === 'list files') {
      if (currentProjectName) {
        try {
          const files = await listProjectFiles(currentProjectName)
          console.log(`Project files for "${currentProjectName}":\n`, files.join('\n'))
        } catch (error: any) {
          console.error(`Error listing files for project "${currentProjectName}": ${error.message}`)
        }
      } else {
        console.log("No project loaded. Use 'load project <name>' to load a project first. (This command lists files for the currently loaded project)")
      }
    } else if (input.toLowerCase() === 'list plugins') {
      const pluginNames = listPlugins()
      if (pluginNames.length === 0) {
        console.log("No plugins currently registered.")
      } else {
        console.log("Registered plugin names:")
        pluginNames.forEach(name => console.log(`- ${name}`))
      }
    } else if (input.toLowerCase() === 'list tools') {
      if (availableTools.length === 0) {
        console.log("No tools currently available to the agent.")
      } else {
        console.log("Available agent tools:")
        availableTools.forEach(t => console.log(`- ${t.name}: ${t.description}`))
      }
    } else {
      if (!ragChain) {
        console.log("Assistant is not ready yet, RAG chain is initializing...")
        rl.prompt()
        return
      }
      const response = await agentRespond(input, llm, async (query) => {
        const result = await ragChain.invoke({ input: query, chat_history: conversationHistory })
        return result.answer
      })
      
      console.log("Assistant:", response)
      if (response) conversationHistory.push(new AIMessage(response))
    }
    rl.prompt()
  })

  rl.on('close', () => {
    stopHeartbeatService()
    console.log('Exiting Wooster...')
    process.exit(0)
  })
}

async function initializeRagChain() {
  if (!vectorStore) {
    console.error("Vector store not initialized. Cannot create RAG chain.")
    return
  }
  const retriever = vectorStore.asRetriever()
  // No need to check if retriever is null, asRetriever() should return one or throw if store is invalid

  const historyAwareRetrieverChain = await createHistoryAwareRetriever({
    llm,
    retriever,
    rephrasePrompt: historyAwarePrompt,
  })

  const stuffDocumentsChain = await createStuffDocumentsChain({
    llm,
    prompt: answerPrompt,
  })

  ragChain = await createRetrievalChain({
    retriever: historyAwareRetrieverChain,
    combineDocsChain: stuffDocumentsChain,
  })
  console.log("RAG chain initialized successfully.")
}

// Define the agent execution callback for the scheduler
async function schedulerAgentCallback(taskPayload: string): Promise<void> {
  console.log(`Scheduler executing agent task. Payload: "${taskPayload}"`)
  try {
    if (!ragChain || !llm) {
      console.error("RAG chain or LLM not initialized. Cannot execute scheduled agent task.")
      return
    }
    const response = await agentRespond(taskPayload, llm, async (query) => {
      const result = await ragChain.invoke({ input: query, chat_history: [] })
      return result.answer
    }, undefined, true);
    console.log(`Scheduled agent task response: "${response}" (Note: This is the agent's textual response, actual tool actions like email would have occurred silently)`)
  } catch (error) {
    console.error("Error during scheduled agent task execution:", error)
  }
}

main().catch(error => {
  console.error("Critical error in main function:", error)
  stopHeartbeatService()
  process.exit(1)
})
