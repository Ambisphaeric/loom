#!/usr/bin/env bun
/**
 * CI Test Runner
 *
 * Optimized for CI environments. Runs tests in order of priority:
 * 1. Unit tests (fastest, fail fast)
 * 2. Integration tests (medium)
 * 3. Simulations (slower, comprehensive)
 * 4. E2E tests (slowest, full system)
 *
 * Fails fast on critical errors.
 * Outputs JUnit-compatible XML if JUNIT_OUTPUT env var is set.
 */

import { existsSync } from "fs";
import { join } from "path";
import {
  createTestConfig,
  type TestConfig,
} from "./config.js";

interface CIStage {
  name: string;
  priority: "critical" | "high" | "medium" | "low";
  run: () => Promise<CIStageResult>;
}

interface CIStageResult {
  stage: string;
  success: boolean;
  duration: number;
  failedTests?: number;
  totalTests?: number;
  error?: string;
  logs?: string;
}

interface CIReport {
  stages: CIStageResult[];
  totalDuration: number;
  failedStages: number;
  exitCode: number;
}

// Force CI mode
const config = createTestConfig({
  isCI: true,
  enableExternalServices: false,
  enableRealAIProviders: false,
  enableRealDatabases: false,
});

async function runStage(
  stage: CIStage,
  failFast: boolean
): Promise<CIStageResult> {
  console.log(`\n[${stage.priority.toUpperCase()}] Running ${stage.name}...`);
  const startTime = Date.now();

  try {
    const result = await stage.run();
    const duration = Date.now() - startTime;

    return {
      ...result,
      stage: stage.name,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`❌ ${stage.name} failed:`, errorMessage);

    return {
      stage: stage.name,
      success: false,
      duration,
      error: errorMessage,
    };
  }
}

async function runUnitTestsStage(): Promise<CIStageResult> {
  const proc = Bun.spawn({
    cmd: ["turbo", "run", "test"],
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  return {
    stage: "Unit Tests",
    success: exitCode === 0,
    duration: 0,
    failedTests: exitCode === 0 ? 0 : undefined,
    totalTests: undefined,
    error: exitCode !== 0 ? `turbo test failed with exit code ${exitCode}` : undefined,
  };
}

async function runIntegrationTestsStage(): Promise<CIStageResult> {
  const integrationDir = "test/integration";
  if (!existsSync(integrationDir)) {
    return {
      stage: "Integration Tests",
      success: true,
      duration: 0,
      error: "No integration tests found",
    };
  }

  const proc = Bun.spawn({
    cmd: ["bun", "test", "test/integration/*.test.ts"],
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  return {
    stage: "Integration Tests",
    success: exitCode === 0,
    duration: 0,
    error: exitCode !== 0 ? `Integration tests failed with exit code ${exitCode}` : undefined,
  };
}

async function runSimulationsStage(): Promise<CIStageResult> {
  const proc = Bun.spawn({
    cmd: ["bun", "test/e2e-runner.ts", "--simulations", "--ci"],
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  return {
    stage: "Simulations",
    success: exitCode === 0,
    duration: 0,
    error: exitCode !== 0 ? `Simulations failed with exit code ${exitCode}` : undefined,
  };
}

async function runE2EStage(): Promise<CIStageResult> {
  const proc = Bun.spawn({
    cmd: ["bun", "test/e2e-runner.ts", "--e2e", "--ci"],
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  return {
    stage: "E2E Tests",
    success: exitCode === 0,
    duration: 0,
    error: exitCode !== 0 ? `E2E tests failed with exit code ${exitCode}` : undefined,
  };
}

async function runCIRunners(): Promise<CIReport> {
  const totalStartTime = Date.now();

  console.log("=".repeat(70));
  console.log("  CI Test Runner");
  console.log("=".repeat(70));
  console.log("\nConfiguration:");
  console.log(`  Environment: CI (forced)`);
  console.log(`  Timeout: ${config.defaultTimeout}ms`);
  console.log(`  External services: disabled`);
  console.log(`  Fail fast: enabled`);

  const stages: CIStage[] = [
    {
      name: "Unit Tests",
      priority: "critical",
      run: runUnitTestsStage,
    },
    {
      name: "Integration Tests",
      priority: "high",
      run: runIntegrationTestsStage,
    },
    {
      name: "Simulations",
      priority: "medium",
      run: runSimulationsStage,
    },
    {
      name: "E2E Tests",
      priority: "low",
      run: runE2EStage,
    },
  ];

  const results: CIStageResult[] = [];
  let failedStages = 0;

  for (const stage of stages) {
    const result = await runStage(stage, true);
    results.push(result);

    if (!result.success) {
      failedStages++;

      // Fail fast on critical stages
      if (stage.priority === "critical") {
        console.log(`\n❌ Critical stage "${stage.name}" failed. Aborting.`);
        break;
      }

      // For high priority, continue but warn
      if (stage.priority === "high") {
        console.log(`\n⚠️  High priority stage "${stage.name}" failed. Continuing...`);
      }
    } else {
      console.log(`✅ ${stage.name} passed (${result.duration}ms)`);
    }
  }

  const totalDuration = Date.now() - totalStartTime;

  return {
    stages: results,
    totalDuration,
    failedStages,
    exitCode: failedStages > 0 ? 1 : 0,
  };
}

function generateJUnitXML(report: CIReport): string {
  const timestamp = new Date().toISOString();
  const testCases: string[] = [];

  for (const stage of report.stages) {
    const time = (stage.duration / 1000).toFixed(3);
    if (stage.success) {
      testCases.push(
        `    <testcase name="${stage.stage}" time="${time}" />`
      );
    } else {
      testCases.push(
        `    <testcase name="${stage.stage}" time="${time}">\n      <failure message="${stage.error || "Test failed"}" />\n    </testcase>`
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="CI Test Suite" tests="${report.stages.length}" failures="${report.failedStages}" time="${(report.totalDuration / 1000).toFixed(3)}" timestamp="${timestamp}">
${testCases.join("\n")}
  </testsuite>
</testsuites>`;
}

function generateGitHubActionsOutput(report: CIReport): void {
  // Output in GitHub Actions format
  for (const stage of report.stages) {
    if (stage.success) {
      console.log(`::notice::${stage.stage} passed (${stage.duration}ms)`);
    } else {
      console.log(
        `::error::${stage.stage} failed: ${stage.error || "Unknown error"}`
      );
    }
  }

  // Set output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    console.log(`total_duration=${report.totalDuration} >> $GITHUB_OUTPUT`);
    console.log(`failed_stages=${report.failedStages} >> $GITHUB_OUTPUT`);
    console.log(`exit_code=${report.exitCode} >> $GITHUB_OUTPUT`);
  }
}

function printCIReport(report: CIReport): void {
  console.log("\n" + "=".repeat(70));
  console.log("  CI Test Report");
  console.log("=".repeat(70));

  for (const stage of report.stages) {
    const icon = stage.success ? "✅" : "❌";
    console.log(`\n${icon} ${stage.stage} (${stage.duration}ms)`);
    if (stage.error) {
      console.log(`   Error: ${stage.error}`);
    }
  }

  console.log("\n" + "-".repeat(70));
  console.log(
    `Total: ${report.stages.length - report.failedStages}/${
      report.stages.length
    } stages passed (${report.totalDuration}ms)`
  );
  console.log("=".repeat(70));

  // Generate JUnit XML if requested
  if (process.env.JUNIT_OUTPUT) {
    const junitXML = generateJUnitXML(report);
    Bun.write(process.env.JUNIT_OUTPUT, junitXML);
    console.log(`\nJUnit XML report written to: ${process.env.JUNIT_OUTPUT}`);
  }

  // GitHub Actions output
  if (process.env.GITHUB_ACTIONS) {
    generateGitHubActionsOutput(report);
  }
}

async function main(): Promise<void> {
  const report = await runCIRunners();

  printCIReport(report);

  process.exit(report.exitCode);
}

main().catch((error) => {
  console.error("CI Runner failed:", error);
  process.exit(1);
});
