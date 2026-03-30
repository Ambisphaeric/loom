# End-to-End Experiments

This directory contains integration experiments that demonstrate how the loom packages can be chained together for real-world workflows.

## Overview

These experiments go beyond unit tests to show practical usage patterns combining:

- **@enhancement/bus** — Event bus for message routing
- **@enhancement/join-synchronizer** — Coordinating parallel branches
- **@enhancement/deferred-queue** — Scheduling future actions
- **@enhancement/test-harness** — Test utilities and mocks
- **@enhancement/types** — Core type system

## Experiments

### 1. Multi-Source Pipeline (`multi-source-pipeline.ts`)

Demonstrates sensor data streams being published to the bus, merged using `MergeQueue`, and coordinated with `JoinSynchronizer`.

**Key patterns:**

- Multiple content type subscriptions
- Zip merge strategy
- Parallel data streams
- Bus passthrough handling

```bash
bun e2e/multi-source-pipeline.ts
```

### 2. Deferred Workflow (`deferred-workflow.ts`)

Shows deferred actions being queued and executed, with results published back to the bus.

**Key patterns:**

- DeferredQueue scheduling
- Action executors publishing to bus
- Mock credential provider integration
- Event-driven action completion

```bash
bun e2e/deferred-workflow.ts
```

### 3. Parallel Processing (`parallel-processing.ts`)

Demonstrates parallel processing branches with different join strategies (barrier and wait-any).

**Key patterns:**

- Parallel branch execution
- Barrier join (wait for N chunks)
- Wait-any join (first to complete)
- Inter-branch communication via bus

```bash
bun e2e/parallel-processing.ts
```

### 4. Full Integration (`full-integration.ts`)

A complete workflow combining all packages: deferred actions, parallel branches, bus routing, merge queues, and join synchronization.

**Key patterns:**

- Full event-driven architecture
- Multi-source multimedia merging
- Deferred actions triggering from events
- Comprehensive metrics tracking
- Workflow completion coordination

```bash
bun e2e/full-integration.ts
```

## Running Experiments

### Run all experiments

```bash
bun e2e/runner.ts
```

### Run a specific experiment

```bash
# By experiment number or name
bun e2e/runner.ts multi-source-pipeline
bun e2e/runner.ts deferred
bun e2e/runner.ts parallel-processing
bun e2e/runner.ts full-integration
```

### Run directly

```bash
# Any experiment can be run directly with bun
bun e2e/multi-source-pipeline.ts
bun e2e/deferred-workflow.ts
bun e2e/parallel-processing.ts
bun e2e/full-integration.ts
```

## Expected Output

Each experiment produces detailed console output showing:

- Component interactions (bus messages, queue operations)
- Branch progress and completion
- Join strategy results
- Metrics and summaries

A successful run ends with:

```text
✅ Experiment N completed successfully
```

## Architecture Patterns Demonstrated

### Event-Driven Architecture

All experiments use the bus as the central nervous system:

```typescript
// Components publish events
workflowBus.publish(chunk);

// Other components subscribe and react
workflowBus.subscribe("content/image", async (chunk) => {
  // Process image
});
```

### Parallel Processing with Coordination

Join synchronizers coordinate parallel work:

```typescript
const join = createWaitAllJoin({ continueOnError: true });

// Multiple branches add chunks
join.addChunk("branch-1", chunk1);
join.addChunk("branch-2", chunk2);

// Wait for all to complete
const results = await join.join();
```

### Deferred Execution

Actions can be scheduled for future execution:

```typescript
await queue.enqueue(
  { type: "process-data", payload: data },
  {
    delayMs: 1000,
    executor: async (action) => {
      // Execute later
    }
  }
);
```

### Multi-Source Merging

Different content streams can be combined:

```typescript
bus.subscribeMultiple(
  ["audio", "video", "transcript"],
  async (chunks) => {
    // All three sources have data
    const merged = mergeMedia(chunks);
  },
  { strategy: "zip", timeout: 5000 }
);
```

## Adding New Experiments

To create a new experiment:

1. Create a new file in `e2e/<experiment-name>.ts`
2. Export a `runExperiment` function
3. Add the experiment to `e2e/runner.ts`
4. Follow the existing pattern with `if (import.meta.main)` guard

## Integration with CI

These experiments can be run in CI to verify package integration:

```yaml
# Example CI step
- name: Run E2E Experiments
  run: bun e2e/runner.ts
```

## Troubleshooting

### Module resolution issues

Ensure packages are built:

```bash
turbo run build
```

### Type errors

Check that all packages compile:

```bash
turbo run build
```

### Missing dependencies

Install dependencies at root:

```bash
bun install
```
