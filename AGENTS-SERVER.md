# @enhancement/server

WebSocket/HTTP API server exposing the Enhancement engine over the network.

## Purpose

Provides network access to the Enhancement platform through a dual-protocol interface: HTTP REST for stateless CRUD operations and WebSocket for real-time streaming of bus events and session updates. Enables remote clients, web dashboards, and third-party integrations to interact with the Enhancement engine without local embedding.

## Key Domain Concepts

- **EnhancementServer**: Main server instance managing HTTP and WebSocket listeners.
- **Protocol**: Dual-mode communication — REST for request/response, WebSocket for streaming.
- **Workspace**: Isolation boundary; all API calls are scoped to a workspace.
- **Session**: Active recipe execution tracked by the server with real-time status.
- **Authentication**: Bearer token validation against stored credentials.
- **RateLimit**: Per-workspace request throttling to prevent abuse.

## Public API

### Server Creation

```typescript
import { EnhancementServer, createServer } from '@enhancement/server';
import { EnhancementBus } from '@enhancement/bus';
import { EnhancementEngine } from '@enhancement/engine';

const server = createServer({
  httpPort: 3000,
  bus: new EnhancementBus('server-bus'),
  engine: new EnhancementEngine(),
  cors: {
    origin: ['https://dashboard.enhancement.dev'],
    credentials: true
  },
  rateLimit: {
    windowMs: 60000,  // 1 minute
    maxRequests: 100  // per workspace
  }
});

await server.start();
```

### HTTP REST API

```typescript
// Health and metrics (public endpoints)
GET /health          // { status: 'ok', version: '0.1.0', uptime: 3600 }
GET /metrics         // Prometheus format

// Workspace management (requires auth)
GET    /api/v1/workspaces              // List all workspaces
POST   /api/v1/workspaces              // Create workspace { name: string }
DELETE /api/v1/workspaces/:id          // Delete workspace

// Credential management (requires auth)
GET    /api/v1/credentials             // List credentials for workspace
POST   /api/v1/credentials             // Set credential { provider, value }
DELETE /api/v1/credentials/:id         // Delete credential

// Recipe execution (requires auth)
GET    /api/v1/recipes                 // List available recipes
POST   /api/v1/recipes/:id/run         // Execute recipe { inputs, options }
GET    /api/v1/recipes/:id/status      // Check recipe status

// Session management (requires auth)
GET    /api/v1/sessions                // List active sessions
GET    /api/v1/sessions/:id            // Get session details
DELETE /api/v1/sessions/:id            // Kill running session
```

### WebSocket API

```typescript
import { WebSocket } from 'ws';

// Subscribe to bus events
const busWs = new WebSocket('wss://api.enhancement.dev/ws/bus', {
  headers: { Authorization: 'Bearer <token>' }
});

busWs.on('message', (data) => {
  const event = JSON.parse(data);
  // event: { type: 'chunk', payload: Chunk, workspace: string, timestamp: number }
});

// Subscribe to specific session updates
const sessionWs = new WebSocket('wss://api.enhancement.dev/ws/sessions/:id', {
  headers: { Authorization: 'Bearer <token>' }
});

sessionWs.on('message', (data) => {
  const update = JSON.parse(data);
  // update: { status: 'running'|'completed'|'failed', progress: number, output?: Chunk }
});
```

### Server Management

```typescript
// Graceful shutdown with connection draining
await server.shutdown({
  drainTimeoutMs: 30000,  // Wait for connections to close
  forceAfterMs: 5000      // Force close after timeout
});

// Runtime configuration updates
server.updateRateLimit({
  windowMs: 30000,
  maxRequests: 50
});
```

## Design Decisions

1. **Dual Protocol (HTTP + WebSocket)**: HTTP REST handles stateless CRUD with simple request/response semantics; WebSocket provides real-time streaming for event bus and session updates without polling overhead.

2. **Bearer Token Authentication**: Tokens are stored as credentials in `@enhancement/credentials` and validated on every request. Tokens are workspace-scoped — a token only accesses its associated workspace.

3. **Per-Workspace Rate Limiting**: Rate limits apply per workspace ID, not per IP or token. This prevents a single workspace from overwhelming the server while allowing legitimate high-traffic workspaces to configure higher limits.

4. **CORS Configuration**: CORS is explicitly configured at server startup. No wildcards allowed in production; origins must be explicitly listed to prevent unauthorized web dashboard embedding.

5. **Graceful Shutdown**: On shutdown signal, the server stops accepting new connections, sends close frames to WebSocket clients, and waits for in-flight HTTP requests to complete before exiting. Long-running sessions receive a termination warning.

6. **Workspace Isolation**: All endpoints (except health/metrics) require a workspace context. There is no global admin API; management happens through the CLI or direct database access.

7. **Metrics Export**: Prometheus-compatible metrics endpoint exposes request latency, active connections, WebSocket message throughput, and rate limit hits for observability.

## Dependencies

- `@enhancement/engine`: Recipe execution and orchestration
- `@enhancement/bus`: Event bus for WebSocket streaming
- `@enhancement/credentials`: Token validation
- `fastify` or `hono`: HTTP server framework (TBD)
- `ws`: WebSocket implementation

## Package Structure

```text
packages/server/
├── src/
│   ├── index.ts          # Public exports
│   ├── server.ts         # EnhancementServer implementation
│   ├── http/
│   │   ├── routes.ts     # REST route definitions
│   │   ├── middleware.ts # Auth, rate limit, CORS
│   │   └── handlers.ts   # Request handlers
│   ├── websocket/
│   │   ├── bus-hub.ts    # /ws/bus connection manager
│   │   └── session-hub.ts # /ws/sessions/:id manager
│   └── types.ts          # Server-specific types
└── test/
    ├── server.test.ts
    ├── http.test.ts
    ├── websocket.test.ts
    └── conformance.test.ts
```
