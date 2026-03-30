# Enhancement Monorepo — AGENTS Index

## Single Source of Truth for AI Agents

This document is the **central index** for all package specifications. Each package has its own `AGENTS.md` file that serves as the authoritative specification for that package.

---

## Quick Navigation

### Foundation Packages (Phase 1)

| Package | Status | AGENTS.md |
| :------------------------- | :----- | :---------------------------------------------------------------- |
| `@enhancement/types` | Built | [packages/types/AGENTS.md](./packages/types/AGENTS.md) |
| `@enhancement/bus` | Built | [packages/bus/AGENTS.md](./packages/bus/AGENTS.md) |
| `@enhancement/test-harness` | Built | [packages/test-harness/AGENTS.md](./packages/test-harness/AGENTS.md) |

### Infrastructure Packages (Phase 2)

| Package | Status | AGENTS.md |
| :--------------------------- | :----- | :---------------------------------------------------------------- |
| `@enhancement/join-synchronizer` | Built | [packages/join-synchronizer/AGENTS.md](./packages/join-synchronizer/AGENTS.md) |
| `@enhancement/deferred-queue` | Built | [packages/deferred-queue/AGENTS.md](./packages/deferred-queue/AGENTS.md) |
| `@enhancement/config` | Built | [packages/config/AGENTS.md](./packages/config/AGENTS.md) |

### Core Services (Phase 3)

| Package | Status | AGENTS.md |
| :-------------------------- | :----- | :---------------------------------------------------------------- |
| `@enhancement/credentials` | Built | [packages/credentials/AGENTS.md](./packages/credentials/AGENTS.md) |
| `@enhancement/plugins` | Built | [packages/plugins/AGENTS.md](./packages/plugins/AGENTS.md) |

### Data & AI Packages (Unplanned but Built)

| Package | Status | AGENTS.md |
| :------------------------- | :----- | :---------------------------------------------------------------- |
| `@enhancement/store` | Built | [packages/store/AGENTS.md](./packages/store/AGENTS.md) |
| `@enhancement/screenpipe` | Built | [packages/screenpipe/AGENTS.md](./packages/screenpipe/AGENTS.md) |
| `@enhancement/ai-providers` | Built | [packages/ai-providers/AGENTS.md](./packages/ai-providers/AGENTS.md) |
| `@enhancement/discovery` | Built | [packages/discovery/AGENTS.md](./packages/discovery/AGENTS.md) |
| `@enhancement/cron` | Built | [packages/cron/AGENTS.md](./packages/cron/AGENTS.md) |
| `@enhancement/channel` | Built | [packages/channel/AGENTS.md](./packages/channel/AGENTS.md) |
| `@enhancement/fabric` | Built | [packages/fabric/AGENTS.md](./packages/fabric/AGENTS.md) |

### Orchestration & Execution (Phase 4-5)

| Package | Status | AGENTS.md | Spec Only |
| :-------------------- | :------- | :---------------------------------------------------------------- | :---------------------------------------- |
| `@enhancement/engine` | **TODO** | [packages/engine/AGENTS.md](./packages/engine/AGENTS.md) | [AGENTS-ENGINE.md](./AGENTS-ENGINE.md) |
| `@enhancement/graph` | **MERGED** | [packages/graph/AGENTS.md](./packages/graph/AGENTS.md) | [AGENTS-GRAPH.md](./AGENTS-GRAPH.md) |
| `@enhancement/recipe` | Built | [packages/recipe/AGENTS.md](./packages/recipe/AGENTS.md) | [AGENTS-RECIPES.md](./AGENTS-RECIPES.md) |
| `@enhancement/cli` | **TODO** | [packages/cli/AGENTS.md](./packages/cli/AGENTS.md) | [AGENTS-CLI.md](./AGENTS-CLI.md) |
| `@enhancement/server` | **TODO** | [packages/server/AGENTS.md](./packages/server/AGENTS.md) | [AGENTS-SERVER.md](./AGENTS-SERVER.md) |

---

## Architecture Overview

```text
~/Apps/Monorepo/loom/
├── AGENTS-ROOT.md          # This index file
├── AGENTS-*.md             # Full specs for TODO packages
├── packages/
│   ├── types/              # Core type system
│   │   └── AGENTS.md       # Package spec (always read this first)
│   ├── bus/                # Event bus
│   │   └── AGENTS.md
│   ├── join-synchronizer/  # Parallel coordination
│   │   └── AGENTS.md
│   ├── deferred-queue/     # Time-based deferral
│   │   └── AGENTS.md
│   ├── config/             # Configuration management
│   │   └── AGENTS.md
│   ├── credentials/        # Encrypted credential storage
│   │   └── AGENTS.md
│   ├── plugins/            # Plugin lifecycle
│   │   └── AGENTS.md
│   ├── store/              # Persistent storage + vectors
│   │   └── AGENTS.md
│   ├── screenpipe/         # Screen/audio capture
│   │   └── AGENTS.md
│   ├── ai-providers/       # LLM provider registry
│   │   └── AGENTS.md
│   ├── discovery/          # Service auto-detection
│   │   └── AGENTS.md
│   ├── recipe/             # Recipe execution (includes graph)
│   │   └── AGENTS.md
│   ├── cron/               # Scheduled execution
│   │   └── AGENTS.md
│   ├── channel/            # Output surfaces
│   │   └── AGENTS.md
│   ├── fabric/             # Pattern transformation
│   │   └── AGENTS.md
│   ├── test-harness/       # Test utilities
│   │   └── AGENTS.md
│   ├── engine/             # Core orchestration (TODO)
│   │   └── AGENTS.md       # Points to AGENTS-ENGINE.md
│   ├── graph/              # Merged into recipe
│   │   └── AGENTS.md       # Points to recipe AGENTS.md
│   ├── cli/                # Command-line interface (TODO)
│   │   └── AGENTS.md       # Points to AGENTS-CLI.md
│   └── server/             # HTTP/WebSocket API (TODO)
│       └── AGENTS.md       # Points to AGENTS-SERVER.md
```

---

## Agent Instructions

1. **ALWAYS READ THE PACKAGE'S AGENTS.md FIRST** before any work in that package
2. **For built packages**: Read `packages/<name>/AGENTS.md` for the full spec
3. **For TODO packages**: Read both the stub `packages/<name>/AGENTS.md` AND the full spec `AGENTS-<name>.md` in root
4. **For the merged graph package**: See `packages/recipe/AGENTS.md` instead

---

## Canonical Wiring Pattern

The Enhancement system implements this data flow:

```text
Realtime Screenshot + Static Documents
         ↓
    Screenpipe
         ↓
       Bus
         ↓
      Store
         ↓
    (Vector search)
         ↓
   Recipe Executor
         ↓
  Contextual Suggestions
         ↓
    Output Channel
```

For implementation examples, see the `simulations/` directory.

---

## Dependency Rules

1. NEVER add circular dependencies
2. Lower-level packages must not depend on higher-level ones
3. Dependencies must be declared in `package.json` with exact versions
4. Internal dependencies use `workspace:*` protocol (currently using `file:../` - needs migration)

---

## Versioning

- All packages start at version `0.1.0`
- Use `workspace:*` for internal dependencies during development

---

Document Version: 2.0.0
Last Updated: 2026-03-29
