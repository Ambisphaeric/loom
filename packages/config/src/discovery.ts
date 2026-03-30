// ============================================================================
// Enhancement — Model Discovery Subsystem
// ============================================================================
// Auto-discovery of local LLM providers by port scanning
// Optional model list fetching from discovered providers

import type { EndpointProvider } from "./index.js";
import type { ModelPurpose } from "@enhancement/types";

// Known provider ports and endpoints
const PROVIDER_DISCOVERY_CONFIG: Record<
  EndpointProvider,
  {
    ports: number[];
    healthEndpoint: string;
    modelsEndpoint?: string;
    requiresApiKey: boolean;
    isLocal: boolean;
  }
> = {
  ollama: {
    ports: [11434],
    healthEndpoint: "/api/tags",
    modelsEndpoint: "/api/tags",
    requiresApiKey: false,
    isLocal: true,
  },
  lmstudio: {
    ports: [1234, 8080],
    healthEndpoint: "/v1/models",
    modelsEndpoint: "/v1/models",
    requiresApiKey: false,
    isLocal: true,
  },
  openai: {
    ports: [],
    healthEndpoint: "/v1/models",
    modelsEndpoint: "/v1/models",
    requiresApiKey: true,
    isLocal: false,
  },
  anthropic: {
    ports: [],
    healthEndpoint: "/v1/models",
    requiresApiKey: true,
    isLocal: false,
  },
  google: {
    ports: [],
    healthEndpoint: "/v1/models",
    requiresApiKey: true,
    isLocal: false,
  },
  mistral: {
    ports: [],
    healthEndpoint: "/v1/models",
    requiresApiKey: true,
    isLocal: false,
  },
  cohere: {
    ports: [],
    healthEndpoint: "/v1/models",
    requiresApiKey: true,
    isLocal: false,
  },
  azure: {
    ports: [],
    healthEndpoint: "/models",
    requiresApiKey: true,
    isLocal: false,
  },
  custom: {
    ports: [],
    healthEndpoint: "/health",
    requiresApiKey: false,
    isLocal: false,
  },
};

export interface DiscoveredProvider {
  providerId: EndpointProvider;
  baseUrl: string;
  isReachable: boolean;
  models: DiscoveredModel[];
  latencyMs: number;
  error?: string;
}

export interface DiscoveredModel {
  id: string;
  name: string;
  purpose?: ModelPurpose;
  capabilities: string[];
  size?: string;
  format?: string;
}

export interface DiscoveryOptions {
  /** Specific providers to scan (default: all local providers) */
  providers?: EndpointProvider[];
  /** Timeout per request in ms (default: 3000) */
  timeoutMs?: number;
  /** Whether to fetch available models from discovered providers */
  fetchModels?: boolean;
  /** Optional API keys for cloud providers */
  apiKeys?: Partial<Record<EndpointProvider, string>>;
  /** Custom base URLs for cloud providers */
  baseUrls?: Partial<Record<EndpointProvider, string>>;
}

export interface DiscoveryResult {
  providers: DiscoveredProvider[];
  totalFound: number;
  reachableCount: number;
  scanDurationMs: number;
}

/**
 * Discover available LLM providers
 *
 * Scans local ports for Ollama (11434), LM Studio (1234, 8080), etc.
 * Optionally fetches available models from discovered providers.
 *
 * Example:
 * ```typescript
 * const discovery = new ModelDiscovery();
 *
 * // Scan local providers
 * const result = await discovery.scanLocal();
 * console.log(`Found ${result.totalFound} providers`);
 *
 * // Check if Ollama is running
 * const ollama = result.providers.find(p => p.providerId === 'ollama');
 * if (ollama?.isReachable) {
 *   console.log('Available models:', ollama.models.map(m => m.id));
 * }
 * ```
 */
export class ModelDiscovery {
  private abortControllers: AbortController[] = [];

  /**
   * Scan for local providers (Ollama, LM Studio, etc.)
   */
  async scanLocal(options: Omit<DiscoveryOptions, 'apiKeys' | 'baseUrls'> = {}): Promise<DiscoveryResult> {
    const startTime = Date.now();
    const localProviders = this.getLocalProviders();
    const providers = await this.scanProviders(localProviders, options);

    return {
      providers,
      totalFound: providers.length,
      reachableCount: providers.filter((p) => p.isReachable).length,
      scanDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Check if a specific provider is available
   */
  async checkProvider(
    providerId: EndpointProvider,
    options: Omit<DiscoveryOptions, 'providers'> = {}
  ): Promise<DiscoveredProvider | null> {
    const config = PROVIDER_DISCOVERY_CONFIG[providerId];
    if (!config) return null;

    const baseUrl = options.baseUrls?.[providerId] || this.getDefaultBaseUrl(providerId);
    if (!baseUrl) return null;

    return this.checkEndpoint(providerId, baseUrl, {
      ...options,
      fetchModels: options.fetchModels ?? true,
    });
  }

  /**
   * Quick check if Ollama is running
   */
  async isOllamaRunning(baseUrl = "http://localhost:11434"): Promise<boolean> {
    const result = await this.checkEndpoint("ollama", baseUrl, { fetchModels: false });
    return result?.isReachable ?? false;
  }

  /**
   * Quick check if LM Studio is running
   */
  async isLmStudioRunning(baseUrl = "http://localhost:1234"): Promise<boolean> {
    const result = await this.checkEndpoint("lmstudio", baseUrl, { fetchModels: false });
    return result?.isReachable ?? false;
  }

  /**
   * Get available models from a running Ollama instance
   */
  async getOllamaModels(baseUrl = "http://localhost:11434"): Promise<DiscoveredModel[]> {
    const result = await this.checkEndpoint("ollama", baseUrl, { fetchModels: true });
    return result?.models ?? [];
  }

  /**
   * Get available models from LM Studio
   */
  async getLmStudioModels(baseUrl = "http://localhost:1234"): Promise<DiscoveredModel[]> {
    const result = await this.checkEndpoint("lmstudio", baseUrl, { fetchModels: true });
    return result?.models ?? [];
  }

  /**
   * Abort all pending discovery operations
   */
  abort(): void {
    for (const controller of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers = [];
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private getLocalProviders(): EndpointProvider[] {
    return (Object.keys(PROVIDER_DISCOVERY_CONFIG) as EndpointProvider[]).filter(
      (p) => PROVIDER_DISCOVERY_CONFIG[p].isLocal
    );
  }

  private getDefaultBaseUrl(providerId: EndpointProvider): string | null {
    const config = PROVIDER_DISCOVERY_CONFIG[providerId];
    if (!config.isLocal || config.ports.length === 0) return null;
    return `http://localhost:${config.ports[0]}`;
  }

  private async scanProviders(
    providerIds: EndpointProvider[],
    options: Omit<DiscoveryOptions, 'apiKeys' | 'baseUrls'>
  ): Promise<DiscoveredProvider[]> {
    const timeoutMs = options.timeoutMs ?? 3000;
    const fetchModels = options.fetchModels ?? true;
    const discoveries: Promise<DiscoveredProvider | null>[] = [];

    for (const providerId of providerIds) {
      const config = PROVIDER_DISCOVERY_CONFIG[providerId];

      for (const port of config.ports) {
        const baseUrl = `http://localhost:${port}`;
        discoveries.push(
          this.checkEndpoint(providerId, baseUrl, {
            timeoutMs,
            fetchModels,
          })
        );
      }
    }

    const results = await Promise.all(discoveries);
    return results.filter((r): r is DiscoveredProvider => r !== null);
  }

  private async checkEndpoint(
    providerId: EndpointProvider,
    baseUrl: string,
    options: { timeoutMs?: number; fetchModels?: boolean; apiKey?: string }
  ): Promise<DiscoveredProvider | null> {
    const config = PROVIDER_DISCOVERY_CONFIG[providerId];
    const timeoutMs = options.timeoutMs ?? 3000;
    const controller = new AbortController();
    this.abortControllers.push(controller);

    const startTime = Date.now();

    try {
      // Check health endpoint
      const healthUrl = `${baseUrl}${config.healthEndpoint}`;
      const headers: Record<string, string> = {};

      if (options.apiKey) {
        headers["Authorization"] = `Bearer ${options.apiKey}`;
      }

      const response = await fetch(healthUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok && response.status !== 404) {
        return {
          providerId,
          baseUrl,
          isReachable: false,
          models: [],
          latencyMs,
          error: `HTTP ${response.status}`,
        };
      }

      // Provider is reachable
      let models: DiscoveredModel[] = [];

      if (options.fetchModels && config.modelsEndpoint) {
        try {
          models = await this.fetchModels(providerId, baseUrl, headers, timeoutMs);
        } catch {
          // Ignore model fetch errors, still mark as reachable
        }
      }

      return {
        providerId,
        baseUrl,
        isReachable: true,
        models,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return {
        providerId,
        baseUrl,
        isReachable: false,
        models: [],
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      const index = this.abortControllers.indexOf(controller);
      if (index > -1) {
        this.abortControllers.splice(index, 1);
      }
    }
  }

  private async fetchModels(
    providerId: EndpointProvider,
    baseUrl: string,
    headers: Record<string, string>,
    timeoutMs: number
  ): Promise<DiscoveredModel[]> {
    const config = PROVIDER_DISCOVERY_CONFIG[providerId];
    if (!config.modelsEndpoint) return [];

    const url = `${baseUrl}${config.modelsEndpoint}`;

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return [];

    const data = await response.json();

    // Parse based on provider format
    switch (providerId) {
      case "ollama":
        return this.parseOllamaModels(data);
      case "lmstudio":
        return this.parseLmStudioModels(data);
      default:
        return [];
    }
  }

  private parseOllamaModels(data: unknown): DiscoveredModel[] {
    // Ollama format: { models: [{ name: "llama3.1", size: ..., modified_at: ... }] }
    const models = (data as { models?: Array<{ name: string; size?: number; modified_at?: string }> })?.models;
    if (!Array.isArray(models)) return [];

    return models.map((m) => ({
      id: m.name,
      name: m.name,
      purpose: this.inferPurposeFromModelName(m.name),
      capabilities: this.inferCapabilitiesFromModelName(m.name),
      size: m.size ? this.formatBytes(m.size) : undefined,
    }));
  }

  private parseLmStudioModels(data: unknown): DiscoveredModel[] {
    // LM Studio format: { data: [{ id: "...", object: "model" }] }
    const models = (data as { data?: Array<{ id: string }> })?.data;
    if (!Array.isArray(models)) return [];

    return models.map((m) => ({
      id: m.id,
      name: m.id,
      purpose: this.inferPurposeFromModelName(m.id),
      capabilities: this.inferCapabilitiesFromModelName(m.id),
    }));
  }

  private inferPurposeFromModelName(modelId: string): ModelPurpose {
    const lower = modelId.toLowerCase();
    if (lower.includes("embed") || lower.includes("e5") || lower.includes("bge")) {
      return "embedding";
    }
    if (lower.includes("vision") || lower.includes("llava") || lower.includes("clip")) {
      return "vision";
    }
    if (lower.includes("ocr") || lower.includes("glm-4v")) {
      return "ocr";
    }
    if (lower.includes("whisper") || lower.includes("audio")) {
      return "audio";
    }
    if (lower.includes("reasoning") || lower.includes("o1") || lower.includes("claude-3-opus")) {
      return "reasoning";
    }
    if (lower.includes("fast") || lower.includes("tiny") || lower.includes("small")) {
      return "fast";
    }
    return "default";
  }

  private inferCapabilitiesFromModelName(modelId: string): string[] {
    const capabilities: string[] = ["streaming"];
    const lower = modelId.toLowerCase();

    if (lower.includes("vision") || lower.includes("llava") || lower.includes("clip") || lower.includes("4v")) {
      capabilities.push("vision");
    }
    if (lower.includes("tool") || lower.includes("function")) {
      capabilities.push("tool-calling");
    }
    if (lower.includes("json") || lower.includes("gpt-4")) {
      capabilities.push("json_mode");
    }

    return capabilities;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}

/**
 * Create a ModelDiscovery instance
 */
export function createModelDiscovery(): ModelDiscovery {
  return new ModelDiscovery();
}
