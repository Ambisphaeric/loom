import { EnhancementBus, type MergeQueueOptions } from "../packages/bus/src/index.js";
import { JoinSynchronizer, createBarrierJoin, createWaitAnyJoin } from "../packages/join-synchronizer/src/index.js";
import { makeChunk } from "../packages/test-harness/src/index.js";
import type { RawChunk } from "../packages/types/src/index.js";

/**
 * E2E Experiment 3: Parallel Data Processing with Join Strategies
 *
 * Demonstrates:
 * - Multiple parallel processing branches
 * - Different join strategies (barrier, wait-any)
 * - Bus-based communication between branches
 * - Merging partial results
 */

console.log("=== E2E Experiment 3: Parallel Data Processing ===\n");

interface ProcessingResult {
  branchId: string;
  chunks: RawChunk[];
  completedAt?: number;
}

// Define branch IDs for coordination
const BARRIER_BRANCH_IDS = ["fast-branch", "medium-branch", "slow-branch"];
const WAITANY_BRANCH_IDS = ["quick-branch", "delayed-branch"];

// Create bus for inter-branch communication
const bus = new EnhancementBus("e2e-parallel", {
  capacity: 200,
});

// Track all processing results
const allResults: ProcessingResult[] = [];

// Create two different join synchronizers with different strategies
const barrierJoin = createBarrierJoin(3, true);
const waitAnyJoin = createWaitAnyJoin();

// Subscribe to processed chunks
bus.subscribe("processing/complete", async (chunk: RawChunk) => {
  const [branchId, resultData] = String(chunk.data).split(":");
  console.log(`[Bus] Branch ${branchId} completed: ${resultData}`);
});

// Simulate a processing branch
async function processContentBranch(
  branchId: string,
  contentType: string,
  items: (string | number)[],
  joinSync: JoinSynchronizer,
  allBranchIds: string[]
): Promise<void> {
  joinSync.registerBranch(branchId);

  console.log(`\n[Branch ${branchId}] Starting processing of ${items.length} items`);

  for (let i = 0; i < items.length; i++) {
    // Simulate processing time
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));

    const chunk = makeChunk({
      source: `processor-${branchId}`,
      contentType,
      data: String(items[i]),
      sessionId: "parallel-session",
    });

    joinSync.addChunk(branchId, chunk);
    bus.publish(chunk);
  }

  joinSync.markComplete(branchId);
  console.log(`[Branch ${branchId}] Completed`);

  // Publish completion
  bus.publish(
    makeChunk({
      source: `complete-${branchId}`,
      contentType: "processing/complete",
      data: `${branchId}:done`,
      sessionId: "parallel-session",
    })
  );
}

// Run the experiment
async function runExperiment(): Promise<void> {
  console.log("Starting parallel processing with barrier strategy...\n");

  // Launch parallel branches with barrier join (waits for 3 chunks from each)
  const barrierBranches = [
    processContentBranch(BARRIER_BRANCH_IDS[0], "sensor/temp", ["a1", "a2", "a3"], barrierJoin, BARRIER_BRANCH_IDS),
    processContentBranch(BARRIER_BRANCH_IDS[1], "sensor/humidity", ["b1", "b2", "b3", "b4"], barrierJoin, BARRIER_BRANCH_IDS),
    processContentBranch(BARRIER_BRANCH_IDS[2], "sensor/pressure", ["c1", "c2", "c3", "c4", "c5"], barrierJoin, BARRIER_BRANCH_IDS),
  ];

  // Wait for barrier join to complete
  await Promise.all(barrierBranches);

  console.log("\n--- Barrier Join Results ---");
  const barrierResult = await barrierJoin.join(BARRIER_BRANCH_IDS);
  console.log(`Branches completed: ${barrierResult.size}`);
  for (const [branchId, chunks] of barrierResult.entries()) {
    console.log(`  ${branchId}: ${chunks.length} chunks`);
    allResults.push({ branchId, chunks, completedAt: Date.now() });
  }

  console.log("\n--- Wait-Any Join Experiment ---\n");

  // Reset and try wait-any strategy
  const waitAnyBranches = [
    processContentBranch(WAITANY_BRANCH_IDS[0], "text/fast", ["x1", "x2"], waitAnyJoin, WAITANY_BRANCH_IDS),
    processContentBranch(WAITANY_BRANCH_IDS[1], "text/slow", ["y1", "y2", "y3"], waitAnyJoin, WAITANY_BRANCH_IDS),
  ];

  await Promise.all(waitAnyBranches);

  console.log("\n--- Wait-Any Join Results ---");
  const waitAnyResult = await waitAnyJoin.join(WAITANY_BRANCH_IDS);
  console.log(`Branches completed: ${waitAnyResult.size}`);
  for (const [branchId, chunks] of waitAnyResult.entries()) {
    console.log(`  ${branchId}: ${chunks.length} chunks`);
  }

  // Get first completed branch (demonstrates wait-any behavior)
  const firstCompleted = waitAnyJoin.getFirstCompletedChunks(WAITANY_BRANCH_IDS);
  if (firstCompleted) {
    console.log(`\nFirst completed branch: ${firstCompleted.branchId} with ${firstCompleted.chunks.length} chunks`);
  }

  console.log("\n--- Final Summary ---");
  console.log(`Total branches processed: ${allResults.length + waitAnyResult.size}`);
  console.log(`Bus handled messages across all branches`);

  console.log("\n✅ Experiment 3 completed successfully");
}

// Run if executed directly
if (import.meta.main) {
  runExperiment().catch(console.error);
}

export { runExperiment };
