# @enhancement/discovery

LLM/STT detection, system discovery, and installer stubs for local AI services.

## Purpose

Automatically detects running AI services on the local machine (Ollama, LM Studio, Screenpipe, STT services) and provides system information gathering. Helps users discover available AI capabilities without manual configuration.

## Key Domain Concepts

- **DiscoveryService**: Main service orchestrating service detection with caching.
- **DiscoveredService**: Information about a detected service (type, URL, port, models, status).
- **SystemInfo**: Platform details including CPU, memory, and installed services.
- **Service Types**: "llm", "stt", "embedding".
- **Detection Functions**: Specialized detectors for LLM and STT services.
- **Installer Stubs**: Guidance for installing missing services.

## Public API

### Discovery Service

```typescript
import { createDiscoveryService } from '@enhancement/discovery';

const discovery = createDiscoveryService({
  timeout: 500,        // Detection timeout in ms
  includeModels: true, // Fetch available models
});

// Full discovery with caching
const result = await discovery.discover();
console.log(result.services);   // DiscoveredService[]
console.log(result.systemInfo); // SystemInfo
console.log(result.timestamp);

// Force refresh (bypass cache)
const fresh = await discovery.discover(true);

// Get cached services
const cached = discovery.getCachedServices();

// Get only running services
const running = discovery.getRunningServices();

// Filter by type
const llms = discovery.getServicesByType("llm");
const stts = discovery.getServicesByType("stt");
```

### Direct Detection

```typescript
import { detectLLM, detectSTT, detectAllServices, probePort } from '@enhancement/discovery';

// Detect specific LLM provider
const ollamaResult = await detectLLM("ollama");
// { detected: true, provider: "ollama", models: ["llama2", "mistral"], url: "..." }

// Detect specific STT provider
const whisperResult = await detectSTT("whisper");
// { detected: true, provider: "whisper", model: "base" }

// Detect all services
const allServices = await detectAllServices({ timeout: 1000 });

// Probe specific port
const isRunning = await probePort(11434, "/v1/models");
```

### System Information

```typescript
import { getSystemInfo, installService } from '@enhancement/discovery';

const info = await getSystemInfo();
// {
//   platform: "darwin",
//   arch: "arm64",
//   cpus: 8,
//   memory: 17179869184,
//   screenpipeAvailable: true,
//   ollamaInstalled: true,
//   lmStudioInstalled: false
// }
```

### Service Installation

```typescript
// Attempt to install a service (provides guidance)
const result = await discovery.install("ollama");
// { success: false, message: "Ollama installation requires manual download..." }

// Direct installation call
const installResult = await installService("screenpipe");
```

## Detected Services

The discovery system checks these ports by default:

| Service | Port | Type |
| --------- | ------ | ------ |
| Ollama | 11434 | llm |
| LM Studio | 1234 | llm |
| vLLM | 8000 | llm |
| llama.cpp | 8080 | llm |
| Parakeet | 8765 | stt |
| Whisper | 8766 | stt |

## Design Decisions

1. **Port-Based Detection**: Services are detected by probing known ports with short timeouts.
2. **OpenAI-Compatible Endpoints**: LLM detection uses `/v1/models` endpoint (OpenAI spec).
3. **Caching with TTL**: 30-second cache prevents repeated probing during rapid discovery calls.
4. **Graceful Degradation**: Services that don't respond are marked "stopped" without throwing errors.
5. **Installation Guidance**: Installer stubs provide helpful messages rather than automated installation.

## Dependencies

- `@enhancement/types`: Core types (ModelPurpose)
- `@enhancement/config`: Configuration
- `@enhancement/ai-providers`: Provider integration

## Package Structure

```text
packages/discovery/
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Type definitions
│   ├── discovery-service.ts  # Main DiscoveryService class
│   ├── detection.ts          # Port probing logic
│   └── system.ts             # System info and installers
└── test/
    └── conformance.test.ts
```
