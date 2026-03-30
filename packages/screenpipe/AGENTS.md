# @enhancement/screenpipe

Screen/mic capture source that publishes to the event bus with optional persistent storage.

## Purpose

Integrates with the Screenpipe daemon to capture screenshots and audio streams from the user's desktop environment. Converts capture data into Enhancement chunks and publishes them to the bus for downstream processing. Supports selective capture modes (screen, mic, system audio) and automatic persistence to the store.

## Key Domain Concepts

- **ScreenpipeSource**: Low-level WebSocket source connecting to the Screenpipe daemon.
- **ScreenpipeController**: High-level controller managing capture lifecycle, bus integration, and persistence.
- **CaptureMode**: Configuration for what to capture:
  - `screen`: Screenshot capture
  - `mic`: Microphone audio
  - `systemAudio`: System audio output
- **WebSocket Streaming**: Real-time data from Screenpipe daemon on port 3030 (default).

## Public API

### Basic Usage

```typescript
import { createScreenpipe, ScreenpipeSource } from '@enhancement/screenpipe';
import { EnhancementBus } from '@enhancement/bus';
import { EnhancementStore } from '@enhancement/store';

// Using the high-level controller
const bus = new EnhancementBus("workspace-1");
const store = createStore({ dbPath: "./data.db" });

const screenpipe = createScreenpipe({
  workspace: "workspace-1",
  sessionId: "session-123",
  port: 3030,
  captureMode: { screen: true, mic: false, systemAudio: true },
  bus,
  store,
  autoPersist: true,
});

// Start capturing
screenpipe.startCapture();

// Check status
const status = screenpipe.getStatus();
console.log(status.running, status.captureMode, status.chunksCaptured);

// Modify capture mode dynamically
screenpipe.setCaptureMode({ screen: false });

// Stop capturing
screenpipe.stopCapture();
```

### Using ScreenpipeSource Directly

```typescript
import { ScreenpipeSource } from '@enhancement/screenpipe';

const source = new ScreenpipeSource({
  workspace: "workspace-1",
  sessionId: "session-123",
  port: 3030,
  captureMode: { screen: true, mic: true, systemAudio: false },
});

// Stream chunks
source.stream((chunk) => {
  console.log("Received:", chunk.contentType, chunk.timestamp);
});

// Stop streaming
source.stop();

// Listen for mode changes
const unsub = source.onModeChange(() => {
  console.log("Capture mode changed:", source.getCaptureMode());
});
```

### Capture Mode Management

```typescript
// Get current mode
const mode = screenpipe.getCaptureMode();
// { screen: true, mic: false, systemAudio: true }

// Partial update
screenpipe.setCaptureMode({ mic: true });

// Listen for changes
screenpipe.onCaptureModeChange(() => {
  console.log("Mode changed!");
});
```

## Design Decisions

1. **Dual API**: Low-level `ScreenpipeSource` for raw access, `ScreenpipeController` for integrated workflows.
2. **WebSocket Reconnection**: Automatic retry with exponential backoff (max 5 retries).
3. **Dynamic Mode Switching**: Capture can be reconfigured without restarting the connection.
4. **Chunk Metadata**: Enriches chunks with window title, app name, and capture settings.
5. **Auto-Persistence**: Optional automatic storage of all captured chunks.

## Dependencies

- `@enhancement/types`: Core types (RawChunk, Source, ContextChunk)
- `@enhancement/bus`: Event bus integration
- `@enhancement/store`: Persistent storage (optional)

## Package Structure

```text
packages/screenpipe/
├── src/
│   ├── index.ts              # Public exports
│   ├── screenpipe-source.ts  # WebSocket source implementation
│   └── screenpipe-controller.ts # High-level controller
└── test/
    └── conformance.test.ts
```
