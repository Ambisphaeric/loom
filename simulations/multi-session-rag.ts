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
  const name = "multi-session-rag";
  
  try {
    details.push("[1/7] Creating store...");
    const store = createStore({ engine: "zvec" });
    await store.init();
    details.push("  ✓ Store initialized");
    
    details.push("[2/7] Creating session stores for two sessions...");
    const session1 = store.createSessionStore("session-alpha");
    const session2 = store.createSessionStore("session-beta");
    details.push("  ✓ Created session-alpha and session-beta stores");
    
    details.push("[3/7] Adding RAG docs to session-alpha...");
    await session1.addRagDocs([
      { id: "doc-a1", content: "Alpha project documentation: Meeting notes from Q1 planning" },
      { id: "doc-a2", content: "Alpha project: Technical architecture overview" },
      { id: "doc-a3", content: "Alpha project: API integration guide" },
    ]);
    const stats1Before = await session1.getStats();
    details.push(`  ✓ Added 3 docs to session-alpha (total RAG docs: ${stats1Before.ragDocs})`);
    
    details.push("[4/7] Adding RAG docs to session-beta...");
    await session2.addRagDocs([
      { id: "doc-b1", content: "Beta project: Sprint retrospective summary" },
      { id: "doc-b2", content: "Beta project: User research findings" },
    ]);
    const stats2Before = await session2.getStats();
    details.push(`  ✓ Added 2 docs to session-beta (total RAG docs: ${stats2Before.ragDocs})`);
    
    details.push("[5/7] Verifying session isolation...");
    const alphaStats = await session1.getStats();
    const betaStats = await session2.getStats();
    details.push(`  ✓ Session-alpha has ${alphaStats.ragDocs} RAG docs`);
    details.push(`  ✓ Session-beta has ${betaStats.ragDocs} RAG docs`);
    
    if (alphaStats.ragDocs !== 3) throw new Error("Session-alpha should have 3 docs");
    if (betaStats.ragDocs !== 2) throw new Error("Session-beta should have 2 docs");
    details.push("  ✓ Session isolation verified by RAG doc counts");
    
    details.push("[6/7] Removing RAG docs from session-alpha...");
    await session1.removeRagDocs(["doc-a1", "doc-a2"]);
    const stats1After = await session1.getStats();
    details.push(`  ✓ Removed 2 docs from session-alpha (RAG docs now: ${stats1After.ragDocs})`);
    
    details.push("[7/7] Verifying session independence after modifications...");
    const alphaStatsAfter = await session1.getStats();
    const betaStatsAfter = await session2.getStats();
    
    if (alphaStatsAfter.ragDocs !== 1) throw new Error("Session-alpha should have 1 doc after removal");
    if (betaStatsAfter.ragDocs !== 2) throw new Error("Session-beta should still have 2 docs");
    details.push("  ✓ Session-alpha now has 1 doc (after removal)");
    details.push("  ✓ Session-beta unchanged at 2 docs");
    
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
  console.log(" SIMULATION: multi-session-rag");
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
