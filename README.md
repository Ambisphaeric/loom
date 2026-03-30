# Loom

**Foundational primitives for AI systems.**

Loom provides the building blocks for weaving together AI workflows—from fabric patterns for text transformation to event buses, storage, and type systems.

## Philosophy

Like a loom weaves threads into fabric, this toolkit weaves AI capabilities into applications:

- **Fabric patterns** → AI-powered text transformations (76 curated patterns from the Fabric project)
- **Event bus** → Message routing and coordination
- **Storage** → Persistent storage with vector search
- **Types** → Shared type system across the platform

## Quick Start

### Using Fabric Patterns (No setup required!)

```typescript
import { runPattern } from "@enhancement/fabric/direct";

// Works immediately with LM Studio or any OpenAI-compatible API
const result = await runPattern("summarize", longArticle);
console.log(result);
```

### Event Bus

```typescript
import { EnhancementBus } from "@enhancement/bus";

const bus = new EnhancementBus({ id: "my-app" });

bus.subscribe("document.ready", async (chunk) => {
  const summary = await runPattern("summarize", chunk.content);
  return { ...chunk, content: summary };
});
```

## Packages

| Package | Purpose |
|--------|---------|
| `@enhancement/fabric` | Fabric patterns for AI text transformations |
| `@enhancement/bus` | Event bus with bounded queues |
| `@enhancement/store` | Persistent storage with vector search |
| `@enhancement/types` | Core type system |
| `@enhancement/credentials` | Encrypted credential management |
| `@enhancement/recipe` | Recipe engine for workflows |
| `@enhancement/deferred-queue` | Scheduled future actions |

## Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/loom.git
cd loom

# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun test
```

## Development

This is a Bun monorepo using:
- **Bun** as the runtime and package manager
- **Turborepo** for task orchestration
- **TypeScript** throughout
- **Zod** for runtime type validation

### Running Tests

```bash
# All tests
bun test

# Single package
bun test packages/bus/test/

# E2E experiments
bun run e2e
```

## The Name

**Loom** (noun): A machine for weaving yarn into fabric.

This repo takes threads—AI models, data streams, events—and weaves them into coherent applications. The fabric patterns integration makes the name especially fitting.

## License

MIT
