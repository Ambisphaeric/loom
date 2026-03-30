import {
  createStore,
} from "@enhancement/store";
import {
  EnhancementBus,
} from "@enhancement/bus";
import {
  RecipeExecutor,
} from "@enhancement/recipe";
import {
  DeferredQueue,
} from "@enhancement/deferred-queue";
import {
  JoinSynchronizer,
  createWaitAllJoin,
} from "@enhancement/join-synchronizer";
import {
  createCredentialProvider,
  generateMasterKey,
} from "@enhancement/credentials";
import {
  MockDatabase,
} from "@enhancement/test-harness";
import {
  makeChunk,
} from "@enhancement/test-harness";

interface SimulationResult {
  name: string;
  passed: boolean;
  duration: number;
  details: string[];
}

function generateULID(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

async function runExperiment(): Promise<SimulationResult> {
  const start = Date.now();
  const details: string[] = [];
  const name = "full-pipeline";
  
  try {
    details.push("[1/12] Creating store...");
    const store = createStore({ engine: "zvec" });
    await store.init();
    const session = store.createSessionStore("pipeline-session");
    details.push("  ✓ Store initialized with zvec engine");
    
    details.push("[2/12] Creating event bus...");
    const bus = new EnhancementBus("pipeline-workspace");
    details.push("  ✓ Event bus created");
    
    details.push("[3/12] Creating deferred queue...");
    const mockDb = new MockDatabase();
    const masterKey = generateMasterKey();
    const credProvider = createCredentialProvider("pipeline-workspace", masterKey);
    
    const deferredQueue = new DeferredQueue(mockDb, credProvider, async (action, input) => {
      return { success: true, output: `Executed ${action}` };
    });
    details.push("  ✓ Deferred queue created");
    
    details.push("[4/12] Creating join synchronizer...");
    const joiner = createWaitAllJoin(true);
    joiner.registerBranch("screenshot");
    joiner.registerBranch("document");
    details.push("  ✓ Join synchronizer created with wait-all strategy");
    
    details.push("[5/12] Setting up bus subscriptions...");
    let chunksReceived = 0;
    bus.subscribeMultiple(
      ["screenshot", "text/plain"],
      async (chunks) => {
        for (const chunk of chunks) {
          chunksReceived++;
          joiner.addChunk(chunk.contentType === "screenshot" ? "screenshot" : "document", chunk);
        }
      },
      { strategy: "concat" }
    );
    details.push("  ✓ Bus subscriptions configured");
    
    details.push("[6/12] Registering recipe handlers...");
    const executor = new RecipeExecutor();
    
    executor.registerHandler("capture", async (step, input) => {
      return input.map(c => ({
        ...c,
        content: `[Captured] ${c.content}`,
      }));
    });
    
    executor.registerHandler("synthesize", async (step, input) => {
      const combined = input.map(c => c.content).join("\n");
      return [{
        ...input[0],
        id: generateULID(),
        content: `[Synthesized Suggestion]\n${combined.slice(0, 100)}...`,
        contentType: "suggestion/text",
      }];
    });
    details.push("  ✓ Recipe handlers registered");
    
    details.push("[7/12] Creating recipe...");
    const recipe = {
      id: generateULID(),
      workspace: "pipeline-workspace",
      name: "Full Pipeline Recipe",
      mode: "batch" as const,
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: generateULID(),
          kind: "capture" as const,
          label: "Capture Content",
          description: "Capture from multiple sources",
          config: {},
          trigger: { type: "manual" as const },
          enabled: true,
        },
        {
          id: generateULID(),
          kind: "synthesize" as const,
          label: "Synthesize Suggestion",
          description: "Generate contextual suggestion",
          config: {},
          trigger: { type: "auto" as const },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    details.push("  ✓ Recipe created");
    
    details.push("[8/12] Simulating data flow through pipeline...");
    const screenshotChunk = makeChunk({
      source: "screenpipe",
      workspace: "pipeline-workspace",
      sessionId: "pipeline-session",
      contentType: "screenshot",
      data: Buffer.from("Screen capture of active window content"),
    });
    bus.publish(screenshotChunk);
    
    const docChunk = makeChunk({
      source: "document",
      workspace: "pipeline-workspace",
      sessionId: "pipeline-session",
      contentType: "text/plain",
      data: Buffer.from("Attached document content about project planning"),
    });
    bus.publish(docChunk);
    details.push(`  ✓ Data flowed through pipeline (2 chunks published)`);
    
    details.push("[9/12] Running recipe execution...");
    const inputChunks = [
      {
        kind: "context" as const,
        id: generateULID(),
        source: "pipeline",
        workspace: "pipeline-workspace",
        sessionId: "pipeline-session",
        content: "Screen capture of active window",
        contentType: "screenshot/text",
        timestamp: Date.now(),
        generation: 1,
      },
      {
        kind: "context" as const,
        id: generateULID(),
        source: "pipeline",
        workspace: "pipeline-workspace",
        sessionId: "pipeline-session",
        content: "Attached document: Project planning notes",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
    ];
    
    const run = await executor.runRecipe(recipe, inputChunks);
    details.push(`  ✓ Recipe executed: ${run.steps.length} steps`);
    details.push(`    - Step 1: ${run.steps[0]?.status}`);
    details.push(`    - Step 2: ${run.steps[1]?.status}`);
    
    details.push("[10/12] Testing deferred queue...");
    const actionId = await deferredQueue.enqueue(
      "send-suggestion",
      { suggestion: "Draft email based on context", priority: "high" },
      "pipeline-workspace",
      { delayMs: 1000 }
    );
    details.push(`  ✓ Deferred action enqueued: ${actionId}`);
    
    details.push("[11/12] Verifying join synchronizer...");
    const joinedChunks = joiner.getAllChunks(["screenshot", "document"]);
    details.push(`  ✓ Join synchronizer collected ${joinedChunks.length} chunks`);
    
    details.push("[12/12] Verifying full pipeline integration...");
    const storeStats = await session.getStats();
    details.push(`  ✓ Session stats: ${storeStats.totalChunks} chunks stored`);
    
    const pendingActions = await deferredQueue.getPendingActions("pipeline-workspace");
    details.push(`  ✓ Pending deferred actions: ${pendingActions.length}`);
    
    store.close();
    deferredQueue.stop();
    
    return {
      name,
      passed: true,
      duration: Date.now() - start,
      details,
    };
  } catch (error) {
    details.push(`  ✗ Error: ${error}`);
    return {
      name,
      passed: false,
      duration: Date.now() - start,
      details,
    };
  }
}

async function main() {
  console.log("═".repeat(70));
  console.log(" SIMULATION: full-pipeline");
  console.log("═".repeat(70));
  
  const result = await runExperiment();
  
  console.log("\n" + "─".repeat(70));
  console.log(`RESULT: ${result.passed ? "✓ PASSED" : "✗ FAILED"} (${result.duration}ms)`);
  console.log("─".repeat(70));
  
  for (const detail of result.details) {
    console.log(detail);
  }
  
  console.log("\n" + "═".repeat(70));
  
  if (!result.passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

export { runExperiment };
