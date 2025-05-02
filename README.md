# Jeeves II Ground-Up Rebuild Plan

This guide walks you through building Jeeves II from scratch on macOS with TypeScript, pnpm, SQLite DAG memory, a local vector store, LangChain RAG, and an extensible plugin architecture.

## 0. License & README

- Add a `LICENSE` file (MIT or Apache-2.0) at the project root.
- Create `README.md` with project overview, prerequisites, and quick-start steps.

---

## Prerequisites

- macOS with Homebrew installed
- Node.js ≥ 18 (LTS)
- pnpm installed globally
- OpenAI API key in a `.env` file
- ESLint & Prettier for code quality
- Husky + lint-staged for pre-commit hooks

### Install Dependencies
```bash
# 1) If you don't have Homebrew:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2) Install Node.js
brew install node

# 3) Install pnpm globally
npm install -g pnpm
```

## 1. Initialize the Project

```bash
# 1) Clone or create project directory
cd ~/projects
git clone https://github.com/your-org/jeeves_ii.git || mkdir jeeves_ii && cd jeeves_ii

# Initialize git and make initial commit
git init
git add .
git commit -m "chore: initial scaffold"

# 2) Initialize pnpm & TypeScript
pnpm init
pnpm add openai dotenv better-sqlite3 langchain @chromadb/chromadb
pnpm add -D typescript ts-node @types/node tsx
```

## 2. Set Up Environment Files & Git Ignore

```bash
# Create a `.env.example` for onboarding
cat <<EOF > .env.example
OPENAI_API_KEY=your_api_key_here
EMAIL_ADDRESS=your_email_address_here          # The address to send Jeeves emails to/from
GMAIL_CLIENT_ID=your_gmail_oauth_client_id      # OAuth2 credentials from Google Cloud Console
GMAIL_CLIENT_SECRET=your_gmail_oauth_client_secret
GMAIL_REFRESH_TOKEN=your_gmail_oauth_refresh_token
EOF

# Copy to `.env` and fill in real secrets
cp .env.example .env

cat <<EOF >> .gitignore
node_modules/
.env
memory.db
vector_data/
EOF
```

## 3. Configure TypeScript (`tsconfig.json`)

```bash
pnpm exec tsc --init --rootDir src --outDir dist --target es2017 \
  --module commonjs --strict true --skipLibCheck true
```

Ensure the `include` section covers your source:
```json
// tsconfig.json
{
  // ... other settings ...
  "include": ["src/**/*.ts"]
}
```

## 4. Create Source Structure

```bash
mkdir src
cd src
# Create core modules
touch index.ts memorySql.ts memoryVector.ts ragChain.ts pluginManager.ts

cd ..
```

## 5. Implement SQLite DAG Memory (`src/memorySql.ts`)

Manually paste or write your SQLite DAG memory code:
```typescript
// src/memorySql.ts
import Database from 'better-sqlite3'
const db = new Database('memory.db')
// CREATE TABLE nodes(id INTEGER PRIMARY KEY, content TEXT, speaker TEXT)
// CREATE TABLE edges(parent INTEGER, child INTEGER)
// Export addNode(content, speaker, parents?) → nodeId
export function addNode(
  content: string,
  speaker: 'user' | 'assistant',
  parents: number[] = []
): number {
  // ... implementation here ...
}
```

## 6. Implement In-Memory Vector Memory (`src/memoryVector.ts`)
```typescript
import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { FakeEmbeddings } from 'langchain/embeddings/fake'
import { Document } from 'langchain/document'

export async function initVectorStore() {
  const embeddings = new FakeEmbeddings()
  return MemoryVectorStore.fromTexts([], [], embeddings)
}

export async function upsertDocument(
  store: MemoryVectorStore,
  text: string,
  nodeId: number
) {
  const doc: Document = { pageContent: text, metadata: { nodeId } }
  await store.addDocuments([doc])
}

export async function retrieveContext(
  store: MemoryVectorStore,
  query: string,
  k = 5
): Promise<Document[]> {
  return store.similaritySearch(query, k)
}
```

## 7. Build the RAG Chain (`src/ragChain.ts`)
```typescript
// src/ragChain.ts
import { ChatOpenAI } from '@langchain/openai'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { ChatPromptTemplate } from '@langchain/core/prompts'

export async function buildRagChain(apiKey: string, store: any) {
  const llm = new ChatOpenAI({ openAIApiKey: apiKey })

  // 1) Define prompt with context and user question
  const prompt = ChatPromptTemplate.fromTemplate(
    "Answer the user's question: {input} based on the following context {context}"
  )

  // 2) Build a chain to stuff docs into prompt
  const combineDocsChain = await createStuffDocumentsChain({ llm, prompt })

  // 3) Wire up retriever + QA chain
  return createRetrievalChain({
    retriever: store.asRetriever(),
    combineDocsChain,
  })
}
```

## 8. Add Plugin Architecture (`src/pluginManager.ts`)

Create a plugin manager with hooks for future extensibility:
```typescript
// src/pluginManager.ts
import { readdirSync } from 'fs'
import { join } from 'path'

export type PluginContext = { apiKey: string; vectorStore: any; ragChain: any }

export interface Plugin {
  name: string
  onInit?: (ctx: PluginContext) => Promise<void> | void
  onUserInput?: (input: string) => Promise<string> | string
  onAssistantResponse?: (response: string) => Promise<void> | void
}

const plugins: Plugin[] = []

export async function loadPlugins() {
  const dir = join(__dirname, 'plugins')
  let files: string[] = []
  try { files = readdirSync(dir).filter(f => /\.(ts|js)$/.test(f)) } catch { return }
  for (const f of files) {
    const mod = await import(join(dir, f))
    const plugin: Plugin = mod.default
    if (plugin?.name) { plugins.push(plugin); console.log(`Loaded: ${plugin.name}`) }
  }
}

export async function initPlugins(ctx: PluginContext) {
  for (const p of plugins) if (p.onInit) await p.onInit(ctx)
}

export async function handleUserInput(input: string) {
  let out = input
  for (const p of plugins) if (p.onUserInput) out = await p.onUserInput(out)
  return out
}

export async function handleAssistantResponse(resp: string) {
  for (const p of plugins) if (p.onAssistantResponse) await p.onAssistantResponse(resp)
}
```

### 8.a Email Plugin

Add an email plugin so Jeeves will send each assistant response to you via Gmail SMTP with OAuth2:

```typescript
// src/plugins/emailPlugin.ts
import nodemailer from 'nodemailer'
import type { Plugin } from '../pluginManager'

const emailPlugin: Plugin = {
  name: 'email',
  onAssistantResponse: async (response: string) => {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.EMAIL_ADDRESS,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      },
    })
    await transporter.sendMail({
      from: process.env.EMAIL_ADDRESS,
      to: process.env.EMAIL_ADDRESS,
      subject: 'Jeeves says:',
      text: response,
    })
  },
}
export default emailPlugin
```

The plugin manager auto-loads anything in `src/plugins/`. Just drop `emailPlugin.ts` there and restart the CLI. Ensure your `.env` has the four new vars above. Happy emailing!

## 9. Glue Everything in the CLI (`src/index.ts`)
```diff
import dotenv from 'dotenv'
import readline from 'readline'
import { addNode } from './memorySql'
import { initVectorStore, upsertDocument, retrieveContext } from './memoryVector'
import { buildRagChain } from './ragChain'
import { loadPlugins, initPlugins, handleUserInput, handleAssistantResponse } from './pluginManager'

async function main() {
  vectorStore = await initVectorStore()
  ragChain = await buildRagChain(apiKey, vectorStore)
  await loadPlugins()
  await initPlugins({ apiKey, vectorStore, ragChain })
  startREPL()
}

function startREPL() {
  rl.on('line', async (line) => {
    const userText = await handleUserInput(line.trim())
    // record in memory & vector store...
    const { answer: assistant } = await ragChain.invoke({ input: userText })
    console.log('Assistant:', assistant)
    await handleAssistantResponse(assistant)
    rl.prompt()
  })
}
```

## 10. Update `package.json` Scripts

```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "pnpm run build && node dist/index.js"
  }
}
```

## 11. Run & Test

```bash
pnpm run dev
# > Hello, Jeeves!
# Assistant: Hi there! How can I help?
```

## 12. Linting, Testing & CI

- Install dev dependencies:
  ```bash
  pnpm add -D eslint prettier husky lint-staged jest @types/jest ts-jest
  ```
- Initialize ESLint & Prettier:
  ```bash
  pnpm exec eslint --init
  ```
- Setup Husky & lint-staged:
  ```bash
  pnpm dlx husky-init && pnpm install
  pnpm pkg set scripts.prepare="husky install"
  npx husky add .husky/pre-commit "pnpm lint-staged"
  ```
- Add `lint-staged` config in `package.json`:
  ```json
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"]
  }
  ```
- Create basic Jest tests under `src/__tests__/`.
- Add a GitHub Actions workflow in `.github/workflows/ci.yml` to run lint, typechecks, and tests on push.

---

With this plan you'll have a modular, extensible CLI assistant ready for further plugin integrations (Obsidian, filesystem ops, etc.). Happy coding! 