# @enhancement/deferred-queue

Delayed, conditional, and queued action execution system.

## Purpose

Implements "act later" functionality — schedule actions for future execution, conditionally execute based on state changes, and queue operations for batch processing. Uses a database-backed store for durability.

## Key Domain Concepts

- **DeferredQueue**: Main interface for enqueueing and processing deferred actions.
- **DeferredAction**: An action with metadata (schedule time, priority, conditions).
- **ActionStatus**: Lifecycle states — `pending`, `scheduled`, `executing`, `completed`, `failed`, `cancelled`.
- **ActionExecutor**: User-provided function that actually performs the action.
- **Database**: Drizzle-compatible interface for persistence.

## Public API

### Creating a Queue

```typescript
import { createDeferredQueue } from '@enhancement/deferred-queue';

const queue = createDeferredQueue({
  db: drizzleDatabase,  // Drizzle or compatible
  tableName: 'deferred_actions',
  executor: async (action) => {
    // Execute the action
    await processWebhook(action.payload);
    return { status: 'completed' };
  }
});
```

### Enqueueing Actions

```typescript
// Simple delay
await queue.enqueue({
  type: 'send-email',
  payload: { to: 'user@example.com', template: 'welcome' }
}, {
  delayMs: 60000  // Execute in 1 minute
});

// Conditional execution
await queue.enqueue({
  type: 'process-payment',
  payload: { orderId: '123' }
}, {
  condition: {
    check: async () => await verifyInventory('123'),
    retryIntervalMs: 5000,
    maxRetries: 10
  }
});

// Scheduled time
await queue.enqueue({
  type: 'publish-post',
  payload: { postId: '456' }
}, {
  scheduledAt: new Date('2024-01-01T09:00:00Z')
});
```

### Processing

```typescript
// Process pending actions
await queue.process({
  batchSize: 10,      // Process up to 10 at once
  maxConcurrent: 3    // Max 3 concurrent executions
});

// Or start a background processor
const processor = queue.startProcessor({
  pollIntervalMs: 5000,
  batchSize: 5
});
// Later: await processor.stop();
```

### Action Management

```typescript
// Get action status
const action = await queue.get(actionId);
console.log(action.status);  // 'pending' | 'scheduled' | 'executing' | ...

// Cancel pending action
await queue.cancel(actionId);

// Retry failed action
await queue.retry(actionId, { retryCount: 1 });
```

## Design Decisions

1. **Database-Backed**: Actions survive restarts; no in-memory state to lose.
2. **Executor Pattern**: User provides execution logic; queue handles scheduling.
3. **Conditions as First-Class**: Conditional execution is built-in, not bolted-on.
4. **Status Machine**: Clear lifecycle with explicit state transitions.
5. **Poll-Based Processing**: Simple, observable, works with any database.

## Dependencies

- `@enhancement/types`: Core types
- `@enhancement/bus`: Event notifications (optional)

## Package Structure

```text
packages/deferred-queue/
├── src/
│   ├── index.ts          # Public exports
│   └── deferred-queue.ts
└── test/
    └── deferred-queue.test.ts
```
