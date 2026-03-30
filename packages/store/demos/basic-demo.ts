import { createStore, getEngineInfo, type VectorEngine } from "../src/index.js";
import type { ContextChunk } from "@enhancement/types";

console.log("=== Enhancement Store Demo ===\n");

console.log("Available Vector Engines:");
for (const engine of ["zvec", "sqlite-vec", "chroma"] as VectorEngine[]) {
	const info = getEngineInfo(engine);
	console.log(`  - ${engine}: ${info.description} ${info.default ? "(default)" : ""}`);
}
console.log();

async function demoBasicStore() {
	console.log("--- Demo 1: Basic Store Operations ---\n");

	const store = createStore({ engine: "zvec", dbPath: ":memory:" });
	await store.init();

	console.log("Store initialized with zvec engine\n");

	const screenshotChunk: ContextChunk = {
		kind: "context",
		id: "screenshot-1",
		source: "screenpipe",
		workspace: "demo-ws",
		sessionId: "demo-session",
		content: "User is viewing a React component with a blue button and header text 'Welcome'",
		contentType: "screenshot",
		timestamp: Date.now(),
		generation: 0,
		metadata: {
			windowTitle: "VS Code",
			appName: "Code",
		},
	};

	const docChunk: ContextChunk = {
		kind: "context",
		id: "doc-1",
		source: "rag",
		workspace: "demo-ws",
		sessionId: "demo-session",
		content: "React best practices: Use functional components with hooks. Keep components small and focused.",
		contentType: "document",
		timestamp: Date.now() - 1000,
		generation: 0,
	};

	console.log("Storing screenshot chunk...");
	await store.store(screenshotChunk);
	console.log(`  Stored: ${screenshotChunk.id}`);

	console.log("Storing document chunk...");
	await store.store(docChunk);
	console.log(`  Stored: ${docChunk.id}`);

	console.log("\nQuerying for 'React'...");
	const results = await store.query("React", {});
	console.log(`  Found ${results.length} results:`);
	for (const result of results) {
		console.log(`    - [${result.contentType}] ${result.content.slice(0, 60)}...`);
	}

	console.log("\nScanning all chunks...");
	const scanResult = await store.scan("", {});
	console.log(`  Total chunks: ${scanResult.chunks.length}`);
	for (const chunk of scanResult.chunks) {
		console.log(`    - ${chunk.id}: ${chunk.contentType}`);
	}

	console.log("\nUpdating profile...");
	await store.updateProfile({
		workspace: "demo-ws",
		summary: "Demo workspace with React and screenshot content",
		frequentActions: ["view_code", "edit_document"],
		dismissedPatterns: ["test_pattern"],
		lastUpdated: Date.now(),
	});

	const profile = await store.getProfile("demo-ws");
	console.log(`  Profile summary: ${profile.summary}`);
	console.log(`  Frequent actions: ${profile.frequentActions.join(", ")}`);

	store.close();
	console.log("\n✓ Basic store demo complete\n");
}

async function demoSessionStore() {
	console.log("--- Demo 2: Per-Session RAG ---\n");

	const store = createStore({ engine: "zvec", dbPath: ":memory:" });
	await store.init();

	const sessionStore = store.createSessionStore("user-research-session");

	console.log("Adding RAG documents...");
	await sessionStore.addRagDocs([
		{
			id: "rag-1",
			content: "Machine Learning: A subset of AI that enables systems to learn from data",
			metadata: { category: "technology", source: "textbook" },
		},
		{
			id: "rag-2",
			content: "Deep Learning: Neural networks with multiple layers for complex pattern recognition",
			metadata: { category: "technology", source: "textbook" },
		},
		{
			id: "rag-3",
			content: "Natural Language Processing: AI technique for understanding human language",
			metadata: { category: "technology", source: "article" },
		},
	]);

	console.log("  Added 3 RAG documents");

	const stats = await sessionStore.getStats();
	console.log(`\nSession stats:`);
	console.log(`  Total chunks: ${stats.totalChunks}`);
	console.log(`  RAG docs: ${stats.ragDocs}`);

	console.log("\nQuerying session store...");
	const results = await sessionStore.query("neural networks");
	console.log(`  Found ${results.length} results for 'neural networks'`);
	for (const result of results) {
		console.log(`    - ${result.content.slice(0, 70)}...`);
	}

	console.log("\nRemoving one RAG document...");
	await sessionStore.removeRagDocs(["rag-1"]);

	const updatedStats = await sessionStore.getStats();
	console.log(`  RAG docs after removal: ${updatedStats.ragDocs}`);

	store.close();
	console.log("\n✓ Session store demo complete\n");
}

async function demoCanonicalWiring() {
	console.log("--- Demo 3: Canonical Wiring (Screenshot + Document -> Store) ---\n");

	const store = createStore({ engine: "zvec", dbPath: ":memory:" });
	await store.init();

	console.log("Step 1: Simulating screen capture");
	const screenshotChunk: ContextChunk = {
		kind: "context",
		id: `screenshot-${Date.now()}`,
		source: "screenpipe",
		workspace: "canonical-demo",
		sessionId: "session-1",
		content: "Code editor showing TypeScript function with error: 'Type string is not assignable to type number'",
		contentType: "screenshot",
		timestamp: Date.now(),
		generation: 0,
		metadata: {
			windowTitle: "VS Code - index.ts",
			appName: "Code",
			lineNumber: 42,
		},
	};
	await store.store(screenshotChunk);
	console.log("  Stored screenshot chunk with error context\n");

	console.log("Step 2: Simulating document attachment");
	const docs = [
		{
			id: "doc-typescript-101",
			content: "TypeScript Type System: TypeScript uses structural typing. 'string' and 'number' are distinct types.",
			metadata: { source: "typescript-handbook" },
		},
		{
			id: "doc-fix-type-errors",
			content: "Common Fix: Ensure the type on the left matches the type on the right. Use type assertions if needed.",
			metadata: { source: "typescript-handbook" },
		},
	];
	await store.store({
		kind: "context",
		id: docs[0].id,
		source: "document",
		workspace: "canonical-demo",
		sessionId: "session-1",
		content: docs[0].content,
		contentType: "document",
		timestamp: Date.now(),
		generation: 0,
		metadata: docs[0].metadata,
	});
	await store.store({
		kind: "context",
		id: docs[1].id,
		source: "document",
		workspace: "canonical-demo",
		sessionId: "session-1",
		content: docs[1].content,
		contentType: "document",
		timestamp: Date.now(),
		generation: 0,
		metadata: docs[1].metadata,
	});
	console.log("  Attached 2 documents\n");

	console.log("Step 3: Querying for contextual suggestions");
	const results = await store.query("TypeScript type error fix", {});
	console.log(`  Found ${results.length} relevant chunks:`);
	for (const result of results) {
		console.log(`    [${result.source}] ${result.content.slice(0, 80)}...`);
	}

	console.log("\nStep 4: Generating simple suggestion");
	if (results.length > 0) {
		const topResult = results[0];
		console.log(`  Suggestion: Based on "${topResult.content.slice(0, 50)}..."`);
		console.log(`  Action: Review TypeScript type compatibility in your code`);
	}

	store.close();
	console.log("\n✓ Canonical wiring demo complete\n");
}

await demoBasicStore();
await demoSessionStore();
await demoCanonicalWiring();

console.log("=== All Demos Complete ===");
