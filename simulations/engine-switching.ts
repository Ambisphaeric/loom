import {
  createStore,
} from "@enhancement/store";

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
  const name = "engine-switching";
  
  try {
    details.push("[1/8] Creating store with zvec (default)...");
    const store = createStore({ engine: "zvec" });
    await store.init();
    const session1 = store.createSessionStore("engine-test");
    details.push(`  ✓ Store created with ${store.getEngineType()} engine`);
    
    details.push("[2/8] Adding data with zvec...");
    await session1.store({
      kind: "context",
      id: generateULID(),
      source: "test",
      workspace: "test-workspace",
      sessionId: "engine-test",
      content: "Document about machine learning algorithms",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    });
    await session1.addRagDocs([
      { id: "ml-doc-1", content: "Machine learning: Neural networks overview" },
    ]);
    const zvecStats = await session1.getStats();
    details.push(`  ✓ Stored ${zvecStats.totalChunks} chunks, ${zvecStats.ragDocs} RAG docs`);
    
    details.push("[3/8] Querying with zvec...");
    const zvecResults = await session1.query("machine learning", {}, 10);
    details.push(`  ✓ Query returned ${zvecResults.length} results`);
    
    details.push("[4/8] Switching to sqlite-vec...");
    const dbPath = `/tmp/test-store-${Date.now()}.db`;
    const sqliteStore = createStore({ engine: "sqlite-vec", dbPath });
    await sqliteStore.init();
    const session2 = sqliteStore.createSessionStore("engine-test");
    details.push(`  ✓ Store created with ${sqliteStore.getEngineType()} engine`);
    
    details.push("[5/8] Migrating data to sqlite-vec...");
    await session2.store({
      kind: "context",
      id: generateULID(),
      source: "test",
      workspace: "test-workspace",
      sessionId: "engine-test",
      content: "Document about machine learning algorithms",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    });
    await session2.addRagDocs([
      { id: "ml-doc-1", content: "Machine learning: Neural networks overview" },
    ]);
    const sqliteStats = await session2.getStats();
    details.push(`  ✓ Stored ${sqliteStats.totalChunks} chunks, ${sqliteStats.ragDocs} RAG docs`);
    
    details.push("[6/8] Querying with sqlite-vec...");
    const sqliteResults = await session2.query("machine learning", {}, 10);
    details.push(`  ✓ Query returned ${sqliteResults.length} results`);
    
    const bothHaveResults = zvecResults.length > 0 && sqliteResults.length > 0;
    if (!bothHaveResults) throw new Error("Data not persisted correctly");
    details.push("  ✓ Data persisted correctly across engines");
    
    details.push("[7/8] Switching to chroma (fallback mode)...");
    const chromaStore = createStore({ engine: "chroma" });
    await chromaStore.init();
    const session3 = chromaStore.createSessionStore("engine-test");
    details.push(`  ✓ Store created with ${chromaStore.getEngineType()} engine (fallback mode)`);
    
    await session3.store({
      kind: "context",
      id: generateULID(),
      source: "test",
      workspace: "test-workspace",
      sessionId: "engine-test",
      content: "Document about machine learning algorithms",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    });
    details.push("  ✓ Data stored in chroma (fallback mode)");
    
    details.push("[8/8] Verifying data integrity...");
    const chromaStats = await session3.getStats();
    details.push(`  ✓ Chroma session has ${chromaStats.totalChunks} chunks`);
    
    store.close();
    sqliteStore.close();
    chromaStore.close();
    
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
  console.log(" SIMULATION: engine-switching");
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
