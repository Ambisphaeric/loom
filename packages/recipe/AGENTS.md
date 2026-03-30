# @enhancement/recipe

Recipe execution engine with GOETEA-C step system and merged computation graph functionality.

## Purpose

Executes declarative recipes — sequences of typed steps that transform data through a workflow. Provides observable, retryable, auditable execution with progress callbacks for UI feedback. The computation graph (merged from the graph package) enables complex branching and merging operations.

## Key Domain Concepts

- **Recipe**: A named, versioned workflow containing ordered steps with dependencies.
- **RecipeStep**: A single unit of work with a `kind` (GOETEA-C type), configuration, and optional dependencies.
- **RecipeRun**: A single execution instance tracking status, step outputs, timing, and errors.
- **StepRun**: Status and output for an individual step within a recipe run.
- **StepKind**: The 13 GOETEA-C step types (see below).
- **StepExecutionContext**: Runtime context passed to each step handler — includes run ID, session ID, workspace, and variables.
- **ComputationGraph**: Directed graph of nodes (merge, split, conditional) for complex data flow.
- **MergeStrategy**: How multiple inputs combine — `zip`, `concat`, `interleave`, `latest`, `wait-all`.

## GOETEA-C Step Kinds

The GOETEA-C mnemonic represents memorable workflow phases:

| Step | Purpose | Common Config |
| ------ | --------- | --------------- |
| **gather** | Collect data from sources | `query`, `limit` |
| **capture** | Screen/audio capture | `captureType`, `duration` |
| **transcribe** | Speech to text conversion | — |
| **extract** | Extract entities/patterns | `pattern` |
| **orient** | Understand and organize context | `orientation` (chronological, reverse) |
| **synthesize** | Combine information | `prompt` |
| **create** | Generate output artifact | `outputType` |
| **detect** | Pattern/entity detection | `detectType` |
| **act** | Execute side effect | `action` (log, store) |
| **merge** | Combine parallel branches | `strategy` (concat, interleave) |
| **split** | Fork into parallel branches | `splitBy` (line, word) |
| **conditional** | If/then logic | `condition`, `trueSteps`, `falseSteps` |
| **subrecipe** | Nested recipe execution | `recipeId` |

## Public API

### RecipeExecutor

```typescript
import { RecipeExecutor, createRecipeExecutor } from '@enhancement/recipe';
import type { Recipe, RecipeStep, RecipeRun } from '@enhancement/recipe';
import type { ContextChunk } from '@enhancement/types';

// Create executor with options
const executor = createRecipeExecutor({
  sessionId: 'my-session',  // Optional fixed session
  verbose: true,             // Log step execution
  maxConcurrency: 4,         // Parallel step limit
  timeout: 30000,          // Global timeout ms
});

// Define a recipe
const recipe: Recipe = {
  id: 'analyze-document',
  workspace: 'my-workspace',
  name: 'Document Analysis',
  mode: 'batch',
  schemaVersion: 1,
  audiences: [],
  steps: [
    { id: 'gather', kind: 'gather', name: 'Gather Data', config: { limit: 10 } },
    { id: 'extract', kind: 'extract', name: 'Extract Key Info', config: { pattern: 'important' } },
    { id: 'synthesize', kind: 'synthesize', name: 'Summarize', config: { prompt: 'Summarize:' } },
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// Run with progress tracking
const run: RecipeRun = await executor.runRecipe(
  recipe,
  initialChunks,
  (event) => {
    switch (event.type) {
      case 'step_started':
        console.log(`Starting ${event.stepId}`);
        break;
      case 'step_progress':
        console.log(`Progress: ${event.preview}`);
        break;
      case 'step_completed':
        console.log(`${event.stepId} done, output: ${event.outputLength}`);
        break;
      case 'step_failed':
        console.error(`${event.stepId} failed: ${event.error}`);
        break;
      case 'run_completed':
        console.log(`Run ${event.status} in ${event.durationMs}ms`);
        break;
    }
  }
);
```

### Step Dependencies

```typescript
const recipe: Recipe = {
  // ... other fields
  steps: [
    { id: 'fetch', kind: 'gather', name: 'Fetch Data', config: {} },
    { id: 'process', kind: 'extract', name: 'Process', config: {}, dependsOn: ['fetch'] },
    { id: 'analyze', kind: 'detect', name: 'Analyze', config: {}, dependsOn: ['process'] },
  ],
};

// Steps with dependencies are skipped if dependency fails
```

### Custom Step Handlers

```typescript
// Register custom handler for domain-specific logic
executor.registerHandler('detect', async (step, input, context, onProgress) => {
  onProgress?.('Scanning for entities...');

  // Custom detection logic
  const detected = await myDetector(input);

  return detected.map(chunk => ({
    ...chunk,
    id: `detected-${chunk.id}`,
    source: 'custom-detector',
  }));
});
```

### Graph Nodes (Factory Functions)

```typescript
import {
  createMergeNode,
  createSplitNode,
  createConditionalNode,
  createComputationGraph,
  MergeNodeImpl,
  SplitNodeImpl,
  ConditionalNodeImpl,
} from '@enhancement/recipe';

// Merge node — combine multiple inputs
const mergeNode = createMergeNode('m1', 'concat', ['in1', 'in2'], 'out');
const merged = await mergeNode.merge([chunksA, chunksB]);

// Split node — fork to multiple branches
const splitNode = createSplitNode('s1', ['branchA', 'branchB']);
const branches = splitNode.split(inputChunks); // Map<string, ContextChunk[]>

// Conditional node — branch based on context
const condNode = createConditionalNode('c1', 'hasData', (ctx) => {
  return ctx.get('dataAvailable') === true;
});
const shouldProceed = condNode.evaluate(context);

// Computation graph — build and validate
const graph = createComputationGraph();
graph.addNode({ id: 'n1', type: 'input', inputs: [], outputs: ['n2'] });
graph.addNode({ id: 'n2', type: 'process', inputs: ['n1'], outputs: [] });
graph.addEdge('n1', 'n2');

const order = graph.topologicalSort(); // ['n2', 'n1']
const hasCycle = graph.hasCycle();     // false
```

### Merge Strategies

```typescript
import type { MergeStrategy } from '@enhancement/recipe';

const strategies: MergeStrategy[] = [
  'zip',        // a1,b1,a2,b2 (pairwise, min length)
  'concat',     // a1,a2,b1,b2 (append all)
  'interleave', // a1,b1,a2,b2 (round-robin, max length)
  'latest',     // most recent by timestamp
  'wait-all',   // all inputs required or empty
];
```

## Design Decisions

1. **GOETEA-C Naming**: The mnemonic provides memorable workflow phases that map to real-world data processing stages — from gathering raw inputs through creating final outputs.

2. **Step-Based (Not Free-Form)**: Fixed step kinds enable:
   - **Observability**: Each step has predictable inputs/outputs
   - **Retry**: Failed steps can be retried individually
   - **Audit**: Complete trace of what happened when
   - **UI Rendering**: Progress bars know step boundaries

3. **Progress Callbacks**: Real-time feedback for UI components without polling. Events carry enough context for rich progress displays.

4. **Graph Merged into Recipe**: The computation graph (merge/split/conditional nodes) lives in the recipe package because:
   - Recipes represent cohesive units of work
   - Graph operations are primarily used within recipe execution
   - Single dependency instead of graph + recipe separately
   - Avoids circular dependency risks between graph and join-synchronizer

5. **Dependency-Driven Execution**: Steps declare `dependsOn` rather than using explicit graph edges for simple cases. The executor topologically sorts implicitly.

6. **Context Variables**: The `StepExecutionContext.variables` Map allows steps to share state without polluting the chunk stream.

## Dependencies

- `@enhancement/types`: Core type system (ContextChunk)
- `@enhancement/bus`: Event communication (optional, for step events)
- `@enhancement/join-synchronizer`: Parallel branch coordination

## Package Structure

```text
packages/recipe/
├── src/
│   ├── index.ts      # Public exports (RecipeExecutor, graph nodes)
│   ├── executor.ts   # RecipeExecutor implementation
│   ├── types.ts      # Recipe, RecipeStep, RecipeRun types
│   └── graph.ts      # Computation graph nodes (merged from graph package)
└── test/
    ├── conformance.test.ts  # AGENTS spec conformance
    └── executor.test.ts     # Recipe execution tests
```

## Recipe Execution Flow

```text
1. Executor receives Recipe + input chunks
2. Creates RecipeRun with pending status for all steps
3. For each step in order:
   a. Emit step_started event
   b. Check dependencies (skip if not met)
   c. Execute handler with context
   d. Store output for downstream steps
   e. Emit step_completed or step_failed
4. Set final run status (completed/failed)
5. Emit run_completed with duration
```

## Status Values

**RecipeRun.status**: `pending` | `running` | `completed` | `failed` | `paused`

**StepRun.status**: `pending` | `running` | `completed` | `failed` | `skipped`
