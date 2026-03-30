import { EnhancementBus, MergeQueue } from "../packages/bus/src/index.js";
import { JoinSynchronizer, createWaitAllJoin } from "../packages/join-synchronizer/src/index.js";
import { makeChunk } from "../packages/test-harness/src/index.js";
import type { RawChunk } from "../packages/types/src/index.js";

/**
 * E2E Experiment 1: Multi-Source Data Pipeline
 *
 * Demonstrates:
 * - Bus receiving data from multiple content types
 * - MergeQueue combining data from multiple sources
 * - JoinSynchronizer coordinating parallel processing branches
 */

console.log("=== E2E Experiment 1: Multi-Source Data Pipeline ===\n");

// Create a bus instance
const bus = new EnhancementBus("e2e-pipeline", {
  capacity: 100,
  onPassthrough: (ctx) => console.log(`[Passthrough] ${ctx.contentType}: ${ctx.id}`),
});

// Track merged results
const mergedResults: RawChunk[][] = [];

// Set up multi-source subscription with merge queue
const unsubscribe = bus.subscribeMultiple(
  ["sensor/temperature", "sensor/humidity", "sensor/pressure"],
  async (chunks: RawChunk[]) => {
    console.log(`[Merge] Received ${chunks.length} chunks:`);
    chunks.forEach((c) => console.log(`  - ${c.source}: ${c.data} (${c.contentType})`));
    mergedResults.push(chunks);
  },
  { strategy: "zip", timeout: 1000, outputContentType: "sensor/combined" }
);

// Define branch IDs for join coordination
const BRANCH_IDS = ["temperature-branch", "humidity-branch", "pressure-branch"];

// Create a join synchronizer for parallel processing branches
const joinSync = createWaitAllJoin({ continueOnError: true });

// Simulate sensor data streams
async function simulateSensorStream(
  source: string,
  contentType: string,
  values: (string | number)[],
  delayMs: number,
  branchId: string
): Promise<void> {
  joinSync.registerBranch(branchId);

  for (const value of values) {
    await new Promise((r) => setTimeout(r, delayMs));
    const chunk = makeChunk({
      source,
      contentType,
      data: String(value),
      sessionId: "sensor-session-1",
    });
    bus.publish(chunk);
    joinSync.addChunk(branchId, chunk);
    console.log(`[Publish] ${source}: ${value}`);
  }

  joinSync.markComplete(branchId);
}

// Run the experiment
async function runExperiment(): Promise<void> {
  console.log("Starting parallel sensor streams...\n");

  // Launch parallel sensor streams (simulating different data sources)
  const streams = [
    simulateSensorStream("temp-sensor", "sensor/temperature", [22.5, 23.0, 23.5], 100, BRANCH_IDS[0]),
    simulateSensorStream("humidity-sensor", "sensor/humidity", [45, 50, 55], 150, BRANCH_IDS[1]),
    simulateSensorStream("pressure-sensor", "sensor/pressure", [1013, 1014, 1015], 200, BRANCH_IDS[2]),
  ];

  // Wait for all streams to complete
  await Promise.all(streams);

  // Give the bus time to process
  await new Promise((r) => setTimeout(r, 500));

  console.log("\n--- Results ---");
  console.log(`Merged results captured: ${mergedResults.length}`);
  console.log(`Bus subscriber count: ${bus.subscriberCount}`);
  console.log(`Join synchronizer branches: ${BRANCH_IDS.length}`);

  // Wait for join to complete
  const result = await joinSync.join(BRANCH_IDS);
  console.log(`\nJoin completed. Branch results: ${result.size}`);
  for (const [branchId, chunks] of result.entries()) {
    console.log(`  ${branchId}: ${chunks.length} chunks`);
  }

  // Cleanup
  unsubscribe();
  console.log("\n✅ Experiment 1 completed successfully");
}

// Run if executed directly
if (import.meta.main) {
  runExperiment().catch(console.error);
}

export { runExperiment };
