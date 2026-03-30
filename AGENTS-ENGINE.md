# @enhancement/engine

Core orchestration layer for the Enhancement platform. Coordinates all subsystems and manages the lifecycle of enhancement sessions.

## Purpose

The engine is the central conductor of the Enhancement system. It orchestrates data flow between the event bus, storage, and plugins; manages session lifecycles; executes recipes through the recipe executor; handles plugin discovery and loading; provides health monitoring; and coordinates the canonical wiring pattern across all components.

## Key Domain Concepts

- **EnhancementEngine**: Main orchestrator class that manages all subsystems.
- **EngineState**: The engine's lifecycle state — `initializing` → `running` → `stopping` → `stopped`.
- **Session**: An isolated execution context with its own resources and plugin instances.
- **SessionHandler**: Callback invoked when sessions start or end.
- **HealthStatus**: Aggregated health check result from all subsystems.
- **EngineConfig**: Configuration for engine initialization including timeouts and limits.

## Public API

### Factory Function

```typescript
import { createEngine } from '@enhancement/engine';
import { EventBus } from '@enhancement/bus';
import { PluginLoader } from '@enhancement/plugins';

const bus = new EventBus({ maxQueueSize: 1000 });
const pluginLoader = new PluginLoader();

const engine = createEngine({
  bus,
  pluginLoader,
  workspace: '/path/to/workspace',
  healthCheckInterval: 30000,
  gracefulShutdownTimeout: 5000,
  maxConcurrentSessions: 10,
});
```

### EnhancementEngine Class

```typescript
import { EnhancementEngine } from '@enhancement/engine';

// Initialize the engine and all plugins
await engine.initialize();

// Start accepting sessions and processing events
await engine.start();

// Create a new session
const session = engine.createSession({
  id: 'session-123',
  metadata: { source: 'cli', user: 'alice' },
});

// Retrieve an existing session
const existing = engine.getSession('session-123');
if (existing) {
  console.log('Session found:', existing.id);
}

// Check engine health
const health = engine.healthCheck();
console.log('Status:', health.status); // 'healthy' | 'degraded' | 'unhealthy'
console.log('Subsystems:', health.subsystems);

// Register event hooks
engine.onSessionStart((session) => {
  console.log('Session started:', session.id);
});

engine.onSessionEnd((session, result) => {
  console.log('Session ended:', session.id, result.status);
});

engine.onError((error, context) => {
  console.error('Engine error:', error, context);
});

// Graceful shutdown
await engine.stop();
```

### Engine Configuration

```typescript
import type { EngineConfig } from '@enhancement/engine';

const config: EngineConfig = {
  // Required
  bus: EventBus;
  pluginLoader: PluginLoader;
  workspace: string;
  
  // Optional
  healthCheckInterval?: number;      // ms between health checks (default: 30000)
  gracefulShutdownTimeout?: number;    // ms to wait for cleanup (default: 5000)
  maxConcurrentSessions?: number;      // max active sessions (default: 10)
  store?: Store;                       // optional data persistence
};
```

### Session Management

```typescript
import type { Session, SessionConfig } from '@enhancement/engine';

// Create with configuration
const session = engine.createSession({
  id: generateId(),
  parentId?: string;     // optional parent for nested sessions
  metadata?: Record<string, unknown>;
  ttl?: number;          // session timeout in ms
});

// Session properties
console.log(session.id);
console.log(session.state); // 'active' | 'paused' | 'completed' | 'error'
console.log(session.createdAt);
console.log(session.workspace);

// Session operations
await session.pause();
await session.resume();
await session.complete(result);
await session.fail(error);
```

### Health Monitoring

```typescript
import type { HealthStatus, SubsystemHealth } from '@enhancement/engine';

const health: HealthStatus = engine.healthCheck();

// Overall status
health.status; // 'healthy' | 'degraded' | 'unhealthy'

// Individual subsystems
health.subsystems: SubsystemHealth[];
// Each: { name: string, status: 'healthy' | 'unhealthy', latency: number, lastCheck: Date }

// Timestamps
health.timestamp;    // When check was performed
health.uptime;       // Engine uptime in ms
```

### Event Hooks

```typescript
import type { SessionHandler, ErrorHandler } from '@enhancement/engine';

// Called when any session starts
engine.onSessionStart((session: Session) => {
  // Setup, logging, metrics
});

// Called when any session ends (success or failure)
engine.onSessionEnd((session: Session, result: SessionResult) => {
  // Cleanup, logging, metrics
});

// Called on engine errors
engine.onError((error: Error, context: ErrorContext) => {
  // error: The error that occurred
  // context.sessionId?: string - session if applicable
  // context.subsystem: string - which component failed
  // context.recoverable: boolean - can continue?
});
```

## Design Decisions

1. **Single Engine Per Workspace**: Only one active engine instance per workspace to prevent resource conflicts and state inconsistency. Attempting to create multiple engines for the same workspace throws.

2. **Centralized Orchestration**: Rather than distributed coordination, a single engine manages all subsystems. This simplifies debugging and provides a single point of observability.

3. **Synchronous Health Checks**: Health checks are fast, synchronous operations that return cached results. Background tasks periodically refresh the health state. This ensures `healthCheck()` never blocks.

4. **Graceful Shutdown with Timeout**: On `stop()`, the engine:
   - Stops accepting new sessions
   - Waits for active sessions to complete (up to timeout)
   - Forcefully terminates remaining sessions
   - Disposes all plugins and closes the bus

5. **Session Isolation**: Each session has isolated state and plugin instances. Sessions cannot interfere with each other even when running concurrently.

6. **Event-Driven Architecture**: The engine uses the bus for all internal communication. Subsystems emit events; the engine coordinates responses.

7. **Recoverable vs Fatal Errors**: Errors are classified as recoverable (session can continue) or fatal (requires session termination). The engine handles each appropriately.

## Dependencies

- `@enhancement/bus`: Event bus for internal communication
- `@enhancement/types`: Core type system (Chunk, ExecutionContext, etc.)
- `@enhancement/plugins`: Plugin loading and lifecycle management

## Package Structure

```text
packages/engine/
├── src/
│   ├── index.ts           # Public exports
│   ├── engine.ts          # EnhancementEngine class
│   ├── session.ts         # Session management
│   ├── state-machine.ts   # Engine state transitions
│   ├── health.ts          # Health monitoring subsystem
│   ├── hooks.ts           # Event hook system
│   └── config.ts          # Configuration types and validation
└── test/
    ├── conformance.test.ts
    ├── engine.test.ts
    ├── session.test.ts
    └── health.test.ts
```
