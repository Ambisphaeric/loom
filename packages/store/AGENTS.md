# @enhancement/store

Persistent storage with pluggable vector engine (zvec default, sqlite-vec, chroma) for chunk storage and retrieval.

## Purpose

Provides persistent storage for Enhancement chunks with SQLite-backed metadata and pluggable vector engines for embedding storage. Supports session-scoped storage, RAG document management, and user profile storage.

## Key Domain Concepts

- **EnhancementStore**: Main store managing chunks, profiles, and embeddings.
- **SessionStore**: Scoped store for a specific session with simplified API.
- **VectorEngine**: Pluggable backends for embeddings (zvec, sqlite-vec, chroma).
- **VectorEngineAdapter**: Interface for vector storage implementations.
- **ChunkRow**: Database row representation of a chunk.
- **UserProfile**: Per-workspace user data including summaries and preferences.
- **RAG Docs**: Document storage for retrieval-augmented generation.

## Public API

### Store Initialization

```typescript
import { createStore, EnhancementStore } from '@enhancement/store';

// In-memory store (default zvec engine)
const memoryStore = createStore();

// File-backed store
const fileStore = createStore({
  dbPath: "./data/enhancement.db",
  engine: "zvec",
  embeddingDim: 384,
});

// Initialize
await fileStore.init();

// Get engine info
const engineType = fileStore.getEngineType(); // "zvec"
```

### Storing Chunks

```typescript
import type { ContextChunk } from '@enhancement/types';

const chunk: ContextChunk = {
  kind: "context",
  id: "chunk-123",
  source: "screenpipe",
  transform: "summarize",
  workspace: "workspace-1",
  sessionId: "session-123",
  content: "Meeting notes...",
  contentType: "text/plain",
  timestamp: Date.now(),
  generation: 1,
  ttl: 86400, // 24 hours in seconds
  metadata: { priority: "high" },
  embeddings: [0.1, 0.2, 0.3, ...], // Optional vector embedding
};

await fileStore.store(chunk);
```

### Querying Chunks

```typescript
import type { MemoryFilter } from '@enhancement/types';

// Text search
const results = await fileStore.query("meeting notes", {}, 20);

// With filters
const filtered = await fileStore.query("project", {
  workspace: "workspace-1",
  sessionId: "session-123",
  contentType: "text/plain",
  after: Date.now() - 86400000, // Last 24 hours
}, 10);

// Scan with cursor (pagination)
const scanResult = await fileStore.scan("", { workspace: "ws-1" }, 100);
// { chunks: [...], nextCursor: "chunk-xxx" }

const page2 = await fileStore.scan(scanResult.nextCursor, { workspace: "ws-1" }, 100);
```

### Managing Data

```typescript
// Forget (delete) chunks
const deletedCount = await fileStore.forget({
  workspace: "workspace-1",
  before: Date.now() - 7 * 24 * 60 * 60 * 1000, // Older than 7 days
});

// Prune expired TTL chunks
const pruned = await fileStore.prune("workspace-1");

// Cleanup
fileStore.close();
```

### User Profiles

```typescript
// Get profile
const profile = await fileStore.getProfile("workspace-1");
// {
//   workspace: "workspace-1",
//   summary: "User summary...",
//   frequentActions: ["action1", "action2"],
//   dismissedPatterns: ["pattern1"],
//   lastUpdated: 1234567890
// }

// Update profile
await fileStore.updateProfile({
  workspace: "workspace-1",
  summary: "Updated summary",
  frequentActions: ["new-action"],
  dismissedPatterns: [],
  lastUpdated: Date.now(),
});
```

### Session Store

```typescript
import { createSessionStore } from '@enhancement/store';

// Create session-scoped store
const sessionStore = createSessionStore(fileStore, "session-123");

// All operations are scoped to this session
await sessionStore.store(chunk); // sessionId auto-set

// Query automatically filtered by session
const sessionResults = await sessionStore.query("notes");

// RAG document management
await sessionStore.addRagDocs([
  {
    id: "doc-1",
    content: "Document content...",
    metadata: { source: "upload" },
  },
]);

await sessionStore.removeRagDocs(["doc-1"]);

// Session cleanup
await sessionStore.prune(); // Removes old session data

// Session stats
const stats = await sessionStore.getStats();
// { totalChunks: 42, ragDocs: 3 }
```

### Vector Engines

```typescript
import { createEngine, getEngineInfo } from '@enhancement/store';

// Get engine info
const zvecInfo = getEngineInfo("zvec");
// { name: "zvec", description: "...", default: true }

// Create custom engine
const engine = await createEngine("zvec", 384);

// Available engines:
// - "zvec": High-performance in-process (default)
// - "sqlite-vec": SQLite extension for vector search
// - "chroma": External Chroma vector database
```

### Engine Adapters

```typescript
import { ZvecAdapter, SqliteVecAdapter, ChromaAdapter } from '@enhancement/store';

// Direct adapter usage
const zvec = new ZvecAdapter(384);
await zvec.init(db);

await zvec.upsert("chunk-123", [0.1, 0.2, 0.3, ...]);

const results = await zvec.search([0.1, 0.2, 0.3, ...], 10);
// [{ chunk_id: "...", embedding: Float32Array, distance: 0.1 }]

await zvec.delete(["chunk-123"]);
await zvec.cleanup();
```

## Database Schema

```sql
-- Chunks table
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  transform TEXT,
  workspace TEXT NOT NULL,
  session_id TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0,
  ttl INTEGER,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX idx_chunks_workspace ON chunks(workspace);
CREATE INDEX idx_chunks_session ON chunks(session_id);
CREATE INDEX idx_chunks_timestamp ON chunks(timestamp);
CREATE INDEX idx_chunks_content_type ON chunks(content_type);

-- Profiles table
CREATE TABLE profiles (
  workspace TEXT PRIMARY KEY,
  summary TEXT NOT NULL DEFAULT '',
  frequent_actions TEXT NOT NULL DEFAULT '[]',
  dismissed_patterns TEXT NOT NULL DEFAULT '[]',
  last_updated INTEGER NOT NULL
);

-- RAG documents
CREATE TABLE rag_docs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
```

## Design Decisions

1. **Bun-Only SQLite**: Uses `bun:sqlite` for native SQLite integration (no external dependencies).
2. **Pluggable Vectors**: Three engine options from in-process (zvec) to external (chroma).
3. **Session Isolation**: SessionStore provides automatic scoping without manual filtering.
4. **TTL Support**: Automatic expiration for temporary data.
5. **RAG Integration**: Dedicated document table with automatic chunk creation.
6. **Profile Per Workspace**: User preferences scoped to workspace context.

## Dependencies

- `@enhancement/types`: Core types (ContextChunk, MemoryFilter, ScanResult, UserProfile)
- `@enhancement/config`: Configuration
- `ulidx`: ULID generation
- `zod`: Validation

## Package Structure

```text
packages/store/
├── src/
│   ├── index.ts              # Public exports
│   ├── store.ts              # EnhancementStore and SessionStoreImpl
│   ├── engine.ts             # Engine factory and info
│   ├── schema.ts             # TypeScript types and interfaces
│   └── adapters/
│       ├── zvec.ts           # In-process vector engine
│       ├── sqlite-vec.ts     # SQLite extension adapter
│       └── chroma.ts         # Chroma client adapter
└── test/
    └── conformance.test.ts
```
