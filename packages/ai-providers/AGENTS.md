# @enhancement/ai-providers

Vercel AI SDK-style provider registry for local and remote LLM providers.

## Purpose

Provides a unified interface for multiple AI providers (OpenAI, Ollama, LM Studio, etc.) with support for chat completions, streaming, and embeddings. The registry pattern allows dynamic provider registration and model resolution across different AI services.

## Key Domain Concepts

- **AIProvider**: Interface for any AI provider implementation.
- **ProviderRegistry**: Central registry for managing multiple providers.
- **ProviderEndpoint**: Connection configuration (baseUrl, apiKey, headers).
- **ProviderModel**: Model metadata including purpose and capabilities.
- **ModelResolution**: Resolved provider + model + endpoint for a given model ID.
- **ProviderType**: Classification as "local" or "cloud".

## Public API

### Provider Registry

```typescript
import { 
  createProviderRegistry, 
  OpenAICompatibleProvider 
} from '@enhancement/ai-providers';

// Create registry
const registry = createProviderRegistry();

// Register providers
registry.register(new OpenAICompatibleProvider(
  "https://api.openai.com/v1",
  process.env.OPENAI_API_KEY
));

// List all providers
const providers = registry.list();

// Get specific provider
const openai = registry.get("openai-compatible");

// Set default
registry.setDefault("openai-compatible");

// Resolve model to provider
const resolution = registry.resolveModel("gpt-4");
// { provider, model, endpoint }
```

### Chat Completions

```typescript
const provider = registry.getDefault();
const endpoint = provider.defaultEndpoint;

// Non-streaming
const result = await provider.createChatCompletion(endpoint, {
  model: "gpt-4",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" }
  ],
  temperature: 0.7,
  maxTokens: 500,
});

console.log(result.content);
console.log(result.usage); // { promptTokens, completionTokens, totalTokens }
```

### Streaming Completions

```typescript
const stream = provider.createStreamingCompletion(endpoint, {
  model: "gpt-4",
  messages: [{ role: "user", content: "Tell me a story" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk); // Streamed text chunks
}
```

### Embeddings

```typescript
const embedding = await provider.createEmbedding(endpoint, "Hello world");
// number[] - vector representation
```

### Custom Provider Implementation

```typescript
import type { AIProvider, ProviderEndpoint, ChatCompletionOptions } from '@enhancement/ai-providers';

class MyProvider implements AIProvider {
  name = "my-provider";
  type = "local" as const;
  defaultEndpoint = { name: "local", baseUrl: "http://localhost:8080" };
  models = [
    { id: "model-1", name: "Model One", purpose: "default", supportsStreaming: true }
  ];

  async createChatCompletion(endpoint: ProviderEndpoint, options: ChatCompletionOptions) {
    // Implementation
  }

  async testConnection(endpoint: ProviderEndpoint): Promise<boolean> {
    // Health check implementation
  }
}

registry.register(new MyProvider());
```

## Design Decisions

1. **OpenAI-Compatible Base**: Most providers implement the OpenAI API spec; `OpenAICompatibleProvider` covers most cases.
2. **Endpoint Abstraction**: Allows same provider to connect to different endpoints (local vs cloud).
3. **Model Purpose Tags**: Models declare their purpose ("default", "fast", "embedding") for automatic selection.
4. **Streaming First**: All providers support streaming via AsyncIterable.
5. **Connection Testing**: Built-in health check via `testConnection()`.

## Dependencies

- `@enhancement/types`: Core types (ModelPurpose)
- `@enhancement/config`: Configuration management

## Package Structure

```text
packages/ai-providers/
├── src/
│   ├── index.ts                   # Public exports
│   ├── types.ts                   # Type definitions
│   ├── registry.ts                # ProviderRegistry implementation
│   └── providers/
│       └── openai-compatible.ts   # OpenAI-compatible provider
└── test/
    └── conformance.test.ts
```
