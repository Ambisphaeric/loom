#!/usr/bin/env bun
/**
 * All Tests Runner
 *
 * Runs all test suites: unit tests, E2E tests, simulations, and integration tests.
 * Generates unified report with timing.
 * Returns proper exit code for CI.
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import {
  createTestConfig,
  type TestConfig,
} from "./config.js";

interface TestSuiteResult {
  name: string;
  success: boolean;
  duration: number;
  passed?: number;
  failed?: number;
  error?: string;
  output?: string;
}

interface TestSummary {
  unit: TestSuiteResult[];
  e2e: TestSuiteResult[];
  simulations: TestSuiteResult[];
  integration: TestSuiteResult[];
  totalDuration: number;
}

// Parse command line arguments
function parseArgs(): {
  config: TestConfig;
  skipUnit: boolean;
  skipE2E: boolean;
  skipSimulations: boolean;
  skipIntegration: boolean;
  jsonOutput: boolean;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  const configOverrides: Partial<TestConfig> = {};

  let skipUnit = false;
  let skipE2E = false;
  let skipSimulations = false;
  let skipIntegration = false;
  let jsonOutput = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--skip-unit":
        skipUnit = true;
        break;
      case "--skip-e2e":
        skipE2E = true;
        break;
      case "--skip-simulations":
      case "--skip-sims":
        skipSimulations = true;
        break;
      case "--skip-integration":
        skipIntegration = true;
        break;
      case "--json":
        jsonOutput = true;
        break;
      case "--verbose":
      case "-v":
        verbose = true;
        break;
      case "--ci":
        configOverrides.isCI = true;
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
    skipUnit,
    skipE2E,
    skipSimulations,
    skipIntegration,
    jsonOutput,
    verbose,
  };
}

function printHelp(): void {
  console.log(`
Usage: bun test/all-runner.ts [options]

Runs all test suites: unit tests, E2E tests, simulations, and integration tests.

Options:
  --skip-unit                 Skip unit tests
  --skip-e2e                  Skip E2E tests
  --skip-simulations          Skip simulations
  --skip-integration          Skip integration tests
  --json                      Output results as JSON
  --verbose, -v               Verbose output
  --ci                        Force CI mode
  --timeout <ms>              Set default timeout in milliseconds
  --help, -h                  Show this help message

Examples:
  bun test/all-runner.ts                    # Run all tests
  bun test/all-runner.ts --skip-unit         # Skip unit tests
  bun test/all-runner.ts --json              # Output JSON results
  bun test/all-runner.ts --ci                # Run in CI mode
`);
}

async function runUnitTests(
  config: TestConfig,
  verbose: boolean
): Promise<TestSuiteResult> {
  const startTime = Date.now();

  console.log("\n📦 Running Unit Tests...");
  console.log("-".repeat(60));

  try {
    // Run turbo test
    const proc = Bun.spawn({
      cmd: ["turbo", "run", "test"],
      stdout: verbose ? "inherit" : "pipe",
      stderr: verbose ? "inherit" : "pipe",
    });

    const exitCode = await proc.exited;
    const duration = Date.now() - startTime;

    return {
      name: "Unit Tests (turbo run test)",
      success: exitCode === 0,
      duration,
      error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      name: "Unit Tests (turbo run test)",
      success: false,
      duration,
      error: errorMessage,
    };
  }
}

async function runE2ETests(config: TestConfig): Promise<TestSuiteResult> {
  const startTime = Date.now();

  console.log("\n🔗 Running E2E Tests...");
  console.log("-".repeat(60));

  try {
    // Import and run the E2E runner
    const { default: e2eRunner } = await import("./e2e-runner.js");

    // Since e2e-runner runs directly, we need to invoke it differently
    const proc = Bun.spawn({
      cmd: ["bun", "test/e2e-runner.ts", "--e2e"],
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    const duration = Date.now() - startTime;

    return {
      name: "E2E Tests",
      success: exitCode === 0,
      duration,
      error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      name: "E2E Tests",
      success: false,
      duration,
      error: errorMessage,
    };
  }
}

async function runSimulations(config: TestConfig): Promise<TestSuiteResult> {
  const startTime = Date.now();

  console.log("\n🧪 Running Simulations...");
  console.log("-".repeat(60));

  try {
    const proc = Bun.spawn({
      cmd: ["bun", "test/e2e-runner.ts", "--simulations"],
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    const duration = Date.now() - startTime;

    return {
      name: "Simulations",
      success: exitCode === 0,
      duration,
      error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      name: "Simulations",
      success: false,
      duration,
      error: errorMessage,
    };
  }
}

async function runIntegrationTests(config: TestConfig): Promise<TestSuiteResult> {
  const startTime = Date.now();

  console.log("\n🔌 Running Integration Tests...");
  console.log("-".repeat(60));

  try {
    // Run all integration test files
    const integrationDir = "test/integration";
    if (!existsSync(integrationDir)) {
      return {
        name: "Integration Tests",
        success: true,
        duration: 0,
        error: "No integration tests directory found",
      };
    }

    const proc = Bun.spawn({
      cmd: ["bun", "test", "test/integration/*.test.ts"],
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    const duration = Date.now() - startTime;

    return {
      name: "Integration Tests",
      success: exitCode === 0,
      duration,
      error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      name: "Integration Tests",
      success: false,
      duration,
      error: errorMessage,
    };
  }
}

async function runAllTests(options: ReturnType<typeof parseArgs>): Promise<TestSummary> {
  const { config, skipUnit, skipE2E, skipSimulations, skipIntegration } = options;
  const totalStartTime = Date.now();

  console.log("=".repeat(70));
  console.log("  All Tests Runner");
  console.log("=".repeat(70));
  console.log(`\nEnvironment: ${config.isCI ? "CI" : "Local"}`);
  console.log(`Timeout: ${config.defaultTimeout}ms`);

  const summary: TestSummary = {
    unit: [],
    e2e: [],
    simulations: [],
    integration: [],
    totalDuration: 0,
  };

  // Run unit tests
  if (!skipUnit) {
    const unitResult = await runUnitTests(config, options.verbose);
    summary.unit.push(unitResult);
  }

  // Run E2E tests
  if (!skipE2E) {
    const e2eResult = await runE2ETests(config);
    summary.e2e.push(e2eResult);
  }

  // Run simulations
  if (!skipSimulations) {
    const simResult = await runSimulations(config);
    summary.simulations.push(simResult);
  }

  // Run integration tests
  if (!skipIntegration) {
    const intResult = await runIntegrationTests(config);
    summary.integration.push(intResult);
  }

  summary.totalDuration = Date.now() - totalStartTime;

  return summary;
}

function printSummary(summary: TestSummary, options: ReturnType<typeof parseArgs>): void {
  const { jsonOutput } = options;

  if (jsonOutput) {
    console.log("\n--- JSON OUTPUT ---");
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("\n" + "=".repeat(70));
  console.log("  Test Summary");
  console.log("=".repeat(70));

  // Unit tests
  if (summary.unit.length > 0) {
    console.log("\n  📦 Unit Tests:");
    for (const result of summary.unit) {
      const status = result.success ? "✅" : "❌";
      console.log(`    ${status} ${result.name} (${result.duration}ms)`);
      if (result.error) {
        console.log(`       Error: ${result.error}`);
      }
    }
  }

  // E2E tests
  if (summary.e2e.length > 0) {
    console.log("\n  🔗 E2E Tests:");
    for (const result of summary.e2e) {
      const status = result.success ? "✅" : "❌";
      console.log(`    ${status} ${result.name} (${result.duration}ms)`);
      if (result.error) {
        console.log(`       Error: ${result.error}`);
      }
    }
  }

  // Simulations
  if (summary.simulations.length > 0) {
    console.log("\n  🧪 Simulations:");
    for (const result of summary.simulations) {
      const status = result.success ? "✅" : "❌";
      console.log(`    ${status} ${result.name} (${result.duration}ms)`);
      if (result.error) {
        console.log(`       Error: ${result.error}`);
      }
    }
  }

  // Integration tests
  if (summary.integration.length > 0) {
    console.log("\n  🔌 Integration Tests:");
    for (const result of summary.integration) {
      const status = result.success ? "✅" : "❌";
      console.log(`    ${status} ${result.name} (${result.duration}ms)`);
      if (result.error) {
        console.log(`       Error: ${result.error}`);
      }
    }
  }

  // Overall stats
  const allResults = [...summary.unit, ...summary.e2e, ...summary.simulations, ...summary.integration];
  const passed = allResults.filter((r) => r.success).length;
  const failed = allResults.filter((r) => !r.success).length;

  console.log("\n" + "-".repeat(70));
  console.log(`Total: ${passed} passed, ${failed} failed (${summary.totalDuration}ms)`);
  console.log("=".repeat(70));
}

async function main(): Promise<void> {
  const options = parseArgs();
  const summary = await runAllTests(options);

  printSummary(summary, options);

  // Determine exit code
  const allResults = [...summary.unit, ...summary.e2e, ...summary.simulations, ...summary.integration];
  const failed = allResults.filter((r) => !r.success).length;

  if (failed > 0) {
    console.log("\n❌ Some test suites failed");
    process.exit(1);
  } else {
    console.log("\n✅ All test suites passed");
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("All-runner failed:", error);
  process.exit(1);
});
