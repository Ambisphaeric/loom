# @enhancement/types

Core type system for the Enhancement platform. Defines the vocabulary for the entire system.

## Purpose

All other packages build upon these types. They describe the shape of data that flows through Enhancement pipelines: chunks of content, execution sessions, credentials, plugin configurations, and pipeline graphs.

## Key Domain Concepts

- **Chunk**: The fundamental unit of data. A structured payload with content, metadata, and optional embeddings.
- **ExecutionContext**: Runtime environment for a pipeline execution — includes session ID, timestamp, and execution graph.
- **Credentials**: Type-safe API keys, tokens, and connection secrets with validation.
- **PipelineGraph**: Directed graph of connected nodes that process data.
- **Plugin**: Self-contained processing unit with typed inputs/outputs.

## Public API

### Core Types

```typescript
import { 
  Chunk, ExecutionContext, PipelineGraph, 
  Plugin, CredentialProvider, CredentialType 
} from '@enhancement/types';

// Define a chunk
const chunk: Chunk<string> = {
  id: generateId(),
  content: "Hello world",
  metadata: { source: "api" }
};

// Access execution context
function process(ctx: ExecutionContext, input: Chunk) {
  console.log(ctx.sessionId);  // Unique execution identifier
  console.log(ctx.timestamp); // When execution started
}
```

### Validation with Zod

```typescript
import { ChunkSchema, PluginConfigSchema } from '@enhancement/types';

// Runtime validation
const result = ChunkSchema.safeParse(unknownData);
if (result.success) {
  // TypeScript now knows the shape
  const chunk = result.data;
}
```

### ID Generation

```typescript
import { generateId } from '@enhancement/types';

const id = generateId(); // ULID format: lexicographically sortable
```

## Design Decisions

1. **Generic Chunks**: `Chunk<T>` lets the type system track content types through pipelines.
2. **Schema-First**: Every type has a Zod schema for runtime validation.
3. **Immutable IDs**: ULID provides sortable, unique identifiers without central coordination.
4. **Plugin Contract**: Plugins declare input/output types, enabling compile-time graph validation.

## Dependencies

- `zod`: Runtime schema validation
- `ulidx`: ULID generation

## Package Structure

```text
packages/types/
├── src/
│   ├── index.ts      # Public exports
│   ├── core.ts       # Chunk, ExecutionContext, Plugin
│   ├── credentials.ts # Credential types
│   ├── pipeline.ts   # Graph types
│   └── recipes.ts    # Recipe execution types
└── test/
    └── conformance.test.ts
```
