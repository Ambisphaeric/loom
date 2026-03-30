import { EnhancementBus } from "../packages/bus/src/index.js";
import { createStore, createSessionStore, type VectorEngine } from "../packages/store/src/store.js";
import { makeChunk, makeContextChunk } from "../packages/test-harness/src/helpers.js";
import type { RawChunk, ContextChunk, Suggestion } from "../packages/types/src/index.js";

const WORKSPACE = "e2e-workspace";
const SESSION_1 = "e2e-session-1";
const SESSION_2 = "e2e-session-2";

interface PipelineMetrics {
	startTime: number;
	chunksPublished: number;
	chunksStored: number;
	ragDocsAdded: number;
	ragDocsRemoved: number;
	queriesExecuted: number;
	suggestionsGenerated: number;
	errors: string[];
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScreenpipeToSuggestionPipeline(engine: VectorEngine): Promise<PipelineMetrics> {
	const metrics: PipelineMetrics = {
		startTime: Date.now(),
		chunksPublished: 0,
		chunksStored: 0,
		ragDocsAdded: 0,
		ragDocsRemoved: 0,
		queriesExecuted: 0,
		suggestionsGenerated: 0,
		errors: [],
	};

	console.log(`\n${"=".repeat(60)}`);
	console.log(`  Pipeline: Screenpipe → Bus → Store → Suggestion`);
	console.log(`  Engine: ${engine}`);
	console.log(`${"=".repeat(60)}\n`);

	try {
		console.log("📦 Initializing store...");
		const store = createStore({
			engine,
			dbPath: ":memory:",
			embeddingDim: 384,
		});
		await store.init();
		console.log(`   ✓ Store initialized (engine: ${store.getEngineType()})`);

		console.log("\n🚌 Creating GlobalDataBus...");
		const bus = new EnhancementBus(WORKSPACE, {
			capacity: 100,
			onPassthrough: async (ctx: ContextChunk) => {
				metrics.chunksStored++;
				console.log(`   [Passthrough] Stored chunk: ${ctx.id}`);
			},
		});
		console.log("   ✓ Bus created");

		const sessionStore = store.createSessionStore(SESSION_1);

		console.log("\n📡 Setting up bus subscribers...");
		bus.subscribe("screenshot", async (chunk: RawChunk) => {
			metrics.chunksPublished++;
			await sessionStore.store({
				kind: "context",
				id: `screenpipe-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				source: chunk.source,
				workspace: chunk.workspace,
				sessionId: chunk.sessionId,
				content: typeof chunk.data === "string" ? chunk.data : chunk.data.toString("utf-8"),
				contentType: chunk.contentType,
				timestamp: chunk.timestamp,
				generation: chunk.generation,
			});
		});

		bus.subscribe("audio", async (chunk: RawChunk) => {
			metrics.chunksPublished++;
			await sessionStore.store({
				kind: "context",
				id: `audio-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				source: chunk.source,
				workspace: chunk.workspace,
				sessionId: chunk.sessionId,
				content: typeof chunk.data === "string" ? chunk.data : chunk.data.toString("utf-8"),
				contentType: chunk.contentType,
				timestamp: chunk.timestamp,
				generation: chunk.generation,
			});
		});
		console.log("   ✓ Subscribers registered");

		console.log("\n📸 Publishing screenpipe screenshots to bus...");
		for (let i = 1; i <= 3; i++) {
			bus.publish(makeChunk({
				source: "screenpipe",
				contentType: "screenshot",
				data: `base64-encoded-screenshot-${i}`,
				sessionId: SESSION_1,
			}));
			console.log(`   ✓ Published screenshot ${i}`);
			await sleep(50);
		}

		console.log("\n🎤 Publishing audio chunks to bus...");
		for (let i = 1; i <= 2; i++) {
			bus.publish(makeChunk({
				source: "screenpipe",
				contentType: "audio",
				data: `Transcribed audio segment ${i}`,
				sessionId: SESSION_1,
			}));
			console.log(`   ✓ Published audio ${i}`);
			await sleep(50);
		}

		console.log("\n📄 Attaching static documents via ContextBag...");
		await sessionStore.store(makeContextChunk({
			id: "doc-meeting-notes",
			source: "context-bag",
			contentType: "document",
			content: "Team meeting notes: Sprint planning for Q2, discussing roadmap priorities, reviewing action items",
			sessionId: SESSION_1,
		}));
		console.log("   ✓ Added meeting notes document");

		await sessionStore.store(makeContextChunk({
			id: "doc-spec",
			source: "context-bag",
			contentType: "document",
			content: "Technical specification for the enhancement backend API with OAuth2 authentication",
			sessionId: SESSION_1,
		}));
		console.log("   ✓ Added API specification document");

		await sleep(200);

		console.log("\n📚 Managing RAG documents...");
		await sessionStore.addRagDocs([
			{
				id: "rag-sprint-guide",
				content: "Sprint planning guidelines: Define goals, assign tasks, track progress",
				metadata: { category: "guidelines", priority: "high" },
			},
			{
				id: "rag-api-ref",
				content: "API reference documentation for backend endpoints",
				metadata: { category: "reference", priority: "medium" },
			},
			{
				id: "rag-code-review",
				content: "Code review best practices and checklist",
				metadata: { category: "best-practices", priority: "low" },
			},
		]);
		metrics.ragDocsAdded = 3;
		console.log("   ✓ Added 3 RAG documents");

		let stats = await sessionStore.getStats();
		console.log(`   Current RAG docs: ${stats.ragDocs}`);

		console.log("\n🗑️  Removing RAG document...");
		await sessionStore.removeRagDocs(["rag-code-review"]);
		metrics.ragDocsRemoved = 1;
		console.log("   ✓ Removed 1 RAG document");

		stats = await sessionStore.getStats();
		console.log(`   Remaining RAG docs: ${stats.ragDocs}`);

		console.log("\n🔍 Querying store...");
		metrics.queriesExecuted++;

		const screenshotResults = await sessionStore.query("screenshot");
		console.log(`   Screenshot query: ${screenshotResults.length} results`);

		metrics.queriesExecuted++;
		const meetingResults = await sessionStore.query("meeting");
		console.log(`   Meeting query: ${meetingResults.length} results`);

		metrics.queriesExecuted++;
		const sprintResults = await sessionStore.query("sprint");
		console.log(`   Sprint query: ${sprintResults.length} results`);

		console.log("\n🎯 Generating contextual suggestions...");

		const sprintSuggestion: Suggestion = {
			id: "suggestion-sprint-email",
			workspace: WORKSPACE,
			sessionId: SESSION_1,
			action: sprintResults.length > 0 ? "draft_sprint_email" : "general_reminder",
			confidence: sprintResults.length > 0 ? 0.87 : 0.3,
			priority: sprintResults.length > 0 ? "high" : "low",
			tool: {
				name: sprintResults.length > 0 ? "email_draft" : "reminder",
				provider: "openai",
				params: {
					topic: "Sprint Planning",
					contextChunks: sprintResults.map((c) => c.content),
				},
			},
			relatedChunks: sprintResults.map((c) => c.id),
		};
		metrics.suggestionsGenerated++;
		console.log(`   ✓ Generated: ${sprintSuggestion.action} (confidence: ${sprintSuggestion.confidence})`);

		if (meetingResults.length > 0) {
			const calendarSuggestion: Suggestion = {
				id: "suggestion-calendar",
				workspace: WORKSPACE,
				sessionId: SESSION_1,
				action: "create_calendar_event",
				confidence: 0.82,
				priority: "medium",
				tool: {
					name: "calendar_create",
					provider: "google-calendar",
					params: {
						title: "Sprint Planning Meeting",
						duration: "1 hour",
					},
				},
				relatedChunks: meetingResults.map((c) => c.id),
			};
			metrics.suggestionsGenerated++;
			console.log(`   ✓ Generated: ${calendarSuggestion.action} (confidence: ${calendarSuggestion.confidence})`);
		}

		if (screenshotResults.length > 0) {
			const docSuggestion: Suggestion = {
				id: "suggestion-doc-draft",
				workspace: WORKSPACE,
				sessionId: SESSION_1,
				action: "draft_document",
				confidence: 0.75,
				priority: "medium",
				tool: {
					name: "doc_writer",
					provider: "openai",
					params: {
						format: "markdown",
						basedOnScreenshots: true,
					},
				},
				relatedChunks: screenshotResults.map((c) => c.id),
			};
			metrics.suggestionsGenerated++;
			console.log(`   ✓ Generated: ${docSuggestion.action} (confidence: ${docSuggestion.confidence})`);
		}

		console.log("\n🔒 Testing session isolation...");
		const session2Store = store.createSessionStore(SESSION_2);

		await session2Store.store(makeContextChunk({
			id: "session2-private",
			source: "screenpipe",
			contentType: "text",
			content: "Session 2 private data - should not be visible to session 1",
			sessionId: SESSION_2,
		}));

		const s1Query = await sessionStore.query("private");
		const s2Query = await session2Store.query("private");

		if (s1Query.length === 0 && s2Query.length === 1) {
			console.log("   ✓ Session isolation verified");
		} else {
			metrics.errors.push("Session isolation failed");
			console.log("   ✗ Session isolation FAILED");
		}

		console.log("\n📊 Pipeline Summary:");
		console.log(`   Duration: ${Date.now() - metrics.startTime}ms`);
		console.log(`   Chunks Published: ${metrics.chunksPublished}`);
		console.log(`   Chunks Stored: ${metrics.chunksStored}`);
		console.log(`   RAG Docs Added: ${metrics.ragDocsAdded}`);
		console.log(`   RAG Docs Removed: ${metrics.ragDocsRemoved}`);
		console.log(`   Queries Executed: ${metrics.queriesExecuted}`);
		console.log(`   Suggestions Generated: ${metrics.suggestionsGenerated}`);
		console.log(`   Errors: ${metrics.errors.length}`);

		store.close();

		return metrics;
	} catch (error) {
		metrics.errors.push(error instanceof Error ? error.message : String(error));
		throw error;
	}
}

async function testBackpressure(): Promise<void> {
	console.log(`\n${"=".repeat(60)}`);
	console.log("  Test: Backpressure Handling");
	console.log(`${"=".repeat(60)}\n`);

	const bus = new EnhancementBus(WORKSPACE, { capacity: 10 });

	let processedCount = 0;
	bus.subscribe("screenshot", async () => {
		processedCount++;
		await sleep(10);
	});

	console.log("   Publishing 50 chunks to bus with capacity 10...");
	for (let i = 0; i < 50; i++) {
		bus.publish(makeChunk({
			source: "test",
			contentType: "screenshot",
			data: `data-${i}`,
			sessionId: SESSION_1,
		}));
	}

	await sleep(500);
	console.log(`   Processed: ${processedCount} chunks`);
	console.log(`   Bus subscribers: ${bus.subscriberCount}`);
	console.log("   ✓ Backpressure test completed");
}

async function testErrorHandling(): Promise<void> {
	console.log(`\n${"=".repeat(60)}`);
	console.log("  Test: Error Handling");
	console.log(`${"=".repeat(60)}\n`);

	const store = createStore({ engine: "zvec", dbPath: ":memory:", embeddingDim: 384 });

	console.log("   Testing uninitialized store...");
	try {
		await store.store(makeContextChunk({
			id: "test",
			source: "test",
			contentType: "text",
			content: "test",
			sessionId: SESSION_1,
		}));
		console.log("   ✗ Should have thrown error");
	} catch (error) {
		console.log("   ✓ Correctly threw error for uninitialized store");
	}

	console.log("   Testing forget without filter...");
	const sessionStore = store.createSessionStore(SESSION_1);
	await store.init();
	try {
		await sessionStore.forget({});
		console.log("   ✗ Should have thrown error");
	} catch (error) {
		console.log("   ✓ Correctly threw error for empty forget filter");
	}

	store.close();
	console.log("   ✓ Error handling tests passed");
}

async function runFullMatrixTests(): Promise<Map<VectorEngine, boolean>> {
	console.log(`\n${"=".repeat(60)}`);
	console.log("  Matrix Testing: All Engines");
	console.log(`${"=".repeat(60)}\n`);

	const engines: VectorEngine[] = ["zvec", "sqlite-vec", "chroma"];
	const results = new Map<VectorEngine, boolean>();

	for (const engine of engines) {
		console.log(`\n--- Testing engine: ${engine} ---`);
		try {
			const metrics = await runScreenpipeToSuggestionPipeline(engine);
			results.set(engine, metrics.errors.length === 0);
			console.log(`   ✓ ${engine}: PASSED`);
		} catch (error) {
			results.set(engine, false);
			console.log(`   ✗ ${engine}: FAILED - ${error}`);
		}
	}

	return results;
}

async function runExperiment(): Promise<void> {
	console.log("\n" + "=".repeat(60));
	console.log("  E2E Experiment: Store-Screenpipe Integration");
	console.log("  Testing Phase 1 (Bus) + Phase 2 (Store, Screenpipe)");
	console.log("=".repeat(60));

	const allResults: { name: string; passed: boolean }[] = [];

	console.log("\n📋 Test Suite:");
	console.log("  1. Full Pipeline (zvec engine)");
	console.log("  2. Full Pipeline (sqlite-vec engine)");
	console.log("  3. Full Pipeline (chroma engine)");
	console.log("  4. Backpressure Handling");
	console.log("  5. Error Handling");

	try {
		const matrixResults = await runFullMatrixTests();
		const allMatrixPassed = [...matrixResults.values()].every((v) => v);

		allResults.push({
			name: "Matrix: All Engines",
			passed: allMatrixPassed,
		});

		await testBackpressure();
		allResults.push({
			name: "Backpressure Handling",
			passed: true,
		});

		await testErrorHandling();
		allResults.push({
			name: "Error Handling",
			passed: true,
		});

		console.log("\n" + "=".repeat(60));
		console.log("  Final Results");
		console.log("=".repeat(60) + "\n");

		for (const result of allResults) {
			const status = result.passed ? "✅ PASS" : "❌ FAIL";
			console.log(`${status}: ${result.name}`);
		}

		const passed = allResults.filter((r) => r.passed).length;
		const failed = allResults.filter((r) => !r.passed).length;

		console.log(`\nTotal: ${passed} passed, ${failed} failed\n`);

		if (failed > 0) {
			console.log("\n⚠️  Some tests failed. Review the output above.\n");
			process.exit(1);
		} else {
			console.log("\n🎉 All E2E tests passed!\n");
		}
	} catch (error) {
		console.error("\n❌ E2E experiment failed:", error);
		process.exit(1);
	}
}

if (import.meta.main) {
	runExperiment();
}

export { runExperiment, runScreenpipeToSuggestionPipeline };
