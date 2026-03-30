#!/usr/bin/env bun
// ============================================================================
// E2E Experiment: Model Endpoint Pairing
// ============================================================================
// Demonstrates the complete flow for configuring and testing LLM endpoints
// 
// This experiment shows:
// 1. Creating a workspace
// 2. Setting up multiple model endpoints (Ollama, LM Studio, OpenAI)
// 3. Testing each endpoint
// 4. Persisting test results
// 5. Resolving the best endpoint for a purpose
//
// Usage: bun e2e/model-pairing.ts
// ============================================================================

import {
  createConfigManager,
  createModelEndpointSetup,
  ENDPOINT_TEMPLATES,
  type ModelEndpoint,
} from "../packages/config/src/index.js";

const TEST_DATA_DIR = `/tmp/enhancement-model-pairing-test-${Date.now()}`;
const WORKSPACE_ID = `pairing-demo-${Date.now()}`;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(...args: unknown[]): void {
  console.log("[Model Pairing]", ...args);
}

async function mockTestProvider(endpoint: ModelEndpoint): Promise<boolean> {
  // Simulate a test request to the provider
  log(`Testing ${endpoint.name} at ${endpoint.baseUrl}...`);
  await delay(100 + Math.random() * 200); // Simulate network latency

  // Mock behavior based on provider
  switch (endpoint.providerId) {
    case "ollama":
      // Simulate local Ollama - usually works if running
      return endpoint.baseUrl?.includes("localhost") ?? false;
    case "lmstudio":
      // Simulate LM Studio - works if running on port 1234
      return endpoint.baseUrl?.includes("1234") ?? false;
    case "openai":
      // Simulate OpenAI - requires valid API key
      return endpoint.apiKey !== undefined && endpoint.apiKey.startsWith("sk-");
    case "anthropic":
      // Simulate Anthropic - requires API key
      return endpoint.apiKey !== undefined && endpoint.apiKey.length > 10;
    default:
      return true;
  }
}

async function runExperiment(): Promise<void> {
  log("=".repeat(60));
  log("Model Endpoint Pairing E2E Experiment");
  log("=".repeat(60));

  // Initialize config manager
  log("\n1. Initializing ConfigManager...");
  const config = createConfigManager({ dataDir: TEST_DATA_DIR });
  await config.initialize();
  log("   ✓ ConfigManager initialized");
  log(`   Data directory: ${TEST_DATA_DIR}`);

  // Create workspace
  log("\n2. Creating workspace...");
  await config.createWorkspace(WORKSPACE_ID, "Model Pairing Demo", {
    description: "Testing model endpoint configuration",
  });
  log(`   ✓ Workspace created: ${WORKSPACE_ID}`);

  // Initialize model setup UI/API
  const setup = createModelEndpointSetup(config);

  // Show available templates
  log("\n3. Available endpoint templates:");
  const templates = setup.getAvailableTemplates();
  for (const { id, template } of templates) {
    log(`   - ${id}: ${template.name} (${template.providerId})`);
  }

  // Set up endpoints from templates
  log("\n4. Setting up endpoints from templates...");

  // 4a. Ollama with Llama 3.1 (local, no API key)
  log("\n   4a. Configuring Ollama Llama 3.1...");
  const ollamaResult = await setup.fromTemplate(
    WORKSPACE_ID,
    "ollama-llama3",
    {}, // Use default settings
    mockTestProvider
  );
  log(`       ${ollamaResult.success ? "✓" : "✗"} ${ollamaResult.endpoint.name}`);
  log(`       Status: ${ollamaResult.testResult.status}`);
  log(`       Latency: ${ollamaResult.testResult.latencyMs}ms`);

  // 4b. LM Studio with GLM OCR
  log("\n   4b. Configuring LM Studio GLM OCR...");
  const lmstudioResult = await setup.fromTemplate(
    WORKSPACE_ID,
    "lmstudio-glm-ocr",
    {}, // Use default settings
    mockTestProvider
  );
  log(`       ${lmstudioResult.success ? "✓" : "✗"} ${lmstudioResult.endpoint.name}`);
  log(`       Status: ${lmstudioResult.testResult.status}`);

  // 4c. OpenAI GPT-4 (with API key)
  log("\n   4c. Configuring OpenAI GPT-4...");
  const openaiResult = await setup.fromTemplate(
    WORKSPACE_ID,
    "openai-gpt4",
    {
      apiKey: "sk-demo-key-12345", // Demo key
    },
    mockTestProvider
  );
  log(`       ${openaiResult.success ? "✓" : "✗"} ${openaiResult.endpoint.name}`);
  log(`       Status: ${openaiResult.testResult.status}`);

  // 4d. Manual configuration example
  log("\n   4d. Adding manually configured Anthropic Claude...");
  const manualResult = await setup.fromManualConfig(
    WORKSPACE_ID,
    {
      name: "Claude 3 Sonnet (Manual)",
      providerId: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      modelId: "claude-3-sonnet-20240229",
      purpose: "reasoning",
      capabilities: ["streaming", "vision"],
      apiKey: "sk-ant-demo-key", // Demo key
    },
    mockTestProvider
  );
  log(`       ${manualResult.success ? "✓" : "✗"} ${manualResult.endpoint.name}`);
  log(`       Status: ${manualResult.testResult.status}`);

  // 4e. Another OpenAI without valid key (should fail)
  log("\n   4e. Configuring OpenAI GPT-4 Turbo (no valid API key)...");
  const failResult = await setup.fromTemplate(
    WORKSPACE_ID,
    "openai-gpt4-turbo",
    {
      // No API key - should fail test
    },
    mockTestProvider
  );
  log(`       ${failResult.success ? "✓" : "✗"} ${failResult.endpoint.name}`);
  log(`       Status: ${failResult.testResult.status}`);
  if (failResult.testResult.errorMessage) {
    log(`       Error: ${failResult.testResult.errorMessage}`);
  }

  // Show all endpoints with status
  log("\n5. Endpoint status summary:");
  const endpointsWithStatus = await setup.getEndpointsWithStatus(WORKSPACE_ID);
  for (const { endpoint, testState, isReady } of endpointsWithStatus) {
    const icon = isReady ? "✓" : testState?.status === "failed" ? "✗" : "?";
    log(`   ${icon} ${endpoint.name}`);
    log(`      Provider: ${endpoint.providerId} | Purpose: ${endpoint.purpose}`);
    log(`      Registry ID: ${endpoint.providerId}:${endpoint.modelId}`);
    log(`      Status: ${testState?.status} | Latency: ${testState?.latencyMs}ms`);
    if (testState?.errorMessage) {
      log(`      Error: ${testState.errorMessage}`);
    }
  }

  // Show purpose summary
  log("\n6. Purpose summary:");
  const purposeSummary = await setup.getPurposeSummary(WORKSPACE_ID);
  for (const [purpose, stats] of Object.entries(purposeSummary)) {
    log(`   ${purpose}: ${stats.available} available, ${stats.tested} tested`);
    if (stats.recommended) {
      log(`      → Recommended: ${stats.recommended}`);
    }
  }

  // Resolve endpoints for different purposes using Vercel AI SDK compatible format
  log("\n7. Resolving endpoints by purpose (Vercel AI SDK compatible):");

  const defaultResolved = await config.resolveModel(
    WORKSPACE_ID,
    "default",
    { requireTested: true, preferLocal: true }
  );
  if (defaultResolved) {
    log(`   Default:`);
    log(`      Name: ${defaultResolved.endpoint.name}`);
    log(`      Registry ID: ${defaultResolved.registryId}`);
    log(`      Provider: ${defaultResolved.providerId}, Model: ${defaultResolved.modelId}`);
    log(`      Tested: ${defaultResolved.testState?.status}`);
    // Usage with Vercel AI SDK:
    // const model = registry.languageModel(defaultResolved.registryId);
    // const { text } = await generateText({ model, prompt: "..." });
  } else {
    log(`   Default: None available`);
  }

  const reasoningResolved = await config.resolveModel(
    WORKSPACE_ID,
    "reasoning",
    { requireTested: true }
  );
  if (reasoningResolved) {
    log(`   Reasoning:`);
    log(`      Name: ${reasoningResolved.endpoint.name}`);
    log(`      Registry ID: ${reasoningResolved.registryId}`);
    log(`      Provider: ${reasoningResolved.providerId}, Model: ${reasoningResolved.modelId}`);
  } else {
    log(`   Reasoning: None available`);
  }

  const ocrResolved = await config.resolveModel(
    WORKSPACE_ID,
    "ocr",
    { requireTested: true, preferLocal: true }
  );
  if (ocrResolved) {
    log(`   OCR:`);
    log(`      Name: ${ocrResolved.endpoint.name}`);
    log(`      Registry ID: ${ocrResolved.registryId}`);
    log(`      Provider: ${ocrResolved.providerId}, Model: ${ocrResolved.modelId}`);
  } else {
    log(`   OCR: None available`);
  }

  // Re-test an endpoint
  log("\n8. Re-testing Ollama endpoint...");
  const retestResult = await setup.retestEndpoint(
    WORKSPACE_ID,
    ollamaResult.endpoint.id,
    mockTestProvider
  );
  log(`   New status: ${retestResult.status}`);
  log(`   Latency: ${retestResult.latencyMs}ms`);

  // Cleanup
  log("\n9. Cleanup...");
  config.close();

  // Delete test data
  try {
    await import("node:fs/promises").then((fs) =>
      fs.rm(TEST_DATA_DIR, { recursive: true, force: true })
    );
    log("   ✓ Test data cleaned up");
  } catch {
    log("   ! Could not clean up test data");
  }

  log("\n" + "=".repeat(60));
  log("Model Pairing Experiment Complete");
  log("=".repeat(60));
}

// Run the experiment
runExperiment().catch((error) => {
  console.error("Experiment failed:", error);
  process.exit(1);
});

export { runExperiment };
