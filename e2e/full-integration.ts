import { EnhancementBus, MergeQueue } from "../packages/bus/src/index.js";
import { JoinSynchronizer, createWaitAllJoin, createTimeoutJoin } from "../packages/join-synchronizer/src/index.js";
import { DeferredQueue, type ActionExecutor, type Database } from "../packages/deferred-queue/src/index.js";
import { makeChunk, MockDatabase, MockCredentialProvider } from "../packages/test-harness/src/index.js";
import type { RawChunk, ContextChunk, CredentialProvider } from "../packages/types/src/index.js";

/**
 * E2E Experiment 4: Full Integration - Event-Driven Workflow System
 *
 * This demonstrates a complete workflow where:
 * 1. Deferred actions schedule future tasks
 * 2. Multiple parallel processing branches handle different content types
 * 3. JoinSynchronizer coordinates completion of all branches
 * 4. Results are published back to the bus for downstream consumers
 * 5. Final merged results trigger new deferred actions
 */

console.log("=== E2E Experiment 4: Full Integration Workflow ===\n");

// Define branch IDs for coordination
const MAIN_BRANCH_IDS = ["text-processor", "image-processor", "audio-processor"];
const TIMEOUT_BRANCH_IDS = ["fast-branch"];

// ============================================================================
// Setup
// ============================================================================

const db = new MockDatabase();
const credentials = new MockCredentialProvider();

// Main bus for the workflow
const workflowBus = new EnhancementBus("integration-workflow", {
  capacity: 500,
  onPassthrough: (ctx: ContextChunk) => {
    console.log(`[Passthrough] Storing chunk: ${ctx.id} (${ctx.contentType})`);
  },
  onGenerationExceeded: (ctx: ContextChunk) => {
    console.warn(`[Generation Limit] Chunk ${ctx.id} at generation ${ctx.generation}`);
  },
});

// Deferred queue action executor
const actionExecutor: ActionExecutor = async (
  action: string,
  input: unknown,
  creds: CredentialProvider
) => {
  console.log(`[Deferred] Executing action: ${action}`);
  await new Promise((r) => setTimeout(r, 50));
  return { success: true, output: { action, input } };
};

// Deferred queue for scheduled actions (use DeferredQueue directly)
const deferredQueue = new DeferredQueue(
  db as unknown as Database,
  credentials,
  actionExecutor,
  { checkIntervalMs: 200 }
);

// ============================================================================
// State Tracking
// ============================================================================

const workflowMetrics = {
  chunksProcessed: 0,
  branchesCompleted: 0,
  deferredActionsExecuted: 0,
  mergeEvents: 0,
};

const finalResults: Map<string, RawChunk[]> = new Map();

// ============================================================================
// Bus Subscriptions
// ============================================================================

// Subscribe to raw content from sources
workflowBus.subscribe("content/text", async (chunk: RawChunk) => {
  workflowMetrics.chunksProcessed++;
  console.log(`[Pipeline] Text content from ${chunk.source}: "${chunk.data}"`);
});

workflowBus.subscribe("content/image", async (chunk: RawChunk) => {
  workflowMetrics.chunksProcessed++;
  console.log(`[Pipeline] Image content from ${chunk.source}: ${chunk.data} bytes`);
});

workflowBus.subscribe("content/audio", async (chunk: RawChunk) => {
  workflowMetrics.chunksProcessed++;
  console.log(`[Pipeline] Audio content from ${chunk.source}: ${chunk.data}s duration`);
});

// Subscribe to merged multimedia content
workflowBus.subscribe("content/multimedia", async (chunk: RawChunk) => {
  workflowMetrics.mergeEvents++;
  console.log(`[Pipeline] Merged multimedia ready: ${chunk.source}`);
  workflowMetrics.deferredActionsExecuted++;
});

// Subscribe to workflow completion
workflowBus.subscribe("workflow/complete", async (chunk: RawChunk) => {
  console.log(`\n[Workflow] Completed: ${chunk.data}`);
});

// ============================================================================
// Multi-Source Merger
// ============================================================================

// Set up a MergeQueue for multimedia synchronization
const multimediaMerger = workflowBus.subscribeMultiple(
  ["content/text", "content/image", "content/audio"],
  async (chunks: RawChunk[]) => {
    console.log(`\n[Merger] Combining ${chunks.length} media types`);

    // Create a merged multimedia chunk
    const mergedChunk = makeChunk({
      source: "multimedia-merger",
      contentType: "content/multimedia",
      data: JSON.stringify(chunks.map((c) => ({ type: c.contentType, src: c.source }))),
      sessionId: "integration-session",
    });

    workflowBus.publish(mergedChunk);
  },
  { strategy: "wait-all", timeout: 2000, outputContentType: "content/multimedia" }
);

// ============================================================================
// Parallel Processing with Join
// ============================================================================

async function processContentBranch(
  branchId: string,
  contentType: string,
  items: (string | number)[],
  joinSync: JoinSynchronizer,
  allBranchIds: string[]
): Promise<void> {
  joinSync.registerBranch(branchId);

  console.log(`\n[Branch ${branchId}] Starting processing of ${items.length} items`);

  for (const item of items) {
    // Simulate processing time
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));

    const chunk = makeChunk({
      source: `branch-${branchId}`,
      contentType,
      data: String(item),
      sessionId: "integration-session",
    });

    joinSync.addChunk(branchId, chunk);
    workflowBus.publish(chunk);
  }

  joinSync.markComplete(branchId);
  workflowMetrics.branchesCompleted++;
  console.log(`[Branch ${branchId}] Completed`);
}

// ============================================================================
// Main Workflow Execution
// ============================================================================

async function runExperiment(): Promise<void> {
  console.log("Initializing workflow...\n");

  // Start the deferred queue processing loop
  deferredQueue.start();

  // Create join synchronizer for coordinating all branches
  const workflowJoin = createWaitAllJoin({ continueOnError: true });

  // Launch parallel processing branches
  const branches = [
    // Text processing branch
    processContentBranch(
      MAIN_BRANCH_IDS[0],
      "content/text",
      ["Hello world", "This is a test", "Processing complete"],
      workflowJoin,
      MAIN_BRANCH_IDS
    ),

    // Image processing branch
    processContentBranch(
      MAIN_BRANCH_IDS[1],
      "content/image",
      ["img-001.jpg (24KB)", "img-002.jpg (18KB)", "img-003.jpg (32KB)"],
      workflowJoin,
      MAIN_BRANCH_IDS
    ),

    // Audio processing branch
    processContentBranch(
      MAIN_BRANCH_IDS[2],
      "content/audio",
      ["audio-001.wav (5.2s)", "audio-002.wav (3.8s)"],
      workflowJoin,
      MAIN_BRANCH_IDS
    ),
  ];

  // Also launch a timeout-based branch for time-sensitive content
  const timeoutJoin = createTimeoutJoin(500, true);

  const timeSensitiveBranch = processContentBranch(
    TIMEOUT_BRANCH_IDS[0],
    "content/text",
    ["Quick message"],
    timeoutJoin,
    TIMEOUT_BRANCH_IDS
  );

  // Wait for all branches to complete
  console.log("\n--- Waiting for all branches to complete ---\n");
  await Promise.all([...branches, timeSensitiveBranch]);

  // Give the bus time to process all messages
  await new Promise((r) => setTimeout(r, 500));

  // Collect results from join synchronizers
  const mainResults = await workflowJoin.join(MAIN_BRANCH_IDS);
  const timeoutResults = await timeoutJoin.join(TIMEOUT_BRANCH_IDS);

  console.log("\n--- Workflow Results ---");
  console.log(`Main workflow branches: ${mainResults.size}`);
  for (const [branchId, chunks] of mainResults.entries()) {
    console.log(`  ${branchId}: ${chunks.length} chunks`);
    finalResults.set(branchId, chunks);
  }

  console.log(`Timeout-based branches: ${timeoutResults.size}`);
  for (const [branchId, chunks] of timeoutResults.entries()) {
    console.log(`  ${branchId}: ${chunks.length} chunks`);
  }

  // Publish workflow completion
  workflowBus.publish(
    makeChunk({
      source: "workflow-orchestrator",
      contentType: "workflow/complete",
      data: `Processed ${workflowMetrics.chunksProcessed} chunks across ${workflowMetrics.branchesCompleted} branches`,
      sessionId: "integration-session",
    })
  );

  // Wait for deferred actions to execute
  await new Promise((r) => setTimeout(r, 300));

  console.log("\n--- Metrics ---");
  console.log(`Chunks processed: ${workflowMetrics.chunksProcessed}`);
  console.log(`Branches completed: ${workflowMetrics.branchesCompleted}`);
  console.log(`Merge events: ${workflowMetrics.mergeEvents}`);
  console.log(`Deferred actions executed: ${workflowMetrics.deferredActionsExecuted}`);
  console.log(`Bus subscribers: ${workflowBus.subscriberCount}`);
  console.log(`Subscriber content types: ${workflowBus.contentTypes.join(", ")}`);

  // Cleanup
  multimediaMerger();
  deferredQueue.stop();

  console.log("\n✅ Experiment 4 completed successfully");
  console.log("\nThis experiment demonstrated:");
  console.log("  1. Deferred queue scheduling future actions");
  console.log("  2. Bus routing messages between components");
  console.log("  3. MergeQueue combining multiple content types");
  console.log("  4. JoinSynchronizer coordinating parallel branches");
  console.log("  5. Event-driven workflow with feedback loops");
}

// Run if executed directly
if (import.meta.main) {
  runExperiment().catch(console.error);
}

export { runExperiment, workflowMetrics };
