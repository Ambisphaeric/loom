import { EnhancementBus } from "../packages/bus/src/index.js";
import { DeferredQueue, type DeferredAction, type DeferredActionStatus, type ActionExecutor, type Database } from "../packages/deferred-queue/src/index.js";
import { makeChunk, MockCredentialProvider, MockDatabase } from "../packages/test-harness/src/index.js";
import type { RawChunk, CredentialProvider } from "../packages/types/src/index.js";

/**
 * E2E Experiment 2: Deferred Action Workflow
 *
 * Demonstrates:
 * - DeferredQueue scheduling actions
 * - Actions that publish to the bus when executed
 * - Credential provider integration for secure actions
 */

console.log("=== E2E Experiment 2: Deferred Action Workflow ===\n");

// Setup mock dependencies
const db = new MockDatabase();
const credentials = new MockCredentialProvider();
const bus = new EnhancementBus("e2e-deferred", {
  capacity: 50,
});

// Track executed actions
const executedActions: string[] = [];

// Define an action executor that publishes to the bus
const actionExecutor: ActionExecutor = async (
  action: string,
  input: unknown,
  creds: CredentialProvider
) => {
  console.log(`[Execute] Running action: ${action}`);

  try {
    // Simulate action execution
    await new Promise((r) => setTimeout(r, 100));

    // Publish completion to bus
    bus.publish(
      makeChunk({
        source: "deferred-executor",
        contentType: "action/completed",
        data: `${action}:${JSON.stringify(input)}`,
        sessionId: "e2e-workspace",
      })
    );

    executedActions.push(action);
    console.log(`[Execute] Action ${action} completed`);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bus.publish(
      makeChunk({
        source: "deferred-executor",
        contentType: "action/failed",
        data: `${action}:${errorMessage}`,
        sessionId: "e2e-workspace",
      })
    );
    return { success: false, error: errorMessage };
  }
};

// Create deferred queue with proper constructor
const queue = new DeferredQueue(
  db as unknown as Database,
  credentials,
  actionExecutor,
  { checkIntervalMs: 200 }
);

// Subscribe to action results on the bus
bus.subscribe("action/completed", async (chunk: RawChunk) => {
  console.log(`[Bus] Action completed: ${chunk.data}`);
});

bus.subscribe("action/failed", async (chunk: RawChunk) => {
  console.log(`[Bus] Action failed: ${chunk.data}`);
});

// Run the experiment
async function runExperiment(): Promise<void> {
  console.log("Enqueuing deferred actions...\n");

  // Start the queue processing loop
  queue.start();

  // Enqueue several actions with different delays
  const action1 = await queue.enqueue(
    "send-notification",
    { message: "Hello from deferred queue!" },
    "e2e-workspace",
    { delayMs: 200, maxRetries: 1 }
  );
  console.log(`[Queue] Enqueued: ${action1} (delay: 200ms)`);

  const action2 = await queue.enqueue(
    "process-data",
    { batchId: "batch-123" },
    "e2e-workspace",
    { delayMs: 400, maxRetries: 1 }
  );
  console.log(`[Queue] Enqueued: ${action2} (delay: 400ms)`);

  const action3 = await queue.enqueue(
    "cleanup-temp",
    { files: ["/tmp/a", "/tmp/b"] },
    "e2e-workspace",
    { delayMs: 100, maxRetries: 1 }
  );
  console.log(`[Queue] Enqueued: ${action3} (delay: 100ms)`);

  console.log("\nWaiting for actions to execute...\n");

  // Wait for all actions to complete (enough time for longest delay + processing)
  await new Promise((r) => setTimeout(r, 800));

  console.log("\n--- Results ---");
  console.log(`Total actions enqueued: 3`);
  console.log(`Actions executed: ${executedActions.length}`);
  console.log("Executed:");
  executedActions.forEach((name) => console.log(`  - ${name}`));

  // Cleanup
  queue.stop();

  console.log("\n✅ Experiment 2 completed successfully");
}

// Run if executed directly
if (import.meta.main) {
  runExperiment().catch(console.error);
}

export { runExperiment };
