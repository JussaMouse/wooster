import Database from 'better-sqlite3'

const db = new Database('memory.db')

// Ensure the nodes and edges tables exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    speaker TEXT NOT NULL
  )
`).run()

db.prepare(`
  CREATE TABLE IF NOT EXISTS edges (
    parent INTEGER NOT NULL,
    child INTEGER NOT NULL,
    FOREIGN KEY(parent) REFERENCES nodes(id),
    FOREIGN KEY(child) REFERENCES nodes(id)
  )
`).run()

// Define a typed interface for nodes
export interface MemoryNode {
  id: number
  content: string
  speaker: string
}

/**
 * Add a new node with optional parent links.
 * Returns the new node ID.
 */
export function addNode(
  content: string,
  speaker: 'user' | 'assistant',
  parents: number[] = []
): number {
  const insertNode = db.prepare(
    'INSERT INTO nodes (content, speaker) VALUES (?, ?)'
  )
  // Ensure only strings or primitives are bound
  const result = insertNode.run(
    `${content}`,
    `${speaker}`
  )
  const nodeId = result.lastInsertRowid as number
  const insertEdge = db.prepare('INSERT INTO edges (parent, child) VALUES (?, ?)')
  for (const p of parents) {
    insertEdge.run(p, nodeId)
  }
  return nodeId
}

/**
 * Retrieve a node by ID.
 */
export function getNode(id: number): MemoryNode | undefined {
  return db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as MemoryNode | undefined
}

/**
 * Get direct children of a node.
 */
export function getChildren(parentId: number): MemoryNode[] {
  return db.prepare(
    `SELECT n.id, n.content, n.speaker
     FROM nodes n
     JOIN edges e ON e.child = n.id
     WHERE e.parent = ?`
  ).all(parentId) as MemoryNode[]
}

/**
 * Get direct parents of a node.
 */
export function getParents(childId: number): MemoryNode[] {
  return db.prepare(
    `SELECT n.id, n.content, n.speaker
     FROM nodes n
     JOIN edges e ON e.parent = n.id
     WHERE e.child = ?`
  ).all(childId) as MemoryNode[]
}

/**
 * Recursively collect ancestors up to a max depth.
 */
export function getAncestors(
  id: number,
  maxDepth = 10
): MemoryNode[] {
  let frontier = [{ id }]
  const ancestors: { id: number; content: string; speaker: string }[] = []
  for (let depth = 0; depth < maxDepth; depth++) {
    const nextFrontier: typeof frontier = []
    for (const node of frontier) {
      const parents: MemoryNode[] = getParents(node.id)
      for (const p of parents) {
        if (!ancestors.find(a => a.id === p.id) && !frontier.find(f => f.id === p.id)) {
          ancestors.push(p)
          nextFrontier.push(p)
        }
      }
    }
    if (nextFrontier.length === 0) break
    frontier = nextFrontier
  }
  return ancestors as MemoryNode[]
}
