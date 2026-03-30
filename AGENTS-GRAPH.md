# @enhancement/graph

> **⚠️ MERGED NOTICE**: This package has been merged into `@enhancement/recipe`.
>
> The graph functionality (`ComputationGraph`, `MergeNode`, `SplitNode`, `ConditionalNode`) now lives in the recipe package because graphs are primarily used for recipe execution. The tight coupling between graph structure and recipe orchestration made separate maintenance unnecessary.
>
> **Migration**: Import graph utilities from `@enhancement/recipe` instead.

---

Directed Acyclic Graph (DAG) system for computation pipelines with merge, split, and conditional nodes.

## Purpose

Provides a graph-based execution model where data flows through nodes in topological order. Supports branching (split), combining (merge), and conditional routing. Used by the recipe executor to orchestrate multi-step workflows with complex dependencies.

## Key Domain Concepts

- **ComputationGraph**: A Directed Acyclic Graph (DAG) of processing nodes. Edges represent data flow; cycles are prohibited.
- **GraphNode**: Base interface for all node types — has `id`, `type`, `inputs`, and `outputs`.
- **MergeNode**: Combines multiple input streams into a single output:
  - `zip`: Interleave chunks from all sources (round-robin by position)
  - `concat`: Flatten all inputs sequentially
  - `interleave`: Alternate between sources until all exhausted
  - `latest`: Take the most recent chunk from each source (by timestamp/generation)
  - `wait-all`: Only output when all sources have data
- **SplitNode**: Distributes a single input to multiple output branches (each branch receives full input).
- **ConditionalNode**: Routes data based on a predicate — outputs are `["true", "false"]`.
- **TopologicalSort**: Determines execution order respecting dependencies (DFS-based).
- **CycleDetection**: Prevents infinite loops by rejecting graphs with cycles.
- **LazyEvaluation**: Nodes only compute when their outputs are needed.

## Public API

### Graph Construction

```typescript
import {
  ComputationGraphImpl,
  MergeNodeImpl,
  SplitNodeImpl,
  ConditionalNodeImpl,
  createComputationGraph,
  createMergeNode,
  createSplitNode,
  createConditionalNode,
  type MergeStrategy,
} from '@enhancement/recipe';

// Create a graph
const graph = createComputationGraph();

// Add a merge node (combines multiple inputs)
const merge = createMergeNode(
  'merge-1',
  'zip',  // MergeStrategy
  ['source-a', 'source-b'],  // input node IDs
  'merged-output'  // output node ID
);
graph.addNode(merge);

// Add a split node (distributes to multiple outputs)
const split = createSplitNode('split-1', ['branch-a', 'branch-b', 'branch-c']);
graph.addNode(split);

// Add a conditional node (branching logic)
const conditional = createConditionalNode(
  'if-1',
  'shouldProcess',  // context key to evaluate
  (context) => context.get('shouldProcess') === true  // optional custom predicate
);
graph.addNode(conditional);

// Connect nodes
graph.addEdge('split-1', 'merge-1');
graph.addEdge('merge-1', 'if-1');
```

### Node Types Reference

```typescript
// MergeNode — combines multiple inputs
interface MergeNode {
  id: string;
  type: "merge";
  strategy: MergeStrategy;  // "zip" | "concat" | "interleave" | "latest" | "wait-all"
  sources: string[];        // input node IDs
  outputs: string[];        // output node IDs (typically one)
}

// SplitNode — distributes to multiple outputs
interface SplitNode {
  id: string;
  type: "split";
  branches: string[];       // output branch names
  outputs: string[];
}

// ConditionalNode — predicate-based routing
interface ConditionalNode {
  id: string;
  type: "conditional";
  condition: string;        // context key or expression
  outputs: ["true", "false"];
}
```

### Graph Operations

```typescript
// Get execution order (respects dependencies)
const executionOrder = graph.topologicalSort();
// Returns: string[] — node IDs in dependency order

// Check for cycles (should be done before execution)
const hasCycle = graph.hasCycle();
if (hasCycle) {
  throw new Error("Graph contains a cycle — execution would loop infinitely");
}

// Access nodes and edges
const node = graph.getNode('merge-1');
const outgoing = graph.getOutgoingEdges('split-1');
```

### Merge Strategies Explained

```typescript
// zip: Interleave by position — [A1, B1, A2, B2, ...]
const zipMerge = createMergeNode('zip', 'zip', ['a', 'b'], 'out');
// Input:  [[A1, A2], [B1, B2, B3]]
// Output: [A1, B1, A2, B2]  // stops at shortest input

// concat: Flatten sequentially
const concatMerge = createMergeNode('concat', 'concat', ['a', 'b'], 'out');
// Input:  [[A1, A2], [B1, B2]]
// Output: [A1, A2, B1, B2]

// interleave: Round-robin until all exhausted
const interleaveMerge = createMergeNode('interleave', 'interleave', ['a', 'b'], 'out');
// Input:  [[A1, A2], [B1, B2, B3]]
// Output: [A1, B1, A2, B2, B3]

// latest: Most recent chunk from each source
const latestMerge = createMergeNode('latest', 'latest', ['a', 'b'], 'out');
// Picks chunk with highest timestamp/generation from each input

// wait-all: Only output when all sources have data
const waitAllMerge = createMergeNode('wait-all', 'wait-all', ['a', 'b'], 'out');
// Input:  [[A1, A2], []]
// Output: []  // waits for both to have data
```

### Working with Node Implementations

```typescript
// Direct instantiation (for advanced use)
const mergeNode = new MergeNodeImpl(
  'my-merge',
  'concat',
  ['input-1', 'input-2'],
  'output-1',
  { maxBufferSize: 100 }  // optional config
);

// Execute merge manually
const inputs: RawChunk[][] = [
  [{ kind: 'raw', source: 'a', data: 'chunk1', timestamp: 1000, generation: 0, workspace: 'ws', sessionId: 's1', contentType: 'text/plain' }],
  [{ kind: 'raw', source: 'b', data: 'chunk2', timestamp: 1001, generation: 0, workspace: 'ws', sessionId: 's1', contentType: 'text/plain' }],
];
const merged = await mergeNode.merge(inputs);

// Execute split manually
const splitNode = new SplitNodeImpl('my-split', ['branch-a', 'branch-b']);
const input: RawChunk[] = [...];
const distributed = splitNode.split(input);
// Returns: Map<string, RawChunk[]> with keys 'branch-a', 'branch-b'

// Execute conditional manually
const conditionalNode = new ConditionalNodeImpl('my-if', 'flag');
const context = new Map<string, unknown>([['flag', true]]);
const shouldTakeTrueBranch = conditionalNode.evaluate(context);
```

## Design Decisions

1. **Merged into @enhancement/recipe**: Graph functionality was merged because:
   - Tight coupling: Graphs are primarily used for recipe execution
   - No independent consumers: No other package used graph without recipes
   - Simpler maintenance: Single package for execution concerns
   - Reduced API surface: One import for recipe + graph needs

2. **DAG (not general graph)**: Enforced Directed Acyclic Graph structure because:
   - Prevents infinite loops during execution
   - Guarantees termination
   - Enables deterministic execution order via topological sort
   - Cycles would require reactive/streaming semantics (out of scope)

3. **Topological Sort for Execution**: Nodes execute in topological order because:
   - Dependencies are always satisfied before a node runs
   - Deterministic: same graph = same execution order
   - Enables parallel execution of independent branches
   - Makes debugging predictable

4. **Lazy Evaluation**: Nodes compute only when outputs are needed because:
   - Efficiency: unused branches don't execute
   - Supports conditional routing without wasted work
   - Memory efficiency: intermediate results can be garbage collected
   - Enables streaming: partial results flow through as ready

5. **Merge Strategies as First-Class**: Multiple merge strategies because:
   - Different use cases need different combining semantics
   - Zip for aligned data (timestamps, frames)
   - Concat for sequential processing
   - Latest for reactive/stateful updates
   - Wait-all for barrier synchronization

6. **Explicit Node Wiring**: Nodes declare inputs/outputs explicitly because:
   - Static analysis: graph structure is inspectable
   - Type safety: can validate connections at build time
   - Debugging: clear data flow visualization
   - Enables cycle detection before execution

## Dependencies

Now part of `@enhancement/recipe`:

- `@enhancement/types`: Core type system (RawChunk, ContextChunk)
- `@enhancement/bus`: Event propagation (optional, for reactive graphs)
- `@enhancement/join-synchronizer`: Barrier synchronization patterns

## Package Structure

Graph functionality is now in the recipe package:

```text
packages/recipe/
├── src/
│   ├── index.ts          # Public exports (includes graph utilities)
│   ├── graph.ts          # Graph implementation (ComputationGraphImpl, nodes)
│   ├── executor.ts       # Recipe executor using graphs
│   └── types.ts          # Graph types (MergeStrategy, GraphNode interfaces)
└── test/
    └── conformance.test.ts
```

## Migration Guide

If you previously imported from `@enhancement/graph`:

```typescript
// OLD (no longer exists)
import { ComputationGraphImpl } from '@enhancement/graph';

// NEW (import from recipe)
import { ComputationGraphImpl, createComputationGraph } from '@enhancement/recipe';
```

All graph types and implementations are re-exported from `@enhancement/recipe`.
