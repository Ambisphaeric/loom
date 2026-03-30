# @enhancement/join-synchronizer

Parallel execution coordination with multiple synchronization strategies.

## Purpose

Manages concurrent operations that need to coordinate at synchronization points. Supports waiting for all branches, any branch, or using barrier/countdown patterns. Critical for parallel processing where partial results need to be combined.

## Key Domain Concepts

- **JoinSynchronizer**: Main coordinator for parallel branches.
- **JoinStrategy**: How branches synchronize:
  - `wait-all`: Wait for every branch to complete (default)
  - `wait-any`: Return when first branch completes
  - `barrier`: Wait until N branches reach a checkpoint
  - `timeout`: Abort if deadline exceeded
  - `first-wins`: First successful result wins, cancel others
- **JoinError**: Exception type for join failures (timeout, cancellation, branch error).

## Public API

### Basic Usage

```typescript
import { JoinSynchronizer, JoinStrategy } from '@enhancement/join-synchronizer';

const join = new JoinSynchronizer({
  strategy: JoinStrategy.WAIT_ALL,
  timeoutMs: 5000  // Optional deadline
});

// Register parallel branches
const branch1 = join.addBranch('fetch-user');
const branch2 = join.addBranch('fetch-orders');

// Execute concurrently
Promise.all([
  fetchUser().then(user => branch1.complete(user)),
  fetchOrders().then(orders => branch2.complete(orders))
]);

// Wait for results
const results = await join.waitForAll();
// results: Map<string, Result<T>>
```

### Strategy Examples

```typescript
// First completion wins
const join = new JoinSynchronizer({
  strategy: JoinStrategy.WAIT_ANY
});
const result = await join.waitForFirst();  // Single result

// Barrier synchronization
const barrier = new JoinSynchronizer({
  strategy: JoinStrategy.BARRIER,
  barrierCount: 3  // Wait for exactly 3 branches
});

// Timeout handling
try {
  const join = new JoinSynchronizer({ timeoutMs: 1000 });
  // ... long operations
  await join.waitForAll();
} catch (err) {
  if (err instanceof JoinError && err.reason === 'timeout') {
    // Handle timeout
  }
}
```

### Cleanup

```typescript
// Cancel all pending branches
join.cancel(new Error("User aborted"));
await join.dispose();
```

## Design Decisions

1. **Explicit Branch Registration**: Branches are named and tracked for debugging.
2. **Result Wrapping**: Each branch returns `Result<T>` discriminating success/failure.
3. **Cancellation Propagation**: Cancelling the join signals all pending branches.
4. **Timeout as Strategy**: Time bounds are first-class, not afterthoughts.

## Dependencies

- `@enhancement/types`: Core types
- `@enhancement/bus`: For cross-branch communication (optional)

## Package Structure

```text
packages/join-synchronizer/
├── src/
│   ├── index.ts          # Public exports
│   └── join-synchronizer.ts
└── test/
    └── join-synchronizer.test.ts
```
