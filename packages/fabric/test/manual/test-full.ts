/**
 * Fabric Integration Full Test
 * 
 * Tests installation, pattern sync, and chunk transformation.
 * Run: bun run packages/fabric/test-full.ts
 */

import { 
  createFabricIntegration, 
} from "@enhancement/fabric";
import type { ContextChunk } from "@enhancement/types";
import { ulid } from "ulidx";

console.log("=== Full Fabric Integration Test ===\n");

const fabric = createFabricIntegration({ 
  autoInstall: true,
  autoSyncPatterns: false,
});

// Step 1: Initialize
console.log("1. Initializing...");
const initResult = await fabric.initialize();
console.log(`   ${initResult.success ? "✓" : "✗"} Initialize: ${initResult.success}`);
console.log(`   Binary path: ${initResult.binaryPath}`);
console.log(`   Installed new: ${initResult.installed}, Using existing: ${initResult.usingExisting}`);

if (!initResult.success) {
  console.error(`   Error: ${initResult.error}`);
  process.exit(1);
}

// Step 2: Check version
console.log("\n2. Checking version...");
const version = await fabric.getVersion();
console.log(`   Fabric version: ${version ?? "unknown"}`);

// Step 3: Sync patterns
console.log("\n3. Syncing patterns...");
const syncResult = await fabric.syncPatterns();
console.log(`   ${syncResult.success ? "✓" : "✗"} Sync success`);
console.log(`   Downloaded: ${syncResult.downloaded} patterns`);

// Step 4: List patterns
console.log("\n4. Available patterns:");
const patternList = await fabric.listPatterns();
console.log(`   Local: ${patternList.local.length}, Remote: ${patternList.remote.length}, Missing: ${patternList.missing.length}`);

if (patternList.local.length > 0) {
  console.log(`   Examples: ${patternList.local.slice(0, 5).join(", ")}...`);
}

// Step 5: Test transformation (if patterns available)
console.log("\n5. Testing transformation...");

if (patternList.local.length === 0) {
  console.log("   ✗ No patterns available - cannot test transformation");
} else {
  // Create test chunks
  const testChunks: ContextChunk[] = [
    {
      id: ulid(),
      content: `I have a lot to do today. First, I need to finish the quarterly report by 3pm. 
Then I have a meeting with the engineering team at 4pm to discuss the new architecture.
After that, I should review the pull requests that have been pending since yesterday.
I also need to prepare slides for tomorrow's presentation to the board.
Finally, I want to catch up on some reading about the latest AI research developments.`,
      source: "user_notes",
      workspace: "test",
      timestamp: Date.now(),
      metadata: { type: "todo_list" },
    },
    {
      id: ulid(),
      content: `The system experienced a critical failure at 2:47 AM. The database connection pool 
was exhausted, causing API requests to timeout. The error logs show connection refused 
errors from the primary database node. The replica nodes remained operational. 
A manual restart of the connection pool resolved the issue temporarily. 
We need to investigate why connections were not being released properly.`,
      source: "incident_report",
      workspace: "test",
      timestamp: Date.now(),
      metadata: { severity: "high" },
    },
    {
      id: ulid(),
      content: `Architectural Decision: We have chosen to adopt a microservices architecture for 
the new payment processing system. This decision was made after evaluating several 
alternatives including monolithic with modular boundaries and serverless functions. 
Key factors were: team autonomy, independent deployment capabilities, and technology 
diversity needs. Trade-offs include increased operational complexity and network 
latency overhead. We will use Kubernetes for orchestration and gRPC for inter-service 
communication.`,
      source: "adr",
      workspace: "test",
      timestamp: Date.now(),
      metadata: { decision_id: "ADR-042" },
    },
  ];

  // Pick a pattern (prefer summarize if available)
  const patternName = patternList.local.includes("summarize") 
    ? "summarize" 
    : patternList.local[0];

  console.log(`   Using pattern: "${patternName}"`);
  console.log(`   Input chunks: ${testChunks.length}`);
  
  for (const chunk of testChunks) {
    console.log(`\n   Input (${chunk.metadata?.type ?? chunk.source}):`);
    console.log(`   "${chunk.content.slice(0, 60)}..."`);
    
    console.log(`   Running fabric pattern...`);
    const start = Date.now();
    const result = await fabric.transformChunk(chunk, patternName, {
      model: "gpt-4o-mini",  // Use cheaper model for testing
      stream: false,
    });
    const duration = Date.now() - start;
    
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Success: ${result.success}`);
    
    if (result.success) {
      console.log(`   Output: "${result.chunk.content.slice(0, 100)}..."`);
    } else {
      console.log(`   Error: ${result.error}`);
    }
  }
}

// Summary
console.log("\n=== Test Summary ===");
console.log(`Fabric available: ${fabric.isAvailable()}`);
console.log(`Patterns synced: ${patternList.local.length > 0}`);
console.log(`Binary path: ${fabric.getCLI().getBinaryPath()}`);
console.log("\nAll tests completed!");
