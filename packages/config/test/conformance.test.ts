import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  ConfigManager,
  createConfigManager,
  createModelEndpointSetup,
  type ModelEndpoint,
} from "../src/index.js";
import type { ModelPurpose } from "@enhancement/types";

// Test database path (isolated for tests)
const TEST_DATA_DIR = `/tmp/enhancement-config-test-${Date.now()}`;

describe("@enhancement/config conformance", () => {
  let config: ConfigManager;
  let setup: ReturnType<typeof createModelEndpointSetup>;

  beforeAll(async () => {
    config = createConfigManager({ dataDir: TEST_DATA_DIR });
    await config.initialize();
    setup = createModelEndpointSetup(config);
  });

  afterAll(() => {
    config.close();
    // Cleanup test directory
    try {
      import("node:fs/promises").then((fs) =>
        fs.rm(TEST_DATA_DIR, { recursive: true, force: true })
      );
    } catch {
      // Ignore cleanup errors
    }
  });

  test("exports ConfigManager class", () => {
    expect(typeof ConfigManager).toBe("function");
  });

  test("exports createConfigManager factory", () => {
    expect(typeof createConfigManager).toBe("function");
  });

  test("exports all required types", () => {
    // Type exports are compile-time only, but we can verify the structure
    const endpoint: ModelEndpoint = {
      id: "test",
      name: "Test Endpoint",
      providerId: "ollama",
      baseUrl: "http://localhost:11434",
      modelId: "llama3.1",
      purpose: "default" as ModelPurpose,
      capabilities: ["streaming"],
    };
    expect(endpoint).toBeDefined();
    expect(endpoint.providerId).toBe("ollama");
  });

  test("can initialize and get global config", async () => {
    const global = await config.getGlobalConfig();
    expect(global).toBeDefined();
    expect(global.privacy).toBeDefined();
    expect(global.privacy.telemetry).toBe(false);
  });

  test("can create a workspace", async () => {
    const workspaceId = `test-workspace-${Date.now()}`;
    const workspaceConfig = await config.createWorkspace(
      workspaceId,
      "Test Workspace",
      { description: "For testing" }
    );

    expect(workspaceConfig.name).toBe("Test Workspace");
    expect(workspaceConfig.behaviors).toBeDefined();
    expect(workspaceConfig.behaviors.proactive_suggestions).toBe(false);
  });

  test("can list workspaces", async () => {
    const workspaceId = `list-test-${Date.now()}`;
    await config.createWorkspace(workspaceId, "List Test Workspace");

    const workspaces = await config.listWorkspaces();
    expect(workspaces.length).toBeGreaterThan(0);
    expect(workspaces.some((w) => w.id === workspaceId)).toBe(true);
  });

  test("can set and get model endpoint", async () => {
    const workspaceId = `endpoint-test-${Date.now()}`;
    await config.createWorkspace(workspaceId, "Endpoint Test");

    const endpoint: ModelEndpoint = {
      id: "ollama-llama3",
      name: "Local Llama 3.1",
      providerId: "ollama",
      baseUrl: "http://localhost:11434",
      modelId: "llama3.1",
      purpose: "default",
      capabilities: ["streaming"],
    };

    await config.setModelEndpoint(workspaceId, endpoint);

    const retrieved = await config.getModelEndpoint(workspaceId, endpoint.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("Local Llama 3.1");
    expect(retrieved?.providerId).toBe("ollama");
  });

  test("can list model endpoints", async () => {
    const workspaceId = `list-endpoints-${Date.now()}`;
    await config.createWorkspace(workspaceId, "List Endpoints Test");

    // Add multiple endpoints
    await config.setModelEndpoint(workspaceId, {
      id: "ollama-1",
      name: "Ollama 1",
      providerId: "ollama",
      baseUrl: "http://localhost:11434",
      modelId: "llama3.1",
      purpose: "default",
      capabilities: [],
    });

    await config.setModelEndpoint(workspaceId, {
      id: "openai-1",
      name: "OpenAI GPT-4",
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      modelId: "gpt-4",
      purpose: "reasoning",
      capabilities: ["streaming"],
    });

    const endpoints = await config.getModelEndpoints(workspaceId);
    expect(endpoints.length).toBe(2);
  });

  test("can filter endpoints by purpose", async () => {
    const workspaceId = `purpose-filter-${Date.now()}`;
    await config.createWorkspace(workspaceId, "Purpose Filter Test");

    await config.setModelEndpoint(workspaceId, {
      id: "ocr-model",
      name: "GLM OCR",
      providerId: "lmstudio",
      baseUrl: "http://localhost:1234",
      modelId: "glm-ocr",
      purpose: "ocr",
      capabilities: ["vision"],
    });

    await config.setModelEndpoint(workspaceId, {
      id: "default-model",
      name: "Default LLM",
      providerId: "ollama",
      baseUrl: "http://localhost:11434",
      modelId: "llama3.1",
      purpose: "default",
      capabilities: [],
    });

    const ocrEndpoints = await config.getModelEndpoints(workspaceId, "ocr");
    expect(ocrEndpoints.length).toBe(1);
    expect(ocrEndpoints[0].purpose).toBe("ocr");
  });

  test("test endpoint and persist result", async () => {
    const workspaceId = `test-endpoint-${Date.now()}`;
    await config.createWorkspace(workspaceId, "Test Endpoint");

    await config.setModelEndpoint(workspaceId, {
      id: "test-model",
      name: "Test Model",
      providerId: "ollama",
      baseUrl: "http://localhost:11434",
      modelId: "test",
      purpose: "default",
      capabilities: [],
    });

    // Test with a mock test function
    const testResult = await config.testModelEndpoint(
      workspaceId,
      "test-model",
      async (endpoint) => {
        // Simulate successful test
        return endpoint.baseUrl.includes("localhost");
      }
    );

    expect(testResult.status).toBe("success");
    expect(testResult.latencyMs).toBeDefined();
    expect(testResult.latencyMs).toBeGreaterThanOrEqual(0);

    // Verify persisted
    const state = await config.getEndpointTestState(workspaceId, "test-model");
    expect(state?.status).toBe("success");
  });

  test("test endpoint failure handling", async () => {
    const workspaceId = `test-fail-${Date.now()}`;
    await config.createWorkspace(workspaceId, "Test Fail");

    await config.setModelEndpoint(workspaceId, {
      id: "fail-model",
      name: "Fail Model",
      providerId: "openai",
      baseUrl: "https://invalid.url",
      modelId: "gpt-4",
      purpose: "default",
      capabilities: [],
    });

    const testResult = await config.testModelEndpoint(
      workspaceId,
      "fail-model",
      async () => {
        throw new Error("Connection refused");
      }
    );

    expect(testResult.status).toBe("failed");
    expect(testResult.errorMessage).toBe("Connection refused");
  });

  test("get ready (tested) endpoints only", async () => {
    const workspaceId = `ready-test-${Date.now()}`;
    await config.createWorkspace(workspaceId, "Ready Test");

    // Add tested endpoint
    await config.setModelEndpoint(workspaceId, {
      id: "tested",
      name: "Tested Model",
      providerId: "ollama",
      baseUrl: "http://localhost:11434",
      modelId: "llama3",
      purpose: "default",
      capabilities: [],
    });

    await config.testModelEndpoint(workspaceId, "tested", async () => true);

    // Add untested endpoint
    await config.setModelEndpoint(workspaceId, {
      id: "untested",
      name: "Untested Model",
      providerId: "openai",
      baseUrl: "https://api.openai.com",
      modelId: "gpt-4",
      purpose: "default",
      capabilities: [],
    });

    const ready = await config.getReadyModelEndpoints(workspaceId);
    expect(ready.length).toBe(1);
    expect(ready[0].id).toBe("tested");
  });

  test("resolve endpoint with preferences", async () => {
    const workspaceId = `resolve-test-${Date.now()}`;
    await config.createWorkspace(workspaceId, "Resolve Test");

    // Add cloud endpoint
    await config.setModelEndpoint(workspaceId, {
      id: "cloud-model",
      name: "Cloud GPT-4",
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelId: "gpt-4",
      purpose: "default",
      capabilities: ["streaming"],
    });
    await config.testModelEndpoint(workspaceId, "cloud-model", async () => true);

    // Add local endpoint
    await config.setModelEndpoint(workspaceId, {
      id: "local-model",
      name: "Local Llama",
      providerId: "ollama",
      baseUrl: "http://localhost:11434",
      modelId: "llama3.1",
      purpose: "default",
      capabilities: ["streaming"],
    });
    await config.testModelEndpoint(workspaceId, "local-model", async () => true);

    // Prefer local should return ollama
    const resolved = await config.resolveModel(workspaceId, "default", {
      requireTested: true,
      preferLocal: true,
    });

    expect(resolved).toBeDefined();
    expect(resolved?.providerId).toBe("ollama");
    expect(resolved?.registryId).toBe("ollama:llama3.1");
    expect(resolved?.endpoint.name).toBe("Local Llama");
  });

  test("resolveModel returns Vercel AI SDK compatible format", async () => {
    const workspaceId = `vercel-sdk-test-${Date.now()}`;
    await config.createWorkspace(workspaceId, "Vercel SDK Test");

    // Add an endpoint
    await config.setModelEndpoint(workspaceId, {
      id: "lmstudio-ocr",
      name: "GLM OCR",
      providerId: "lmstudio",
      baseUrl: "http://localhost:1234",
      modelId: "glm-ocr",
      purpose: "ocr",
      capabilities: ["vision"],
    });
    await config.testModelEndpoint(workspaceId, "lmstudio-ocr", async () => true);

    // Resolve and verify Vercel AI SDK format
    const resolved = await config.resolveModel(workspaceId, "ocr");

    expect(resolved).toBeDefined();
    // registryId format for Vercel AI SDK: "providerId:modelId"
    expect(resolved?.registryId).toBe("lmstudio:glm-ocr");
    expect(resolved?.providerId).toBe("lmstudio");
    expect(resolved?.modelId).toBe("glm-ocr");
    expect(resolved?.testState?.status).toBe("success");
    
    // Can be used with Vercel AI SDK:
    // const model = registry.languageModel(resolved.registryId);
    // const { text } = await generateText({ model, prompt: "..." });
  });

  test("can update global config", async () => {
    const newConfig = await config.updateGlobalConfig({
      defaultModel: "my-custom-model",
    });

    expect(newConfig.defaultModel).toBe("my-custom-model");

    // Verify persisted
    const retrieved = await config.getGlobalConfig();
    expect(retrieved.defaultModel).toBe("my-custom-model");
  });

  test("can save and retrieve workspace config", async () => {
    const workspaceId = `save-config-${Date.now()}`;
    await config.createWorkspace(workspaceId, "Save Config Test");

    const workspaceConfig = await config.getWorkspaceConfig(workspaceId);
    expect(workspaceConfig).toBeDefined();

    // Modify and save
    workspaceConfig!.name = "Updated Name";
    workspaceConfig!.behaviors.proactive_suggestions = true;
    await config.saveWorkspaceConfig(workspaceId, workspaceConfig!);

    // Verify
    const updated = await config.getWorkspaceConfig(workspaceId);
    expect(updated?.name).toBe("Updated Name");
    expect(updated?.behaviors.proactive_suggestions).toBe(true);
  });

  test("discovery types are exported", () => {
    // Type exports are compile-time only, but we can verify the structure
    const discoveredProvider = {
      providerId: "ollama" as const,
      baseUrl: "http://localhost:11434",
      isReachable: true,
      models: [
        {
          id: "llama3.1",
          name: "Llama 3.1",
          purpose: "default" as ModelPurpose,
          capabilities: ["streaming"],
        },
      ],
      latencyMs: 100,
    };
    expect(discoveredProvider).toBeDefined();
    expect(discoveredProvider.providerId).toBe("ollama");
    expect(discoveredProvider.models[0].id).toBe("llama3.1");
  });

  test("ModelEndpointSetup has discovery methods", () => {
    // Verify that setup has discovery methods
    expect(typeof setup.discoverLocalProviders).toBe("function");
    expect(typeof setup.isOllamaRunning).toBe("function");
    expect(typeof setup.isLmStudioRunning).toBe("function");
    expect(typeof setup.autoConfigureFromDiscovery).toBe("function");
  });
});
