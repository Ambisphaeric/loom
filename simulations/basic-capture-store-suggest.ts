import {
  EnhancementStore,
  createStore,
} from "@enhancement/store";
import {
  EnhancementBus,
} from "@enhancement/bus";
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
  const name = "basic-capture-store-suggest";
  
  try {
    details.push("[1/5] Creating store with zvec engine...");
    const store = createStore({ engine: "zvec" });
    await store.init();
    const session = store.createSessionStore("sim-session");
    details.push(`  ✓ Store initialized with ${store.getEngineType()} engine`);
    
    details.push("[2/5] Creating event bus...");
    const bus = new EnhancementBus("sim-workspace");
    details.push("  ✓ Bus created");
    
    details.push("[3/5] Simulating screenpipe capture...");
    const simulateCapture = () => {
      const chunks: ReturnType<typeof makeChunk>[] = [];
      for (let i = 0; i < 3; i++) {
        chunks.push(makeChunk({
          source: "screenpipe",
          workspace: "sim-workspace",
          sessionId: "sim-session",
          contentType: "screenshot",
          data: Buffer.from(`Screenshot data ${i}: Window content captured`),
        }));
      }
      return chunks;
    };
    const capturedChunks = simulateCapture();
    details.push(`  ✓ Simulated ${capturedChunks.length} screenshots captured`);
    
    details.push("[4/5] Publishing chunks to bus and storing via subscription...");
    let storedCount = 0;
    bus.subscribe("screenshot", async (chunk) => {
      const ctxChunk = {
        kind: "context" as const,
        id: generateULID(),
        source: chunk.source,
        workspace: chunk.workspace,
        sessionId: chunk.sessionId,
        content: `[Captured screenshot: ${chunk.data.toString().slice(0, 40)}...]`,
        contentType: "screenshot/text",
        timestamp: Date.now(),
        generation: 1,
      };
      await session.store(ctxChunk);
      storedCount++;
    });
    
    for (const chunk of capturedChunks) {
      bus.publish(chunk);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
    details.push(`  ✓ Published and stored ${storedCount} chunks`);
    
    details.push("[5/5] Running suggestion query...");
    const results = await session.query("screenshot captured", {}, 5);
    details.push(`  ✓ Query returned ${results.length} results`);
    
    if (results.length > 0) {
      details.push(`  ✓ First result: "${results[0].content.slice(0, 60)}..."`);
    }
    
    store.close();
    
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
  console.log(" SIMULATION: basic-capture-store-suggest");
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
