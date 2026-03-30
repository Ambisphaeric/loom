---
name: config-mgmt
description: Manages workspace and global configuration for the Enhancement monorepo. Handles model endpoints, provider settings, and test state persistence. Use when implementing configuration management, model routing, or workspace settings.
---

# Config Management for Enhancement

## Overview

The `@enhancement/config` package provides persistent configuration management for workspaces and global settings. It supports:

- **Workspace-level configuration** — Per-workspace model endpoints, behaviors, pipeline settings
- **Global configuration** — Cross-workspace API keys, default models, data directories
- **Model endpoint management** — Ollama, LM Studio, API providers with test state tracking
- **Configuration validation** — Zod schemas ensure config integrity

## Architecture

### Storage

Uses `drizzle-orm` + SQLite for persistence:

```text
~/.enhancement/
├── config.db           # Global config + workspace registry
└── workspaces/
    └── <workspace-id>/
        └── config.db   # Workspace-specific config
```

### Key Types

| Type | Purpose |
| ----- | ------- |
| `ModelEndpoint` | LLM endpoint configuration (URL, key, provider) |
| `EndpointTestState` | Tracks if endpoint was tested successfully |
| `WorkspaceConfig` | Full workspace configuration |
| `GlobalConfig` | Application-wide settings |

## Model Endpoint Configuration

### Endpoint Structure

```typescript
interface ModelEndpoint {
  id: string;
  name: string;           // Display name (e.g., "Local Llama 3.1")
  provider: "ollama" | "lmstudio" | "openai" | "anthropic" | "custom";
  baseUrl: string;        // e.g., "http://localhost:11434"
  apiKey?: string;        // Optional (e.g., for cloud providers)
  modelName: string;      // e.g., "llama3.1", "glm-ocr", "gpt-4"
  purpose: ModelPurpose;  // "default" | "reasoning" | "fast" | "embedding" | "ocr" | "vision" | "audio"
  capabilities: string[]; // ["streaming", "vision", "json_mode"]
}
```

### Test State Tracking

Each endpoint has a test record:

```typescript
interface EndpointTestState {
  endpointId: string;
  lastTestedAt: number;
  status: "untested" | "success" | "failed";
  errorMessage?: string;
  latencyMs?: number;
}
```

## Usage Patterns

### Initialize Config Manager

```typescript
import { ConfigManager } from "@enhancement/config";

const config = new ConfigManager({
  dataDir: "~/.enhancement",  // Optional, defaults to ~/.enhancement
});

await config.initialize();
```

### Configure Model Endpoints

```typescript
// Add Ollama endpoint
await config.setModelEndpoint("my-workspace", {
  id: "ollama-llama3",
  name: "Local Llama 3.1",
  provider: "ollama",
  baseUrl: "http://localhost:11434",
  modelName: "llama3.1",
  purpose: "default",
  capabilities: ["streaming"],
});

// Add LM Studio endpoint
await config.setModelEndpoint("my-workspace", {
  id: "lmstudio-glm-ocr",
  name: "GLM OCR (LM Studio)",
  provider: "lmstudio",
  baseUrl: "http://localhost:1234",
  modelName: "glm-ocr",
  purpose: "ocr",
  capabilities: ["vision"],
});

// Add OpenAI endpoint
await config.setModelEndpoint("my-workspace", {
  id: "openai-gpt4",
  name: "GPT-4 (Cloud)",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-...",  // Stored encrypted
  modelName: "gpt-4",
  purpose: "reasoning",
  capabilities: ["streaming", "vision", "json_mode"],
});
```

### Test Endpoint

```typescript
// Test a specific endpoint
const testResult = await config.testModelEndpoint(
  "my-workspace",
  "ollama-llama3",
  async (endpoint) => {
    // Test function provided by caller
    const response = await fetch(`${endpoint.baseUrl}/api/generate`, {
      method: "POST",
      body: JSON.stringify({
        model: endpoint.modelName,
        prompt: "Hello, are you working?",
        stream: false,
      }),
    });
    return response.ok;
  }
);

// Result is automatically persisted
console.log(testResult.status); // "success" | "failed"
console.log(testResult.latencyMs);
```

### Get Available Endpoints

```typescript
// Get all endpoints for a workspace
const endpoints = await config.getModelEndpoints("my-workspace");

// Get endpoints filtered by purpose
const ocrEndpoints = await config.getModelEndpoints("my-workspace", "ocr");

// Get only tested/successful endpoints
const readyEndpoints = await config.getReadyModelEndpoints("my-workspace");
```

### Select Endpoint for Purpose

```typescript
// Get best endpoint for a purpose
const endpoint = await config.resolveModelEndpoint(
  "my-workspace",
  "ocr",  // purpose
  { requireTested: true, preferLocal: true }
);

if (endpoint) {
  console.log(`Using ${endpoint.name} for OCR`);
}
```

## Workspace Configuration

### Full Workspace Config

```typescript
const workspaceConfig: WorkspaceConfig = {
  name: "my-workspace",
  version: "1.0.0",
  schema_version: 1,
  description: "Personal knowledge management",
  model: {
    default: "ollama-llama3",
    reasoning: "openai-gpt4",
    ocr: "lmstudio-glm-ocr",
    embedding: "ollama-nomic-embed",
  },
  pipeline: {
    sources: ["screenpipe", "slack-monitor"],
    fetchers: ["web-fetcher"],
    transforms: ["ocr", "transcribe"],
    store: "default-store",
    tools: ["slack-send", "email-draft"],
  },
  behaviors: {
    proactive_suggestions: true,
    suggestion_interval: "5m",
    suggestion_min_confidence: 0.7,
  },
};

await config.saveWorkspaceConfig("my-workspace", workspaceConfig);
```

## Global Configuration

```typescript
const globalConfig = await config.getGlobalConfig();

// Update global settings
await config.updateGlobalConfig({
  defaultModel: "ollama-llama3",
  privacy: {
    telemetry: false,
    retentionDays: 90,
  },
});
```

## Integration with Other Packages

### With Router (Phase 4)

```typescript
// Router uses config to resolve endpoints
const endpoint = await config.resolveModelEndpoint(workspace, "vision");
const response = await fetch(`${endpoint.baseUrl}/v1/chat/completions`, {
  headers: {
    "Authorization": `Bearer ${endpoint.apiKey}`,
  },
  // ...
});
```

### With Credentials (Phase 3)

API keys are stored via the credentials package:

```typescript
// Config stores endpoint without API key
await config.setModelEndpoint(workspace, { ...endpoint, apiKey: undefined });

// API key stored separately (encrypted)
await credentials.set("openai", endpoint.id, apiKey);
```

## Database Schema

### Tables

```sql
-- Workspaces registry
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  config_json TEXT NOT NULL  -- Full WorkspaceConfig as JSON
);

-- Model endpoints
CREATE TABLE model_endpoints (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  capabilities TEXT NOT NULL,  -- JSON array
  credential_ref TEXT,         -- Reference to credentials store
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Endpoint test results
CREATE TABLE endpoint_tests (
  endpoint_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  last_tested_at INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  latency_ms INTEGER
);

-- Global config (single row)
CREATE TABLE global_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config_json TEXT NOT NULL
);
```

## Testing

```bash
# Run config package tests
bun test packages/config/test/

# Run all tests
bun test
```

## Conformance

See `packages/config/test/conformance.test.ts` for AGENTS-CONFIG.md spec verification.
