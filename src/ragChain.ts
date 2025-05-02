import { ChatOpenAI } from '@langchain/openai'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { ChatPromptTemplate } from '@langchain/core/prompts'

/**
 * Build a RAG chain using the new LCEL helper functions.
 */
export async function buildRagChain(apiKey: string, store: any) {
  const llm = new ChatOpenAI({ openAIApiKey: apiKey })
  // Prompt template combining context and user input
  const prompt = ChatPromptTemplate.fromTemplate(
    "Answer the user's question: {input} based on the following context {context}"
  )
  // Chain to stuff documents into prompt
  const combineDocsChain = await createStuffDocumentsChain({ llm, prompt })
  // Combine retriever + QA chain
  return createRetrievalChain({ retriever: store.asRetriever(), combineDocsChain })
}
