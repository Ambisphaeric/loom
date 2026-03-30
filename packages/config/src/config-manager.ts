// ============================================================================
// Enhancement — Configuration Management (Vercel AI SDK Bridge)
// ============================================================================
// Manages workspace and global configuration with model endpoint testing
// Outputs provider:model IDs compatible with Vercel AI SDK

import { z } from "zod";
import type { ModelPurpose, WorkspaceConfig, GlobalConfig } from "@enhancement/types";

// ============================================================================
// Types
// ============================================================================

export type EndpointProvider =
  | "ollama"
  | "lmstudio"
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "cohere"
  | "azure"
  | "custom";

export type TestStatus = "untested" | "success" | "failed";

/**
 * Model Endpoint configuration
 * Stores settings for Vercel AI SDK provider initialization
 */
export interface ModelEndpoint {
  id: string;
  /** Display name for UI */
  name: string;
  /** Vercel AI SDK provider ID (e.g., "ollama", "openai") */
  providerId: EndpointProvider;
  /** Model ID within that provider (e.g., "llama3.1", "gpt-4") */
  modelId: string;
  /** Base URL for local providers (Ollama, LM Studio) */
  baseUrl?: string;
  /** API key for cloud providers */
  apiKey?: string;
  /** Additional provider options (headers, etc.) */
  extraHeaders?: Record<string, string>;
  /** Purpose this endpoint serves */
  purpose: ModelPurpose;
  /** Capabilities: streaming, vision, tool-calling, etc. */
  capabilities: string[];
}

export interface EndpointTestState {
  endpointId: string;
  lastTestedAt?: number;
  status: TestStatus;
  errorMessage?: string;
  latencyMs?: number;
}

export interface TestResult {
  success: boolean;
  latencyMs?: number;
  errorMessage?: string;
}

export interface ConfigManagerOptions {
  dataDir?: string;
}

/**
 * Resolved model reference for Vercel AI SDK
 * Use with: registry.languageModel(`${providerId}:${modelId}`)
 */
export interface ResolvedModel {
  /** Full ID for registry lookup: "providerId:modelId" */
  registryId: string;
  providerId: string;
  modelId: string;
  endpoint: ModelEndpoint;
  testState: EndpointTestState | null;
}

// ============================================================================
// Zod Schemas
// ============================================================================

const endpointProviderSchema = z.enum([
  "ollama",
  "lmstudio",
  "openai",
  "anthropic",
  "google",
  "mistral",
  "cohere",
  "azure",
  "custom",
]);

const modelEndpointSchema = z.object({
  id: z.string(),
  name: z.string(),
  providerId: endpointProviderSchema,
  modelId: z.string(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  extraHeaders: z.record(z.string()).optional(),
  purpose: z.string(),
  capabilities: z.array(z.string()),
});

// ============================================================================
// In-Memory Store
// ============================================================================

interface ConfigStore {
  global: GlobalConfig;
  workspaces: Map<string, WorkspaceData>;
}

interface WorkspaceData {
  id: string;
  name: string;
  config: WorkspaceConfig;
  endpoints: Map<string, ModelEndpoint>;
  testStates: Map<string, EndpointTestState>;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Config Manager
// ============================================================================

export class ConfigManager {
  private dataDir: string;
  private store: ConfigStore;
  private initialized = false;

  constructor(options: ConfigManagerOptions = {}) {
    this.dataDir = options.dataDir?.replace(/^~/, process.env.HOME || "~") ||
      `${process.env.HOME}/.enhancement`;

    this.store = {
      global: this.getDefaultGlobalConfig(),
      workspaces: new Map(),
    };
  }

  async initialize(): Promise<void> {
    await this.ensureDir(this.dataDir);
    await this.loadFromDisk();
    this.initialized = true;
  }

  close(): void {
    this.persistToDisk().catch(console.error);
  }

  // ========================================================================
  // Global Config
  // ========================================================================

  async getGlobalConfig(): Promise<GlobalConfig> {
    this.checkInitialized();
    return { ...this.store.global };
  }

  async updateGlobalConfig(updates: Partial<GlobalConfig>): Promise<GlobalConfig> {
    this.checkInitialized();
    this.store.global = { ...this.store.global, ...updates };
    await this.persistToDisk();
    return { ...this.store.global };
  }

  // ========================================================================
  // Workspace Management
  // ========================================================================

  async createWorkspace(
    id: string,
    name: string,
    config: Partial<WorkspaceConfig> = {}
  ): Promise<WorkspaceConfig> {
    this.checkInitialized();

    const now = Date.now();
    const fullConfig: WorkspaceConfig = {
      name,
      version: "1.0.0",
      schema_version: 1,
      description: config.description || "",
      model: config.model || { default: "" },
      pipeline: config.pipeline || {
        sources: [],
        fetchers: [],
        transforms: [],
        store: "default",
        tools: [],
      },
      behaviors: config.behaviors || {
        proactive_suggestions: false,
        proactive_fetch: false,
        suggestion_interval: "5m",
        suggestion_min_confidence: 0.7,
        auto_actions: false,
        change_detection: true,
        max_concurrent_fetches: 3,
      },
    };

    const workspaceData: WorkspaceData = {
      id,
      name,
      config: fullConfig,
      endpoints: new Map(),
      testStates: new Map(),
      createdAt: now,
      updatedAt: now,
    };

    this.store.workspaces.set(id, workspaceData);
    await this.persistToDisk();

    return fullConfig;
  }

  async getWorkspaceConfig(id: string): Promise<WorkspaceConfig | null> {
    this.checkInitialized();
    const workspace = this.store.workspaces.get(id);
    return workspace ? { ...workspace.config } : null;
  }

  async saveWorkspaceConfig(id: string, config: WorkspaceConfig): Promise<void> {
    this.checkInitialized();
    const workspace = this.store.workspaces.get(id);
    if (!workspace) {
      throw new Error(`Workspace ${id} not found`);
    }

    workspace.config = config;
    workspace.name = config.name;
    workspace.updatedAt = Date.now();
    await this.persistToDisk();
  }

  async listWorkspaces(): Promise<Array<{ id: string; name: string }>> {
    this.checkInitialized();
    return Array.from(this.store.workspaces.values()).map((w) => ({
      id: w.id,
      name: w.name,
    }));
  }

  // ========================================================================
  // Model Endpoint Management
  // ========================================================================

  async setModelEndpoint(
    workspaceId: string,
    endpoint: ModelEndpoint
  ): Promise<void> {
    this.checkInitialized();
    modelEndpointSchema.parse(endpoint);

    const workspace = this.store.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    workspace.endpoints.set(endpoint.id, endpoint);
    workspace.updatedAt = Date.now();

    if (!workspace.testStates.has(endpoint.id)) {
      workspace.testStates.set(endpoint.id, {
        endpointId: endpoint.id,
        status: "untested",
      });
    }

    await this.persistToDisk();
  }

  async getModelEndpoint(
    workspaceId: string,
    endpointId: string
  ): Promise<ModelEndpoint | null> {
    this.checkInitialized();
    const workspace = this.store.workspaces.get(workspaceId);
    if (!workspace) return null;

    const endpoint = workspace.endpoints.get(endpointId);
    return endpoint ? { ...endpoint } : null;
  }

  async getModelEndpoints(
    workspaceId: string,
    purpose?: ModelPurpose
  ): Promise<ModelEndpoint[]> {
    this.checkInitialized();
    const workspace = this.store.workspaces.get(workspaceId);
    if (!workspace) return [];

    let endpoints = Array.from(workspace.endpoints.values());

    if (purpose) {
      endpoints = endpoints.filter((ep) => ep.purpose === purpose);
    }

    return endpoints;
  }

  async deleteModelEndpoint(
    workspaceId: string,
    endpointId: string
  ): Promise<void> {
    this.checkInitialized();
    const workspace = this.store.workspaces.get(workspaceId);
    if (!workspace) return;

    workspace.endpoints.delete(endpointId);
    workspace.testStates.delete(endpointId);
    workspace.updatedAt = Date.now();
    await this.persistToDisk();
  }

  // ========================================================================
  // Endpoint Testing
  // ========================================================================

  async testModelEndpoint(
    workspaceId: string,
    endpointId: string,
    testFn: (endpoint: ModelEndpoint) => Promise<boolean>
  ): Promise<EndpointTestState> {
    this.checkInitialized();

    const endpoint = await this.getModelEndpoint(workspaceId, endpointId);
    if (!endpoint) {
      throw new Error(`Endpoint ${endpointId} not found`);
    }

    const startTime = Date.now();
    let result: TestResult;

    try {
      const success = await testFn(endpoint);
      result = {
        success,
        latencyMs: Date.now() - startTime,
        errorMessage: success ? undefined : "Test function returned false",
      };
    } catch (error) {
      result = {
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      };
    }

    const testState: EndpointTestState = {
      endpointId,
      lastTestedAt: Date.now(),
      status: result.success ? "success" : "failed",
      errorMessage: result.errorMessage,
      latencyMs: result.latencyMs,
    };

    const workspace = this.store.workspaces.get(workspaceId);
    if (workspace) {
      workspace.testStates.set(endpointId, testState);
      workspace.updatedAt = Date.now();
      await this.persistToDisk();
    }

    return testState;
  }

  async getEndpointTestState(
    workspaceId: string,
    endpointId: string
  ): Promise<EndpointTestState | null> {
    this.checkInitialized();
    const workspace = this.store.workspaces.get(workspaceId);
    if (!workspace) return null;

    const state = workspace.testStates.get(endpointId);
    return state ? { ...state } : null;
  }

  async getReadyModelEndpoints(workspaceId: string): Promise<ModelEndpoint[]> {
    this.checkInitialized();
    const allEndpoints = await this.getModelEndpoints(workspaceId);
    const ready: ModelEndpoint[] = [];

    for (const endpoint of allEndpoints) {
      const testState = await this.getEndpointTestState(workspaceId, endpoint.id);
      if (testState?.status === "success") {
        ready.push(endpoint);
      }
    }

    return ready;
  }

  // ========================================================================
  // Vercel AI SDK Integration
  // ========================================================================

  /**
   * Resolve model endpoint to Vercel AI SDK registry ID
   * Returns format: "providerId:modelId" for use with registry.languageModel()
   * 
   * Example:
   * ```typescript
   * const resolved = await config.resolveModel(workspace, "ocr");
   * if (resolved) {
   *   const model = registry.languageModel(resolved.registryId);
   *   const { text } = await generateText({ model, prompt: "Extract text" });
   * }
   * ```
   */
  async resolveModel(
    workspaceId: string,
    purpose: ModelPurpose,
    options: { requireTested?: boolean; preferLocal?: boolean } = {}
  ): Promise<ResolvedModel | null> {
    this.checkInitialized();
    const endpoints = await this.getModelEndpoints(workspaceId, purpose);

    if (endpoints.length === 0) return null;

    let candidates = endpoints;
    if (options.requireTested) {
      const testedIds = new Set<string>();
      for (const ep of endpoints) {
        const testState = await this.getEndpointTestState(workspaceId, ep.id);
        if (testState?.status === "success") {
          testedIds.add(ep.id);
        }
      }
      candidates = endpoints.filter((ep) => testedIds.has(ep.id));
    }

    if (candidates.length === 0) return null;

    if (options.preferLocal) {
      const localProviders = ["ollama", "lmstudio"];
      const localFirst = [
        ...candidates.filter((ep) => localProviders.includes(ep.providerId)),
        ...candidates.filter((ep) => !localProviders.includes(ep.providerId)),
      ];
      candidates = localFirst;
    }

    const endpoint = candidates[0];
    const testState = await this.getEndpointTestState(workspaceId, endpoint.id);

    return {
      registryId: `${endpoint.providerId}:${endpoint.modelId}`,
      providerId: endpoint.providerId,
      modelId: endpoint.modelId,
      endpoint,
      testState,
    };
  }

  /**
   * Get all available models formatted for Vercel AI SDK provider registry
   * 
   * Use this to initialize createProviderRegistry() with dynamic configuration
   * 
   * Example:
   * ```typescript
   * const providers = await config.getProviderConfigs(workspace);
   * const registry = createProviderRegistry(providers);
   * ```
   */
  async getProviderConfigs(
    workspaceId: string
  ): Promise<Record<string, ProviderConfig>> {
    this.checkInitialized();
    const endpoints = await this.getModelEndpoints(workspaceId);
    const configs: Record<string, ProviderConfig> = {};

    for (const endpoint of endpoints) {
      // Group by providerId
      if (!configs[endpoint.providerId]) {
        configs[endpoint.providerId] = {
          baseUrl: endpoint.baseUrl,
          apiKey: endpoint.apiKey,
          extraHeaders: endpoint.extraHeaders,
          models: {},
        };
      }

      configs[endpoint.providerId].models[endpoint.modelId] = {
        id: endpoint.id,
        purpose: endpoint.purpose,
        capabilities: endpoint.capabilities,
      };
    }

    return configs;
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private checkInitialized(): void {
    if (!this.initialized) {
      throw new Error("ConfigManager not initialized. Call initialize() first.");
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    try {
      await import("node:fs/promises").then((fs) =>
        fs.mkdir(dir, { recursive: true })
      );
    } catch {
      // Directory may already exist
    }
  }

  private getDefaultGlobalConfig(): GlobalConfig {
    return {
      apiKeys: {},
      defaultModel: "",
      dataDir: this.dataDir,
      privacy: {
        telemetry: false,
        retentionDays: 30,
      },
    };
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const fs = await import("node:fs/promises");
      const path = `${this.dataDir}/config.json`;

      try {
        const data = await fs.readFile(path, "utf-8");
        const parsed = JSON.parse(data);

        if (parsed.global) {
          this.store.global = { ...this.store.global, ...parsed.global };
        }

        if (parsed.workspaces) {
          for (const [id, data] of Object.entries(parsed.workspaces)) {
            const workspaceData: WorkspaceData = {
              id,
              name: (data as { name: string }).name,
              config: (data as { config: WorkspaceConfig }).config,
              endpoints: new Map(
                Object.entries((data as { endpoints: Record<string, ModelEndpoint> }).endpoints || {})
              ),
              testStates: new Map(
                Object.entries((data as { testStates: Record<string, EndpointTestState> }).testStates || {})
              ),
              createdAt: (data as { createdAt: number }).createdAt,
              updatedAt: (data as { updatedAt: number }).updatedAt,
            };
            this.store.workspaces.set(id, workspaceData);
          }
        }
      } catch {
        // File doesn't exist or is invalid
      }
    } catch {
      // FS not available
    }
  }

  private async persistToDisk(): Promise<void> {
    try {
      const fs = await import("node:fs/promises");
      const path = `${this.dataDir}/config.json`;

      const workspaces: Record<string, unknown> = {};
      for (const [id, data] of this.store.workspaces.entries()) {
        workspaces[id] = {
          id: data.id,
          name: data.name,
          config: data.config,
          endpoints: Object.fromEntries(data.endpoints),
          testStates: Object.fromEntries(data.testStates),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      }

      const data = {
        global: this.store.global,
        workspaces,
      };

      await fs.writeFile(path, JSON.stringify(data, null, 2));
    } catch {
      // FS not available
    }
  }
}

// ============================================================================
// Provider Config Types
// ============================================================================

export interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
  models: Record<string, ModelMetadata>;
}

export interface ModelMetadata {
  id: string;
  purpose: ModelPurpose;
  capabilities: string[];
}

// ============================================================================
// Factory Function
// ============================================================================

export function createConfigManager(
  options: ConfigManagerOptions = {}
): ConfigManager {
  return new ConfigManager(options);
}
