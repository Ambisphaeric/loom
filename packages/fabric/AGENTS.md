# @enhancement/fabric

Integration with the [Fabric CLI](https://github.com/danielmiessler/fabric) by Daniel Miessler.

## Purpose

Provides a **direct pattern runner** that works with any OpenAI-compatible API (LM Studio, Ollama, etc.) without requiring the Fabric CLI binary or interactive setup.

Also includes a legacy **installer and wrapper** for the external Fabric CLI tool (if you need all 255+ patterns or specific CLI features).

### Respecting Existing Setups

This package **never interferes** with existing Fabric installations:

**Binary Detection (in order):**

1. `which fabric` - finds in PATH (homebrew, custom installs)
2. `/opt/homebrew/bin/fabric` - Homebrew ARM
3. `/usr/local/bin/fabric` - Homebrew Intel
4. `~/.local/bin/fabric` - User local
5. `~/go/bin/fabric` - Go install
6. `~/.enhancement/bin/fabric` - Our managed location (only installs here if not found)

**Pattern Detection:**

- Uses existing `~/.config/fabric/patterns` if present
- Uses existing `~/.fabric/patterns` if present
- Only downloads patterns if none exist (or if `force` is explicitly set)

**Configuration:**

- Reads from existing `~/.config/fabric/.env`
- Only adds/modifies specific keys, preserves all other settings
- Never overwrites user's existing API keys or config

## What is Fabric?

Fabric is an open-source CLI tool that provides AI-powered text transformations through a library of community-contributed patterns. See the [official repository](https://github.com/danielmiessler/fabric) for details.

## Key Domain Concepts

- **Fabric CLI**: The external Go binary (`fabric`) that can optionally be used
- **Direct Runner** (RECOMMENDED): Runs patterns directly via HTTP calls to LM Studio - no binary needed
- **Patterns**: Markdown templates extracted from the Fabric repository
- **Pattern Directory**: 76 curated patterns with `system.md` content embedded in JSON

## Usage Modes

### Mode 1: Direct Runner (Recommended)

**No setup required!** Works immediately with LM Studio or any OpenAI-compatible API.

```typescript
import { runPattern, listPatterns } from "@enhancement/fabric/direct";

// Run a pattern directly
const result = await runPattern("summarize", "Your text to summarize");
console.log(result);

// See all 76 available patterns
console.log(listPatterns());

// Stream results
await runPatternStreaming("extract_wisdom", longArticle, (chunk) => {
  process.stdout.write(chunk);
});
```

### Mode 2: CLI Wrapper (Legacy)

Requires the Fabric CLI binary and interactive setup (`fabric --setup`).

```typescript
import { createFabricIntegration } from "@enhancement/fabric";

const fabric = createFabricIntegration({ autoInstall: true });
await fabric.initialize();

const result = await fabric.transformChunk(chunk, "summarize");
```

## Public API

### Direct Runner (Recommended)

```typescript
import { 
  runPattern, 
  runPatternStreaming,
  listPatterns, 
  getPattern,
  getPatternsByCategory,
  getAllCategories 
} from "@enhancement/fabric/direct";

// Basic usage with defaults (LM Studio at localhost:1234)
const result = await runPattern("extract_wisdom", longArticleContent);

// With custom options
const result = await runPattern("analyze_claims", politicalSpeech, {
  model: "qwen3.5-0.8b-optiq",
  baseUrl: "http://localhost:1234/v1",
  temperature: 0.3,
  maxTokens: 4000
});

// Streaming
await runPatternStreaming("summarize", longText, (chunk) => {
  process.stdout.write(chunk);
});

// Explore patterns
const all = listPatterns(); // 76 patterns
const security = getPatternsByCategory("Security / Cyber / Risk");
const pattern = getPattern("create_prd");
console.log(pattern.identity);
```

### CLI Integration (Legacy)

```typescript
import { createFabricIntegration } from "@enhancement/fabric";

// Create integration (auto-installs if needed)
const fabric = createFabricIntegration({ autoInstall: true });

// Initialize (downloads binary and patterns)
const init = await fabric.initialize();

if (!init.success) {
  console.error("Failed to initialize Fabric:", init.error);
  process.exit(1);
}

// Transform content using any Fabric pattern
const result = await fabric.transformChunk(chunk, "summarize");

if (result.success) {
  console.log(result.chunk.content); // Summarized output
}
```

### Manual Installation (Legacy)

```typescript
import { createFabricInstaller, createFabricCLI } from "@enhancement/fabric";

// Install the binary
const installer = createFabricInstaller();
const installResult = await installer.install();

if (installResult.success) {
  console.log(`Fabric installed at: ${installResult.binaryPath}`);
  console.log(`Version: ${installResult.version}`);
}
```

### Setup and Configuration (Legacy Only)

**IMPORTANT**: The CLI Wrapper requires interactive setup (`fabric --setup`) to configure AI vendors before first use. The direct runner does NOT require this.

```typescript
// Only needed for CLI wrapper mode
await fabric.setup();
```

### Integration with Enhancement

```typescript
import { runPattern } from "@enhancement/fabric/direct";
import type { ContextChunk } from "@enhancement/types";

// Transform chunks in recipes
async function extractStep(chunk: ContextChunk): Promise<ContextChunk> {
  const output = await runPattern("extract_wisdom", chunk.content);
  return {
    ...chunk,
    content: output,
    metadata: { ...chunk.metadata, transformed: true }
  };
}

// Batch processing
async function summarizeBatch(chunks: ContextChunk[]) {
  const results = await Promise.all(
    chunks.map(c => runPattern("summarize", c.content))
  );
  return results;
}
```

## Architecture

### Direct Runner Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                   Your Application                            │
│                                                               │
│  import { runPattern } from "@enhancement/fabric/direct"     │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Direct Runner (HTTP API)                         │
│                                                               │
│  • Loads patterns from JSON                                   │
│  • Builds system prompt from pattern definition               │
│  • Sends POST to /v1/chat/completions                         │
│  • Returns LLM response                                       │
└────────────────────┬──────────────────────────────────────────┘
                     │ HTTP POST
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              LM Studio / OpenAI-Compatible API               │
│                                                               │
│  • Any model (qwen, llama, etc.)                             │
│  • Local or remote                                           │
│  • No API keys needed for local                               │
└─────────────────────────────────────────────────────────────┘
```

### CLI Wrapper Architecture (Legacy)

```text
┌─────────────────────────────────────────────────────────────┐
│                    FabricIntegration                          │
│  Combines installer + CLI + pattern sync                      │
└────────────────────┬────────────────────────────────────────┘
                     │
       ┌─────────────┼─────────────┐
       │             │             │
       ▼             ▼             ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│ Installer  │ │ CLI Wrapper│ │ PatternSync│
│            │ │            │ │            │
│ Downloads  │ │ Spawns     │ │ Downloads  │
│ fabric     │ │ fabric     │ │ patterns   │
│ binary     │ │ process    │ │ from GH    │
└────────────┘ └─────┬──────┘ └────────────┘
                     │
                     ▼
              ┌────────────┐
              │ Fabric CLI │
              │ (external) │
              │            │
              │ Go binary  │
              │ from GH    │
              └────────────┘
```

## File Structure

### Direct Runner

```text
packages/fabric/
├── src/
│   ├── direct.ts              # Direct runner exports
│   ├── direct-runner.ts       # Implementation
│   └── fabric-patterns-extracted.json  # 76 patterns
└── dist/
    ├── direct.d.ts
    └── direct.js
```

### External Files (if using CLI wrapper)

```text
~/.enhancement/
└── bin/
    └── fabric              # Downloaded binary

~/.config/fabric/
├── .env                    # API keys
└── patterns/               # Synced patterns
    ├── summarize/
    │   ├── system.md       # System prompt
    │   └── user.md         # User prompt (optional)
    ├── extract_wisdom/
    │   └── system.md
    └── ...
```

## Design Decisions

1. **Dual Mode**: Direct runner for immediate use, CLI wrapper for full Fabric compatibility.

2. **Extracted Patterns**: 76 most useful patterns extracted from Fabric's 255+ library. Curated by the user for common tasks.

3. **OpenAI-Compatible**: Direct runner works with any API following OpenAI's chat completions format.

4. **Chunk Bridge**: Both modes convert output to Enhancement ContextChunks for seamless integration.

5. **No Setup Required**: Direct runner eliminates the biggest friction point (interactive `fabric --setup`).

## Dependencies

- `@enhancement/types`: ContextChunk, chunk types
- `child_process`: For direct runner HTTP calls via curl
- `ulidx`: ID generation for transformed chunks

## Testing

Since the direct runner uses HTTP calls:

- Requires LM Studio or compatible API running
- Uses `curl` for HTTP requests
- Mock the `execSync`/`spawn` calls for unit testing

## External Resources

- **Official Fabric**: <https://github.com/danielmiessler/fabric>
- **Pattern Library**: <https://github.com/danielmiessler/fabric/tree/main/patterns>
- **CLI Documentation**: Run `fabric --help` after installation

## Package Structure

```text
packages/fabric/
├── src/
│   ├── index.ts              # CLI wrapper exports (legacy)
│   ├── direct.ts             # Direct runner exports (recommended)
│   ├── direct-runner.ts      # Direct runner implementation
│   ├── integration.ts        # FabricIntegration (legacy)
│   ├── cli.ts                # FabricCLI (legacy)
│   ├── installer.ts          # FabricInstaller (legacy)
│   └── patterns.ts           # PatternSync (legacy)
├── test/
│   └── conformance.test.ts
├── README.md
└── AGENTS.md
```

## Environment Variables (Legacy CLI Only)

Fabric CLI reads from `~/.config/fabric/.env`:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
```

Or set in environment:

```bash
export OPENAI_API_KEY=sk-...
```

The direct runner accepts configuration via function parameters instead.
