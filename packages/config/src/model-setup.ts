// ============================================================================
// Enhancement — Model Endpoint UI / CLI
// ============================================================================
// Interactive model pairing with test and database persistence
// For human use in CLI, or programmatic use by agents

import type { ConfigManager, ModelEndpoint, EndpointTestState } from "./config-manager.js";
import type { EndpointProvider } from "./index.js";
import type { ModelPurpose } from "@enhancement/types";
import {
  ModelDiscovery,
  type DiscoveredProvider,
  type DiscoveredModel,
} from "./discovery.js";

export interface EndpointTemplate {
  name: string;
  providerId: EndpointProvider;
  baseUrl: string;
  modelId: string;
  purpose: ModelPurpose;
  capabilities: string[];
  testPrompt?: string;
}

// Pre-configured templates for common providers
export const ENDPOINT_TEMPLATES: Record<string, EndpointTemplate> = {
  "ollama-llama3": {
    name: "Llama 3.1 (Local Ollama)",
    providerId: "ollama",
    baseUrl: "http://localhost:11434",
    modelId: "llama3.1",
    purpose: "default",
    capabilities: ["streaming"],
    testPrompt: "Say hello in one word.",
  },
  "ollama-vision": {
    name: "Llava/Llama-Vision (Local Ollama)",
    providerId: "ollama",
    baseUrl: "http://localhost:11434",
    modelId: "llava",
    purpose: "vision",
    capabilities: ["streaming", "vision"],
    testPrompt: "Describe this test image briefly.",
  },
  "lmstudio-glm-ocr": {
    name: "GLM OCR (LM Studio)",
    providerId: "lmstudio",
    baseUrl: "http://localhost:1234",
    modelId: "glm-ocr",
    purpose: "ocr",
    capabilities: ["vision"],
    testPrompt: "Extract text from this image.",
  },
  "lmstudio-general": {
    name: "LM Studio Loaded Model",
    providerId: "lmstudio",
    baseUrl: "http://localhost:1234",
    modelId: "local-model",
    purpose: "default",
    capabilities: ["streaming"],
    testPrompt: "Say hello in one word.",
  },
  "openai-gpt4": {
    name: "GPT-4 (OpenAI)",
    providerId: "openai",
    baseUrl: "https://api.openai.com/v1",
    modelId: "gpt-4",
    purpose: "reasoning",
    capabilities: ["streaming", "vision", "json_mode"],
    testPrompt: "Say hello in one word.",
  },
  "openai-gpt4-turbo": {
    name: "GPT-4 Turbo (OpenAI)",
    providerId: "openai",
    baseUrl: "https://api.openai.com/v1",
    modelId: "gpt-4-turbo",
    purpose: "default",
    capabilities: ["streaming", "vision", "json_mode"],
    testPrompt: "Say hello in one word.",
  },
  "anthropic-claude": {
    name: "Claude (Anthropic)",
    providerId: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    modelId: "claude-3-sonnet-20240229",
    purpose: "reasoning",
    capabilities: ["streaming", "vision"],
    testPrompt: "Say hello in one word.",
  },
};

export interface EndpointSetupResult {
  endpoint: ModelEndpoint;
  testResult: EndpointTestState;
  success: boolean;
}

/**
 * Model Endpoint Setup UI / API
 * 
 * Handles the pairing flow:
 * 1. Select provider (Ollama, LM Studio, OpenAI, etc.)
 * 2. Enter connection details (URL, API key if needed)
 * 3. Test connection
 * 4. Save to database with test state
 */
export class ModelEndpointSetup {
  constructor(private config: ConfigManager) {}

  /**
   * Set up endpoint from a template
   * 
   * Example for human CLI:
   * ```typescript
   * const result = await setup.fromTemplate(workspaceId, "ollama-llama3", {
   *   baseUrl: "http://localhost:11434",
   * });
   * 
   * if (result.success) {
   *   console.log(`✓ ${result.endpoint.name} is ready`);
   * }
   * ```
   */
  async fromTemplate(
    workspaceId: string,
    templateId: string,
    overrides: Partial<ModelEndpoint> = {},
    customTestFn?: (endpoint: ModelEndpoint) => Promise<boolean>
  ): Promise<EndpointSetupResult> {
    const template = ENDPOINT_TEMPLATES[templateId];
    if (!template) {
      throw new Error(`Unknown template: ${templateId}`);
    }

    const endpoint: ModelEndpoint = {
      id: `${template.providerId}-${Date.now()}`,
      name: overrides.name || template.name,
      providerId: template.providerId,
      baseUrl: overrides.baseUrl || template.baseUrl,
      modelId: overrides.modelId || template.modelId,
      purpose: template.purpose,
      capabilities: template.capabilities,
      apiKey: overrides.apiKey,
    };

    return this.setupEndpoint(workspaceId, endpoint, customTestFn);
  }

  /**
   * Set up endpoint from manual configuration
   */
  async fromManualConfig(
    workspaceId: string,
    config: {
      name: string;
      providerId: EndpointProvider;
      baseUrl: string;
      modelId: string;
      purpose: ModelPurpose;
      capabilities?: string[];
      apiKey?: string;
    },
    customTestFn?: (endpoint: ModelEndpoint) => Promise<boolean>
  ): Promise<EndpointSetupResult> {
    const endpoint: ModelEndpoint = {
      id: `${config.providerId}-${Date.now()}`,
      name: config.name,
      providerId: config.providerId,
      baseUrl: config.baseUrl,
      modelId: config.modelId,
      purpose: config.purpose,
      capabilities: config.capabilities || [],
      apiKey: config.apiKey,
    };

    return this.setupEndpoint(workspaceId, endpoint, customTestFn);
  }

  /**
   * Interactive endpoint setup (for CLI)
   * 
   * Prompts user for all required fields, tests connection,
   * and saves to database.
   */
  async interactiveSetup(
    workspaceId: string,
    providerId: EndpointProvider,
    testFunctions: Record<EndpointProvider, (endpoint: ModelEndpoint) => Promise<boolean>>
  ): Promise<EndpointSetupResult> {
    // This would integrate with a CLI library like inquirer or prompts
    // For now, we'll return a placeholder that explains the expected flow
    throw new Error(
      "Interactive setup requires a CLI library. " +
      "Use fromTemplate() or fromManualConfig() for programmatic setup."
    );
  }

  /**
   * Re-test an existing endpoint
   */
  async retestEndpoint(
    workspaceId: string,
    endpointId: string,
    testFn: (endpoint: ModelEndpoint) => Promise<boolean>
  ): Promise<EndpointTestState> {
    return this.config.testModelEndpoint(workspaceId, endpointId, testFn);
  }

  /**
   * Get all endpoints with their test status for display
   */
  async getEndpointsWithStatus(workspaceId: string): Promise<
    Array<{
      endpoint: ModelEndpoint;
      testState: EndpointTestState | null;
      isReady: boolean;
    }>
  > {
    const endpoints = await this.config.getModelEndpoints(workspaceId);
    const results = [];

    for (const endpoint of endpoints) {
      const testState = await this.config.getEndpointTestState(workspaceId, endpoint.id);
      results.push({
        endpoint,
        testState,
        isReady: testState?.status === "success",
      });
    }

    return results;
  }

  /**
   * Get summary of available models by purpose
   */
  async getPurposeSummary(workspaceId: string): Promise<
    Record<ModelPurpose, { available: number; tested: number; recommended?: string }>
  > {
    const purposes: ModelPurpose[] = [
      "default",
      "reasoning",
      "fast",
      "embedding",
      "ocr",
      "vision",
      "audio",
    ];

    const summary = {} as Record<
      ModelPurpose,
      { available: number; tested: number; recommended?: string }
    >;

    for (const purpose of purposes) {
      const endpoints = await this.config.getModelEndpoints(workspaceId, purpose);
      const tested = await this.config.getReadyModelEndpoints(workspaceId);
      const testedForPurpose = tested.filter((ep) => ep.purpose === purpose);

      let recommended: string | undefined;
      if (testedForPurpose.length > 0) {
        // Prefer local providers
        const local = testedForPurpose.find((ep) =>
          ["ollama", "lmstudio"].includes(ep.providerId)
        );
        recommended = (local || testedForPurpose[0]).name;
      }

      summary[purpose] = {
        available: endpoints.length,
        tested: testedForPurpose.length,
        recommended,
      };
    }

    return summary;
  }

  /**
   * Get available templates
   */
  getAvailableTemplates(): Array<{ id: string; template: EndpointTemplate }> {
    return Object.entries(ENDPOINT_TEMPLATES).map(([id, template]) => ({
      id,
      template,
    }));
  }

  /**
   * Get templates filtered by purpose
   */
  getTemplatesByPurpose(purpose: ModelPurpose): Array<{ id: string; template: EndpointTemplate }> {
    return Object.entries(ENDPOINT_TEMPLATES)
      .filter(([, template]) => template.purpose === purpose)
      .map(([id, template]) => ({ id, template }));
  }

  /**
   * Discover running local providers
   *
   * Scans for Ollama (port 11434), LM Studio (port 1234), etc.
   * Returns providers that are currently running and reachable.
   *
   * Example:
   * ```typescript
   * const discovery = await setup.discoverLocalProviders();
   * for (const provider of discovery.providers) {
   *   if (provider.isReachable) {
   *     console.log(`Found ${provider.providerId} at ${provider.baseUrl}`);
   *     console.log(`Models: ${provider.models.map(m => m.id).join(', ')}`);
   *   }
   * }
   * ```
   */
  async discoverLocalProviders(options?: {
    timeoutMs?: number;
    fetchModels?: boolean;
  }): Promise<{
    providers: DiscoveredProvider[];
    totalFound: number;
    reachableCount: number;
    scanDurationMs: number;
  }> {
    const discovery = new ModelDiscovery();
    return discovery.scanLocal(options);
  }

  /**
   * Quick check if Ollama is running locally
   */
  async isOllamaRunning(baseUrl?: string): Promise<boolean> {
    const discovery = new ModelDiscovery();
    return discovery.isOllamaRunning(baseUrl);
  }

  /**
   * Quick check if LM Studio is running locally
   */
  async isLmStudioRunning(baseUrl?: string): Promise<boolean> {
    const discovery = new ModelDiscovery();
    return discovery.isLmStudioRunning(baseUrl);
  }

  /**
   * Auto-configure from discovered providers
   *
   * Discovers running local providers and automatically configures
   * endpoints for each discovered model.
   *
   * Example:
   * ```typescript
   * // Auto-discover and configure all local models
   * const result = await setup.autoConfigureFromDiscovery(workspaceId);
   * console.log(`Configured ${result.length} endpoints`);
   * ```
   */
  async autoConfigureFromDiscovery(
    workspaceId: string,
    options?: {
      timeoutMs?: number;
      testEach?: boolean;
      testFn?: (endpoint: ModelEndpoint) => Promise<boolean>;
    }
  ): Promise<EndpointSetupResult[]> {
    const discovery = new ModelDiscovery();
    const scanResult = await discovery.scanLocal({
      timeoutMs: options?.timeoutMs,
      fetchModels: true,
    });

    const results: EndpointSetupResult[] = [];

    for (const provider of scanResult.providers) {
      if (!provider.isReachable) continue;

      for (const model of provider.models) {
        // Skip if we already have an endpoint for this provider+model
        const existing = await this.config.getModelEndpoints(workspaceId);
        const alreadyExists = existing.some(
          (ep) => ep.providerId === provider.providerId && ep.modelId === model.id
        );
        if (alreadyExists) continue;

        const endpoint: ModelEndpoint = {
          id: `${provider.providerId}-${model.id}-${Date.now()}`,
          name: model.name,
          providerId: provider.providerId,
          baseUrl: provider.baseUrl,
          modelId: model.id,
          purpose: model.purpose || "default",
          capabilities: model.capabilities || ["streaming"],
        };

        const result = await this.setupEndpoint(
          workspaceId,
          endpoint,
          options?.testEach ? options.testFn : undefined
        );
        results.push(result);
      }
    }

    return results;
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private async setupEndpoint(
    workspaceId: string,
    endpoint: ModelEndpoint,
    customTestFn?: (endpoint: ModelEndpoint) => Promise<boolean>
  ): Promise<EndpointSetupResult> {
    // Save endpoint first (without testing)
    await this.config.setModelEndpoint(workspaceId, endpoint);

    // Run test if provided
    let testResult: EndpointTestState;
    if (customTestFn) {
      testResult = await this.config.testModelEndpoint(
        workspaceId,
        endpoint.id,
        customTestFn
      );
    } else {
      // Use default test based on provider
      testResult = await this.config.testModelEndpoint(
        workspaceId,
        endpoint.id,
        (ep) => this.defaultTest(ep)
      );
    }

    return {
      endpoint,
      testResult,
      success: testResult.status === "success",
    };
  }

  private async defaultTest(endpoint: ModelEndpoint): Promise<boolean> {
    // Default test just checks if the URL is reachable
    // Real implementations would do an actual model inference test
    const baseUrl = endpoint.baseUrl;
    if (!baseUrl) {
      return false;
    }
    try {
      const response = await fetch(baseUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok || response.status === 404; // 404 means server is up but endpoint doesn't exist
    } catch {
      // If HEAD fails, try a simple GET (some servers don't support HEAD)
      try {
        const response = await fetch(baseUrl, {
          signal: AbortSignal.timeout(5000),
        });
        return true; // Any response means server is up
      } catch {
        return false;
      }
    }
  }
}

/**
 * Create a ModelEndpointSetup instance
 */
export function createModelEndpointSetup(config: ConfigManager): ModelEndpointSetup {
  return new ModelEndpointSetup(config);
}
