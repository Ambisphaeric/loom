/**
 * Fabric Package Test
 * 
 * Tests the @enhancement/fabric package with real-world usage.
 * Run: bun test packages/fabric/test-manual.ts
 */

import { 
  createFabricIntegration, 
  createFabricCLI,
  createFabricInstaller,
  createPatternSync 
} from "@enhancement/fabric";
import type { ContextChunk } from "@enhancement/types";
import { ulid } from "ulidx";

console.log("=== Fabric Package Test ===\n");

// Test 1: Check if fabric is available anywhere on the system
console.log("1. Checking for existing Fabric installation...");
const installer = createFabricInstaller();
const cli = createFabricCLI();

console.log(`   Binary in PATH/homebrew: ${cli.isAvailable() ? "✓ Found" : "✗ Not found"}`);
console.log(`   Binary in managed location: ${installer.isInstalled() ? "✓ Found" : "✗ Not found"}`);
console.log(`   Detected binary path: ${cli.getBinaryPath()}`);

// Test 2: Initialize (will use existing or install)
console.log("\n2. Initializing Fabric integration...");
const fabric = createFabricIntegration({ 
  autoInstall: true,
  autoSyncPatterns: false // Don't auto-sync for test
});

const initResult = await fabric.initialize();
console.log(`   Success: ${initResult.success}`);
console.log(`   Using existing install: ${initResult.usingExisting}`);
console.log(`   Installed new binary: ${initResult.installed}`);
console.log(`   Binary path: ${initResult.binaryPath}`);

if (!initResult.success) {
  console.error(`   Error: ${initResult.error}`);
  console.log("\n⚠️  Fabric not available. Would need to install to continue.");
  process.exit(1);
}

// Test 3: List patterns
console.log("\n3. Checking patterns...");
const patternSync = fabric.getPatternSync();
const localPatterns = await patternSync.listLocalPatterns();
console.log(`   Local patterns: ${localPatterns.length}`);
if (localPatterns.length > 0) {
  console.log(`   First few: ${localPatterns.slice(0, 5).join(", ")}...`);
} else {
  console.log("   No patterns found locally. Run syncPatterns() to download.");
}

// Test 4: Create a test chunk and transform it
console.log("\n4. Testing pattern transformation...");

if (localPatterns.length === 0) {
  console.log("   ⚠️  No patterns available. Skipping transformation test.");
  console.log("   To test: run fabric.syncPatterns() first");
} else {
  // Create a test chunk
  const testChunk: ContextChunk = {
    id: ulid(),
    content: "This is a test of the fabric integration. We want to see if it can summarize this short paragraph into a concise sentence.",
    source: "test",
    workspace: "test",
    timestamp: Date.now(),
    metadata: { test: true },
  };

  // Try to use a common pattern
  const patternName = localPatterns.includes("summarize") ? "summarize" : localPatterns[0];
  
  console.log(`   Input: "${testChunk.content.slice(0, 60)}..."`);
  console.log(`   Pattern: ${patternName}`);
  console.log(`   Running...`);
  
  const startTime = Date.now();
  const result = await fabric.transformChunk(testChunk, patternName);
  const duration = Date.now() - startTime;
  
  console.log(`   Duration: ${duration}ms`);
  console.log(`   Success: ${result.success}`);
  
  if (result.success) {
    console.log(`   Output: "${result.chunk.content.slice(0, 80)}..."`);
    console.log(`   CLI command: ${result.cliResult.command}`);
    console.log(`   Exit code: ${result.cliResult.exitCode}`);
  } else {
    console.error(`   Error: ${result.error}`);
  }
}

// Test 5: Show available actions
console.log("\n5. Available actions:");
console.log(`   - List patterns: fabric.listPatterns()`);
console.log(`   - Sync patterns: fabric.syncPatterns()`);
console.log(`   - Run pattern: fabric.transformChunk(chunk, "pattern_name")`);
console.log(`   - Get CLI: fabric.getCLI()`);
console.log(`   - Get version: fabric.getVersion()`);

console.log("\n=== Test Complete ===");
