/**
 * Unified E2E Test Runner
 *
 * Discovers and runs all E2E experiments and simulations.
 * Generates unified report with timing.
 * Returns proper exit code for CI.
 * Supports filtering by tag/category.
 */

import { createTestConfig, shouldRunTest, type TestConfig } from "./config.js";
import { runExperiment as runMultiSource } from "../e2e/multi-source-pipeline.js";
import { runExperiment as runDeferred } from "../e2e/deferred-workflow.js";
import { runExperiment as runParallel } from "../e2e/parallel-processing.js";
import { runExperiment as runIntegration } from "../e2e/full-integration.js";
import { runExperiment as runStoreScreenpipe } from "../e2e/store-screenpipe.js";
import { runExperiment as runModelPairing } from "../e2e/model-pairing.js";
import { runExperiment as runBasicCapture } from "../simulations/basic-capture-store-suggest.js";
import { runExperiment as runMultiSessionRag } from "../simulations/multi-session-rag.js";
import { runExperiment as runEngineSwitching } from "../simulations/engine-switching.js";
import { runExperiment as runCredentialsMultiProvider } from "../simulations/credentials-multi-provider.js";
import { runExperiment as runDiscoveryIntegration } from "../simulations/discovery-integration.js";
import { runExperiment as runFullPipeline } from "../simulations/full-pipeline.js";

// Result type for experiments
export interface ExperimentResult {
  name: string;
  category: "e2e" | "simulation";
  success: boolean;
  duration: number;
  error?: string;
  tags: string[];
}

// Experiment definition
interface ExperimentDef {
  name: string;
  category: "e2e" | "simulation";
  fn: () => Promise<void>;
  tags: string[];
}

// All available experiments
const experiments: ExperimentDef[] = [
  // E2E experiments
  { name: "Multi-Source Pipeline", category: "e2e", fn: runMultiSource, tags: ["bus", "join", "pipeline"] },
  { name: "Deferred Workflow", category: "e2e", fn: runDeferred, tags: ["deferred", "bus", "workflow"] },
  { name: "Parallel Processing", category: "e2e", fn: runParallel, tags: ["bus", "join", "parallel"] },
  { name: "Full Integration", category: "e2e", fn: runIntegration, tags: ["integration", "bus", "deferred", "join"] },
  { name: "Store-Screenpipe Integration", category: "e2e", fn: runStoreScreenpipe, tags: ["store", "bus", "screenpipe"] },
  { name: "Model Pairing", category: "e2e", fn: runModelPairing, tags: ["config", "models", "ai-providers"] },

  // Simulations
  { name: "Basic Capture-Store-Suggest", category: "simulation", fn: runBasicCapture, tags: ["store", "bus", "capture"] },
  { name: "Multi-Session RAG", category: "simulation", fn: runMultiSessionRag, tags: ["store", "rag", "session"] },
  { name: "Engine Switching", category: "simulation", fn: runEngineSwitching, tags: ["store", "engine", "zvec", "sqlite-vec", "chroma"] },
  { name: "Credentials Multi-Provider", category: "simulation", fn: runCredentialsMultiProvider, tags: ["credentials", "ai-providers"] },
  { name: "Discovery Integration", category: "simulation", fn: runDiscoveryIntegration, tags: ["discovery", "recipe"] },
  { name: "Full Pipeline", category: "simulation", fn: runFullPipeline, tags: ["integration", "pipeline", "all-packages"] },
];

// Parse command line arguments
function parseArgs(): {
  config: TestConfig;
  e2eOnly: boolean;
  simulationsOnly: boolean;
  filter?: string;
  jsonOutput: boolean;
} {
  const args = process.argv.slice(2);
  let e2eOnly = false;
  let simulationsOnly = false;
  let filter: string | undefined;
  let jsonOutput = false;

  const configOverrides: Partial<TestConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--e2e-only":
      case "--e2e":
        e2eOnly = true;
        break;
      case "--simulations-only":
      case "--simulations":
        simulationsOnly = true;
        break;
      case "--filter":
      case "--tag":
        filter = args[++i];
        configOverrides.tags = filter ? [filter] : [];
        break;
      case "--json":
        jsonOutput = true;
        break;
      case "--ci":
        configOverrides.isCI = true;
        break;
      case "--external":
        configOverrides.enableExternalServices = true;
        break;
      case "--timeout":
        configOverrides.defaultTimeout = parseInt(args[++i], 10);
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }

  return {
    config: createTestConfig(configOverrides),
    e2eOnly,
    simulationsOnly,
    filter,
    jsonOutput,
  };
}

function printHelp(): void {
  console.log(`
Usage: bun test/e2e-runner.ts [options]

Options:
  --e2e-only, --e2e           Run only E2E experiments
  --simulations-only          Run only simulations
  --filter, --tag <tag>       Filter tests by tag (e.g., 'bus', 'store')
  --json                      Output results as JSON
  --ci                        Force CI mode (shorter timeouts, no external services)
  --external                  Enable external services (for local dev)
  --timeout <ms>              Set default timeout in milliseconds
  --help, -h                  Show this help message

Examples:
  bun test/e2e-runner.ts                    # Run all tests
  bun test/e2e-runner.ts --e2e              # Run only E2E tests
  bun test/e2e-runner.ts --tag bus          # Run tests tagged with 'bus'
  bun test/e2e-runner.ts --json             # Output JSON results
`);
}

async function runSingleExperiment(exp: ExperimentDef, config: TestConfig): Promise<ExperimentResult> {
  const startTime = Date.now();

  try {
    await exp.fn();
    return {
      name: exp.name,
      category: exp.category,
      success: true,
      duration: Date.now() - startTime,
      tags: exp.tags,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      name: exp.name,
      category: exp.category,
      success: false,
      duration: Date.now() - startTime,
      error: errorMessage,
      tags: exp.tags,
    };
  }
}

async function runAllExperiments(options: ReturnType<typeof parseArgs>): Promise<ExperimentResult[]> {
  const { config, e2eOnly, simulationsOnly, filter } = options;
  const results: ExperimentResult[] = [];

  // Filter experiments based on options
  let filteredExperiments = experiments;

  if (e2eOnly) {
    filteredExperiments = filteredExperiments.filter((e) => e.category === "e2e");
  } else if (simulationsOnly) {
    filteredExperiments = filteredExperiments.filter((e) => e.category === "simulation");
  }

  if (filter) {
    filteredExperiments = filteredExperiments.filter((e) =>
      shouldRunTest(e.tags, [filter])
    );
  }

  const total = filteredExperiments.length;

  console.log("=".repeat(70));
  console.log("  Unified E2E & Simulation Test Runner");
  console.log("=".repeat(70));
  console.log(`\nEnvironment: ${config.isCI ? "CI" : "Local"}`);
  console.log(`Timeout: ${config.defaultTimeout}ms`);
  console.log(`Retries: ${config.retries}`);
  console.log(`External services: ${config.enableExternalServices ? "enabled" : "disabled"}`);
  console.log(`\nRunning ${total} experiments...\n`);

  for (let i = 0; i < filteredExperiments.length; i++) {
    const exp = filteredExperiments[i];

    console.log(`${"-".repeat(70)}`);
    console.log(`[${i + 1}/${total}] ${exp.name} (${exp.category})`);
    console.log(`Tags: ${exp.tags.join(", ")}`);
    console.log(`${"-".repeat(70)}`);

    const result = await runSingleExperiment(exp, config);
    results.push(result);

    const status = result.success ? "✅ PASSED" : "❌ FAILED";
    console.log(`\n${status} (${result.duration}ms)`);

    if (result.error) {
      console.log(`Error: ${result.error}`);
    }

    // Small delay between experiments
    if (i < filteredExperiments.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

function printSummary(results: ExperimentResult[], options: ReturnType<typeof parseArgs>): void {
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log("\n" + "=".repeat(70));
  console.log("  Final Results");
  console.log("=".repeat(70));

  // Group by category
  const e2eResults = results.filter((r) => r.category === "e2e");
  const simResults = results.filter((r) => r.category === "simulation");

  if (e2eResults.length > 0) {
    console.log("\n  E2E Experiments:");
    for (const result of e2eResults) {
      const status = result.success ? "✅" : "❌";
      console.log(`    ${status} ${result.name} (${result.duration}ms)`);
      if (result.error) {
        console.log(`       Error: ${result.error}`);
      }
    }
  }

  if (simResults.length > 0) {
    console.log("\n  Simulations:");
    for (const result of simResults) {
      const status = result.success ? "✅" : "❌";
      console.log(`    ${status} ${result.name} (${result.duration}ms)`);
      if (result.error) {
        console.log(`       Error: ${result.error}`);
      }
    }
  }

  console.log("\n" + "-".repeat(70));
  console.log(`Total: ${passed} passed, ${failed} failed (${totalDuration}ms total)`);
  console.log("=".repeat(70));

  // JSON output if requested
  if (options.jsonOutput) {
    console.log("\n--- JSON OUTPUT ---");
    console.log(JSON.stringify({
      summary: {
        total: results.length,
        passed,
        failed,
        totalDuration,
      },
      results: results.map((r) => ({
        name: r.name,
        category: r.category,
        success: r.success,
        duration: r.duration,
        error: r.error,
        tags: r.tags,
      })),
    }, null, 2));
  }
}

async function main(): Promise<void> {
  const options = parseArgs();
  const results = await runAllExperiments(options);

  printSummary(results, options);

  const failed = results.filter((r) => !r.success).length;
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Runner failed:", error);
  process.exit(1);
});
