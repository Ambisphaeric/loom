# @enhancement/bus

Event bus with bounded queues and merge strategies for coordinating async operations.

## Purpose

Provides a centralized event bus that manages backpressure through bounded queues and supports multiple event merging strategies (latest, buffer, zip). Used when components need to communicate without direct coupling.

## Key Domain Concepts

- **EventBus**: Central pub/sub system with typed channels.
- **BoundedQueue**: Queue with capacity limits — blocks or drops when full.
- **MergeQueue**: Combines multiple input streams with configurable strategies.
- **MergeStrategy**: How multiple streams combine — `latest`, `buffer`, `zip`.

## Public API

### EventBus

```typescript
import { EventBus, createEventBus } from '@enhancement/bus';

const bus = createEventBus({ 
  maxQueueSize: 100  // Backpressure limit
});

// Subscribe to a channel
const unsub = bus.subscribe('user:actions', (event) => {
  console.log(event.type, event.payload);
});

// Emit events
await bus.emit('user:actions', { type: 'click', payload: { x: 10, y: 20 } });

// Cleanup
unsub();
await bus.dispose();
```

### BoundedQueue

```typescript
import { BoundedQueue, QueueFullStrategy } from '@enhancement/bus';

const queue = new BoundedQueue<string>({
  capacity: 10,
  onFull: QueueFullStrategy.BLOCK  // Or DROP_LATEST, DROP_OLDEST
});

await queue.enqueue("task");
const item = await queue.dequeue();
```

### MergeQueue

```typescript
import { MergeQueue, MergeStrategy } from '@enhancement/bus';

const merged = new MergeQueue({
  sources: [userStream, systemStream],
  strategy: MergeStrategy.LATEST  // Emit when any source updates
});

for await (const [user, system] of merged) {
  // Process combined state
}
```

## Design Decisions

1. **Typed Channels**: Channel names carry type information via TypeScript.
2. **Backpressure by Default**: All queues are bounded; unbounded growth is opt-in.
3. **Async Iteration**: MergeQueue implements AsyncIterable for natural loop consumption.
4. **Resource Cleanup**: All resources have explicit `dispose()` methods.

## Dependencies

- `@enhancement/types`: Core type system

## Package Structure

```text
packages/bus/
├── src/
│   ├── index.ts      # Public exports
│   ├── event-bus.ts  # EventBus implementation
│   ├── queue.ts      # BoundedQueue, MergeQueue
│   └── types.ts      # Internal type definitions
└── test/
    ├── conformance.test.ts
    └── merge-queue.test.ts
```
