/**
 * Fabric + LM Studio Test
 * 
 * Tests fabric transformation using local LM Studio with qwen3.5-0.8b-optiq
 * Using command-line flags to specify vendor and model
 */

import { createFabricIntegration } from "@enhancement/fabric";
import type { ContextChunk } from "@enhancement/types";
import { ulid } from "ulidx";

console.log("=== Fabric + LM Studio (qwen3.5-0.8b-optiq) Test ===\n");

// Create test chunk - todo list to summarize
const testChunk: ContextChunk = {
  id: ulid(),
  content: `Today's Tasks:
1. Finish quarterly report by 3pm for the CFO review
2. Engineering team meeting at 4pm to discuss microservices migration
3. Review pending pull requests from yesterday's sprint
4. Prepare board presentation slides for tomorrow's 9am meeting
5. Catch up on AI research papers shared in the team channel`,
  source: "user_notes",
  workspace: "test",
  timestamp: Date.now(),
  metadata: { type: "todo_list" },
};

console.log("Input:");
console.log(testChunk.content);
console.log();

const fabric = createFabricIntegration();

console.log("Initializing fabric...");
const init = await fabric.initialize();
console.log(`✓ Using binary at: ${init.binaryPath}\n`);

console.log("Running fabric pattern: 'summarize'");
console.log("Vendor: LM Studio");
console.log("Model: qwen3.5-0.8b-optiq");
console.log("Processing...\n");

const start = Date.now();

// Run with explicit vendor and model
const result = await fabric.transformChunk(testChunk, "summarize", {
  vendor: "LM Studio",
  model: "qwen3.5-0.8b-optiq",
  stream: false,
});

const duration = Date.now() - start;

console.log(`=== Result (${duration}ms) ===`);
console.log(`Success: ${result.success}`);

if (result.success) {
  console.log(`\n📝 Summarized Output:`);
  console.log(result.chunk.content);
} else {
  console.log(`\n❌ Error: ${result.error}`);
  if (result.cliResult.stderr) {
    console.log(`\nStderr: ${result.cliResult.stderr}`);
  }
}

// Show the command that was run
console.log(`\n🖥️  CLI Command: ${result.cliResult.command}`);
console.log(`Exit code: ${result.cliResult.exitCode}`);
