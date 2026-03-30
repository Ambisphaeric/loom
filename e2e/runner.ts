/**
 * E2E Test Runner
 *
 * Run all e2e experiments sequentially or individually.
 */

import { runExperiment as runMultiSource } from "./multi-source-pipeline.js";
import { runExperiment as runDeferred } from "./deferred-workflow.js";
import { runExperiment as runParallel } from "./parallel-processing.js";
import { runExperiment as runIntegration } from "./full-integration.js";
import { runExperiment as runStoreScreenpipe } from "./store-screenpipe.js";

const experiments = [
  { name: "Multi-Source Pipeline", fn: runMultiSource },
  { name: "Deferred Workflow", fn: runDeferred },
  { name: "Parallel Processing", fn: runParallel },
  { name: "Full Integration", fn: runIntegration },
  { name: "Store-Screenpipe Integration", fn: runStoreScreenpipe },
];

async function runAll(): Promise<void> {
  console.log("========================================");
  console.log("  Backend-Tools E2E Experiments Runner");
  console.log("========================================\n");

  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const exp of experiments) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Running: ${exp.name}`);
    console.log(`${"=".repeat(50)}\n`);

    try {
      await exp.fn();
      results.push({ name: exp.name, success: true });
      console.log(`\n✅ ${exp.name} - PASSED`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push({ name: exp.name, success: false, error: errorMessage });
      console.error(`\n❌ ${exp.name} - FAILED: ${errorMessage}`);
    }

    // Small delay between experiments
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n" + "=".repeat(50));
  console.log("  Final Results");
  console.log("=".repeat(50));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  for (const result of results) {
    const status = result.success ? "✅ PASS" : "❌ FAIL";
    console.log(`${status}: ${result.name}`);
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
  }

  console.log(`\nTotal: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  // Run all experiments
  runAll().catch((error) => {
    console.error("Runner failed:", error);
    process.exit(1);
  });
} else {
  // Run specific experiment
  const expName = args[0].toLowerCase();
  const exp = experiments.find(
    (e) =>
      e.name.toLowerCase().replace(/\s+/g, "-") === expName ||
      e.name.toLowerCase().replace(/\s+/g, "") === expName
  );

  if (exp) {
    exp.fn().catch((error) => {
      console.error(`Experiment failed: ${error}`);
      process.exit(1);
    });
  } else {
    console.error(`Unknown experiment: ${expName}`);
    console.log("\nAvailable experiments:");
    experiments.forEach((e) => {
      console.log(`  - ${e.name.toLowerCase().replace(/\s+/g, "-")}`);
    });
    process.exit(1);
  }
}
