#!/usr/bin/env bun
/**
 * Test Coverage Analysis Report
 *
 * Lists all packages and shows test coverage level for each:
 * - Unit tests: yes/no
 * - E2E/integration: yes/no
 * - Simulation: yes/no
 * - Gaps identified
 */

import { readdirSync, existsSync } from "fs";
import { join } from "path";

interface PackageCoverage {
  name: string;
  hasUnitTests: boolean;
  hasE2ETests: boolean;
  hasSimulation: boolean;
  hasIntegrationTests: boolean;
  gaps: string[];
}

interface TestSummary {
  packages: PackageCoverage[];
  summary: {
    totalPackages: number;
    withUnitTests: number;
    withE2ETests: number;
    withSimulations: number;
    withIntegrationTests: number;
    totalGaps: number;
  };
}

const PACKAGES_DIR = "packages";
const E2E_DIR = "e2e";
const SIMULATIONS_DIR = "simulations";
const TEST_DIR = "test/integration";

// All 16 packages
const ALL_PACKAGES = [
  "bus",
  "channel",
  "cron",
  "credentials",
  "ai-providers",
  "store",
  "types",
  "recipe",
  "deferred-queue",
  "join-synchronizer",
  "screenpipe",
  "config",
  "fabric",
  "discovery",
  "plugins",
  "test-harness",
];

// E2E tests that cover specific packages
const E2E_PACKAGE_MAPPING: Record<string, string[]> = {
  "multi-source-pipeline": ["bus", "join-synchronizer"],
  "deferred-workflow": ["deferred-queue", "bus"],
  "parallel-processing": ["bus", "join-synchronizer"],
  "full-integration": ["bus", "join-synchronizer", "deferred-queue", "recipe"],
  "store-screenpipe": ["store", "bus", "screenpipe"],
  "model-pairing": ["config", "ai-providers"],
};

// Simulations that cover specific packages
const SIMULATION_PACKAGE_MAPPING: Record<string, string[]> = {
  "basic-capture-store-suggest": ["store", "bus"],
  "multi-session-rag": ["store"],
  "engine-switching": ["store"],
  "credentials-multi-provider": ["credentials", "ai-providers"],
  "discovery-integration": ["discovery", "recipe", "ai-providers"],
  "full-pipeline": ["store", "bus", "recipe", "deferred-queue", "join-synchronizer", "credentials"],
};

// Integration tests that cover specific packages
const INTEGRATION_PACKAGE_MAPPING: Record<string, string[]> = {
  "cron-recipe": ["cron", "recipe"],
  "channel-bus": ["channel", "bus"],
  "fabric-recipe": ["fabric", "recipe"],
};

function checkUnitTests(packageName: string): boolean {
  const testDir = join(PACKAGES_DIR, packageName, "test");
  if (!existsSync(testDir)) return false;

  const files = readdirSync(testDir).filter((f) => f.endsWith(".test.ts") || f.endsWith(".spec.ts"));
  return files.length > 0;
}

function checkE2ETests(packageName: string): boolean {
  for (const [e2eFile, packages] of Object.entries(E2E_PACKAGE_MAPPING)) {
    if (packages.includes(packageName)) {
      const e2ePath = join(E2E_DIR, `${e2eFile}.ts`);
      if (existsSync(e2ePath)) return true;
    }
  }
  return false;
}

function checkSimulation(packageName: string): boolean {
  for (const [simFile, packages] of Object.entries(SIMULATION_PACKAGE_MAPPING)) {
    if (packages.includes(packageName)) {
      const simPath = join(SIMULATIONS_DIR, `${simFile}.ts`);
      if (existsSync(simPath)) return true;
    }
  }
  return false;
}

function checkIntegrationTests(packageName: string): boolean {
  for (const [intFile, packages] of Object.entries(INTEGRATION_PACKAGE_MAPPING)) {
    if (packages.includes(packageName)) {
      const intPath = join(TEST_DIR, `${intFile}.test.ts`);
      if (existsSync(intPath)) return true;
    }
  }
  return false;
}

function analyzePackage(packageName: string): PackageCoverage {
  const hasUnitTests = checkUnitTests(packageName);
  const hasE2ETests = checkE2ETests(packageName);
  const hasSimulation = checkSimulation(packageName);
  const hasIntegrationTests = checkIntegrationTests(packageName);

  const gaps: string[] = [];
  if (!hasUnitTests) gaps.push("Unit tests");
  if (!hasE2ETests && !hasSimulation && !hasIntegrationTests) {
    gaps.push("E2E/Simulation/Integration tests");
  }

  return {
    name: packageName,
    hasUnitTests,
    hasE2ETests,
    hasSimulation,
    hasIntegrationTests,
    gaps,
  };
}

function generateCoverageReport(): TestSummary {
  const packages = ALL_PACKAGES.map(analyzePackage);

  return {
    packages,
    summary: {
      totalPackages: packages.length,
      withUnitTests: packages.filter((p) => p.hasUnitTests).length,
      withE2ETests: packages.filter((p) => p.hasE2ETests).length,
      withSimulations: packages.filter((p) => p.hasSimulation).length,
      withIntegrationTests: packages.filter((p) => p.hasIntegrationTests).length,
      totalGaps: packages.reduce((sum, p) => sum + p.gaps.length, 0),
    },
  };
}

function generateMarkdownReport(summary: TestSummary): string {
  const lines: string[] = [];

  lines.push("# Enhancement Backend Test Coverage Report\n");
  lines.push(`Generated: ${new Date().toISOString()}\n`);

  // Summary
  lines.push("## Summary\n");
  lines.push(`- **Total Packages**: ${summary.summary.totalPackages}`);
  lines.push(`- **With Unit Tests**: ${summary.summary.withUnitTests}/${summary.summary.totalPackages} (${Math.round((summary.summary.withUnitTests / summary.summary.totalPackages) * 100)}%)`);
  lines.push(`- **With E2E Tests**: ${summary.summary.withE2ETests}/${summary.summary.totalPackages} (${Math.round((summary.summary.withE2ETests / summary.summary.totalPackages) * 100)}%)`);
  lines.push(`- **With Simulations**: ${summary.summary.withSimulations}/${summary.summary.totalPackages} (${Math.round((summary.summary.withSimulations / summary.summary.totalPackages) * 100)}%)`);
  lines.push(`- **With Integration Tests**: ${summary.summary.withIntegrationTests}/${summary.summary.totalPackages} (${Math.round((summary.summary.withIntegrationTests / summary.summary.totalPackages) * 100)}%)`);
  lines.push(`- **Total Gaps**: ${summary.summary.totalGaps}\n`);

  // Package Details
  lines.push("## Package Coverage Details\n");
  lines.push("| Package | Unit Tests | E2E Tests | Simulation | Integration | Status |");
  lines.push("|---------|------------|-----------|------------|-------------|--------|");

  for (const pkg of summary.packages) {
    const unit = pkg.hasUnitTests ? "✅" : "❌";
    const e2e = pkg.hasE2ETests ? "✅" : "❌";
    const sim = pkg.hasSimulation ? "✅" : "❌";
    const int = pkg.hasIntegrationTests ? "✅" : "❌";
    const status = pkg.gaps.length === 0 ? "✅ Complete" : `⚠️ ${pkg.gaps.length} gap(s)`;
    lines.push(`| ${pkg.name} | ${unit} | ${e2e} | ${sim} | ${int} | ${status} |`);
  }

  // Gaps
  lines.push("\n## Identified Gaps\n");

  const packagesWithGaps = summary.packages.filter((p) => p.gaps.length > 0);
  if (packagesWithGaps.length === 0) {
    lines.push("✅ No gaps identified - all packages have test coverage!\n");
  } else {
    for (const pkg of packagesWithGaps) {
      lines.push(`### ${pkg.name}\n`);
      for (const gap of pkg.gaps) {
        lines.push(`- Missing: ${gap}`);
      }
      lines.push("");
    }
  }

  // Test Files
  lines.push("\n## Test Files\n");

  lines.push("\n### Unit Tests\n");
  for (const pkg of summary.packages.filter((p) => p.hasUnitTests)) {
    const testDir = join(PACKAGES_DIR, pkg.name, "test");
    if (existsSync(testDir)) {
      const files = readdirSync(testDir).filter((f) => f.endsWith(".test.ts"));
      for (const file of files) {
        lines.push(`- \`${join(testDir, file)}\``);
      }
    }
  }

  lines.push("\n### E2E Tests\n");
  for (const e2eFile of Object.keys(E2E_PACKAGE_MAPPING)) {
    const e2ePath = join(E2E_DIR, `${e2eFile}.ts`);
    if (existsSync(e2ePath)) {
      lines.push(`- \`${e2ePath}\` (${E2E_PACKAGE_MAPPING[e2eFile].join(", ")})`);
    }
  }

  lines.push("\n### Simulations\n");
  for (const simFile of Object.keys(SIMULATION_PACKAGE_MAPPING)) {
    const simPath = join(SIMULATIONS_DIR, `${simFile}.ts`);
    if (existsSync(simPath)) {
      lines.push(`- \`${simPath}\` (${SIMULATION_PACKAGE_MAPPING[simFile].join(", ")})`);
    }
  }

  lines.push("\n### Integration Tests\n");
  for (const intFile of Object.keys(INTEGRATION_PACKAGE_MAPPING)) {
    const intPath = join(TEST_DIR, `${intFile}.test.ts`);
    if (existsSync(intPath)) {
      lines.push(`- \`${intPath}\` (${INTEGRATION_PACKAGE_MAPPING[intFile].join(", ")})`);
    } else {
      lines.push(`- \`${intPath}\` (${INTEGRATION_PACKAGE_MAPPING[intFile].join(", ")}) - **MISSING**`);
    }
  }

  return lines.join("\n");
}

function printConsoleReport(summary: TestSummary): void {
  console.log("=".repeat(80));
  console.log("  Test Coverage Analysis Report");
  console.log("=".repeat(80));

  console.log("\n📊 Summary:");
  console.log(`  Total Packages: ${summary.summary.totalPackages}`);
  console.log(`  With Unit Tests: ${summary.summary.withUnitTests}/${summary.summary.totalPackages} (${Math.round((summary.summary.withUnitTests / summary.summary.totalPackages) * 100)}%)`);
  console.log(`  With E2E Tests: ${summary.summary.withE2ETests}/${summary.summary.totalPackages} (${Math.round((summary.summary.withE2ETests / summary.summary.totalPackages) * 100)}%)`);
  console.log(`  With Simulations: ${summary.summary.withSimulations}/${summary.summary.totalPackages} (${Math.round((summary.summary.withSimulations / summary.summary.totalPackages) * 100)}%)`);
  console.log(`  With Integration Tests: ${summary.summary.withIntegrationTests}/${summary.summary.totalPackages} (${Math.round((summary.summary.withIntegrationTests / summary.summary.totalPackages) * 100)}%)`);
  console.log(`  Total Gaps: ${summary.summary.totalGaps}`);

  console.log("\n📦 Package Coverage:");
  console.log("-".repeat(80));
  console.log("Package                | Unit | E2E  | Sim  | Int  | Status");
  console.log("-".repeat(80));

  for (const pkg of summary.packages) {
    const unit = pkg.hasUnitTests ? " ✅  " : " ❌  ";
    const e2e = pkg.hasE2ETests ? " ✅  " : " ❌  ";
    const sim = pkg.hasSimulation ? " ✅  " : " ❌  ";
    const int = pkg.hasIntegrationTests ? " ✅  " : " ❌  ";
    const status = pkg.gaps.length === 0 ? "✅ Complete" : `⚠️ ${pkg.gaps.length} gap(s)`;
    console.log(`${pkg.name.padEnd(22)}|${unit}|${e2e}|${sim}|${int}| ${status}`);
  }

  console.log("-".repeat(80));

  const packagesWithGaps = summary.packages.filter((p) => p.gaps.length > 0);
  if (packagesWithGaps.length > 0) {
    console.log("\n⚠️  Packages with Gaps:");
    for (const pkg of packagesWithGaps) {
      console.log(`\n  ${pkg.name}:`);
      for (const gap of pkg.gaps) {
        console.log(`    - Missing: ${gap}`);
      }
    }
  } else {
    console.log("\n✅ All packages have test coverage!");
  }

  console.log("\n" + "=".repeat(80));
}

function main(): void {
  const args = process.argv.slice(2);
  const markdownOutput = args.includes("--markdown") || args.includes("-m");
  const saveToFile = args.includes("--save");

  const summary = generateCoverageReport();

  if (markdownOutput) {
    const markdown = generateMarkdownReport(summary);
    console.log(markdown);

    if (saveToFile) {
      const filename = `TEST_COVERAGE_REPORT_${new Date().toISOString().split("T")[0]}.md`;
      Bun.write(filename, markdown);
      console.error(`\nReport saved to: ${filename}`);
    }
  } else {
    printConsoleReport(summary);

    if (saveToFile) {
      const filename = `TEST_COVERAGE_REPORT_${new Date().toISOString().split("T")[0]}.md`;
      const markdown = generateMarkdownReport(summary);
      Bun.write(filename, markdown);
      console.log(`\nReport saved to: ${filename}`);
    }
  }

  // Exit with error if there are gaps in CI mode
  if (args.includes("--ci") && summary.summary.totalGaps > 0) {
    process.exit(1);
  }
}

main();
