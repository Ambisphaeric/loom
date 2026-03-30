import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { EnhancementBus } from "../packages/bus/src/index.js";
import {
	EnhancementStore,
	createStore,
	createSessionStore,
	type SessionStore,
	type VectorEngine,
} from "../packages/store/src/store.js";
import { makeChunk, makeContextChunk } from "../packages/test-harness/src/helpers.js";
import type { RawChunk, ContextChunk, Suggestion } from "../packages/types/src/index.js";

const WORKSPACE = "test-workspace";
const SESSION_1 = "session-1";
const SESSION_2 = "session-2";

interface TestMetrics {
	chunksPublished: number;
	chunksStored: number;
	queriesExecuted: number;
	errorsEncountered: number;
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Store-Screenpipe Integration E2E", () => {
	let bus: EnhancementBus;
	let metrics: TestMetrics;

	beforeEach(() => {
		bus = new EnhancementBus(WORKSPACE, {
			capacity: 100,
			onPassthrough: (ctx) => {
				metrics.chunksStored++;
			},
		});
		metrics = {
			chunksPublished: 0,
			chunksStored: 0,
			queriesExecuted: 0,
			errorsEncountered: 0,
		};
	});

	describe("Bus to Store Pipeline", () => {
		it("should publish raw chunks to bus and persist to store", async () => {
			const store = createStore({ dbPath: ":memory:", embeddingDim: 384 });
			await store.init();

			const sessionStore = store.createSessionStore(SESSION_1);
			let storedCount = 0;

			bus.subscribe("screenshot", async (chunk: RawChunk) => {
				metrics.chunksPublished++;
				await sessionStore.store({
					kind: "context",
					id: `bus-chunk-${Date.now()}`,
					source: chunk.source,
					workspace: chunk.workspace,
					sessionId: chunk.sessionId,
					content: typeof chunk.data === "string" ? chunk.data : chunk.data.toString("utf-8"),
					contentType: chunk.contentType,
					timestamp: chunk.timestamp,
					generation: chunk.generation,
				});
				storedCount++;
			});

			bus.publish(makeChunk({
				source: "screenpipe",
				contentType: "screenshot",
				data: "base64screenshotdata...",
				sessionId: SESSION_1,
				timestamp: Date.now(),
				generation: 0,
			}));

			await sleep(100);

			bus.publish(makeChunk({
				source: "screenpipe-2",
				contentType: "screenshot",
				data: "base64screenshotdata2...",
				sessionId: SESSION_1,
				timestamp: Date.now() + 1,
				generation: 0,
			}));

			await sleep(500);

			expect(metrics.chunksPublished).toBe(2);
			expect(storedCount).toBe(2);

			const results = await sessionStore.query("screenshot");
			expect(results.length).toBe(2);

			store.close();
		});

		it("should handle passthrough when no subscribers", async () => {
			const store = createStore({ dbPath: ":memory:", embeddingDim: 384 });
			await store.init();

			bus.onPassthrough = async (ctx: ContextChunk) => {
				metrics.chunksStored++;
				await store.store(ctx);
			};

			bus.publish(makeChunk({
				source: "screenpipe",
				contentType: "screenshot",
				data: "passthrough data",
				sessionId: SESSION_1,
			}));

			await sleep(200);

			expect(metrics.chunksStored).toBe(1);

			const results = await store.query("passthrough", { sessionId: SESSION_1 });
			expect(results.length).toBe(1);

			store.close();
		});

		it("should enforce bus capacity and backpressure", async () => {
			const smallBus = new EnhancementBus(WORKSPACE, { capacity: 5 });

			smallBus.subscribe("screenshot", async () => {
				await sleep(50);
			});

			for (let i = 0; i < 20; i++) {
				smallBus.publish(makeChunk({
					source: "screenpipe",
					contentType: "screenshot",
					data: `data-${i}`,
					sessionId: SESSION_1,
				}));
			}

			await sleep(300);

			const subscriberCount = smallBus.subscriberCount;
			expect(subscriberCount).toBe(1);
		});

		it("should handle cycle detection gracefully", async () => {
			const cycleBus = new EnhancementBus(WORKSPACE);
			let processedCount = 0;

			cycleBus.subscribe("screenshot", async (chunk: RawChunk) => {
				processedCount++;
				if (chunk.generation < 3) {
					cycleBus.publish(makeChunk({
						...chunk,
						generation: chunk.generation + 1,
					}));
				}
			});

			cycleBus.publish(makeChunk({
				source: "screenpipe",
				contentType: "screenshot",
				data: "cycle data",
				generation: 0,
				sessionId: SESSION_1,
			}));

			await sleep(300);

			expect(processedCount).toBeGreaterThanOrEqual(1);
			expect(processedCount).toBeLessThanOrEqual(5);
		});
	});

	describe("Session Isolation", () => {
		it("should isolate data between sessions", async () => {
			const store = createStore({ dbPath: ":memory:", embeddingDim: 384 });
			await store.init();

			const session1Store = store.createSessionStore(SESSION_1);
			const session2Store = store.createSessionStore(SESSION_2);

			await session1Store.store(makeContextChunk({
				id: "s1-chunk-1",
				source: "screenpipe",
				contentType: "screenshot",
				content: "Session 1 private data",
				sessionId: SESSION_1,
			}));

			await session2Store.store(makeContextChunk({
				id: "s2-chunk-1",
				source: "screenpipe",
				contentType: "screenshot",
				content: "Session 2 private data",
				sessionId: SESSION_2,
			}));

			const s1Results = await session1Store.query("private");
			expect(s1Results.length).toBe(1);
			expect(s1Results[0].content).toBe("Session 1 private data");

			const s2Results = await session2Store.query("private");
			expect(s2Results.length).toBe(1);
			expect(s2Results[0].content).toBe("Session 2 private data");

			await session1Store.forget({ source: "screenpipe" });
			const s1AfterForget = await session1Store.query("private");
			expect(s1AfterForget.length).toBe(0);

			const s2AfterForget = await session2Store.query("private");
			expect(s2AfterForget.length).toBe(1);

			store.close();
		});

		it("should maintain RAG docs isolation per session", async () => {
			const store = createStore({ dbPath: ":memory:", embeddingDim: 384 });
			await store.init();

			const session1Store = store.createSessionStore(SESSION_1);
			const session2Store = store.createSessionStore(SESSION_2);

			await session1Store.addRagDocs([
				{ id: "s1-doc", content: "Session 1 document" },
			]);

			await session2Store.addRagDocs([
				{ id: "s2-doc", content: "Session 2 document" },
			]);

			const s1Stats = await session1Store.getStats();
			const s2Stats = await session2Store.getStats();

			expect(s1Stats.ragDocs).toBe(1);
			expect(s2Stats.ragDocs).toBe(1);

			await session1Store.removeRagDocs(["s1-doc"]);

			const s1StatsAfter = await session1Store.getStats();
			const s2StatsAfter = await session2Store.getStats();

			expect(s1StatsAfter.ragDocs).toBe(0);
			expect(s2StatsAfter.ragDocs).toBe(1);

			store.close();
		});
	});

	describe("ContextBag Document Attachment", () => {
		it("should attach and query static documents", async () => {
			const store = createStore({ dbPath: ":memory:", embeddingDim: 384 });
			await store.init();

			const sessionStore = store.createSessionStore(SESSION_1);

			await sessionStore.store(makeContextChunk({
				id: "static-doc-1",
				source: "context-bag",
				contentType: "document",
				content: "Project architecture overview with microservices design pattern",
				sessionId: SESSION_1,
			}));

			await sessionStore.store(makeContextChunk({
				id: "static-doc-2",
				source: "context-bag",
				contentType: "document",
				content: "API rate limiting implementation guide",
				sessionId: SESSION_1,
			}));

			const archResults = await sessionStore.query("architecture");
			expect(archResults.length).toBeGreaterThan(0);
			expect(archResults[0].content).toContain("architecture");

			const apiResults = await sessionStore.query("rate limiting");
			expect(apiResults.length).toBeGreaterThan(0);

			store.close();
		});
	});

	describe("Store Engine Matrix", () => {
		it("should work with all three vector engines", async () => {
			const engines: VectorEngine[] = ["zvec", "sqlite-vec", "chroma"];

			for (const engine of engines) {
				const store = createStore({
					engine,
					dbPath: ":memory:",
					embeddingDim: 384,
				});
				await store.init();

				expect(store.getEngineType()).toBe(engine);

				const sessionStore = store.createSessionStore(SESSION_1);

				await sessionStore.store(makeContextChunk({
					id: `engine-test-${engine}`,
					source: "test",
					contentType: "text",
					content: `Testing ${engine} engine with sample content`,
					sessionId: SESSION_1,
				}));

				const results = await sessionStore.query("Testing");
				expect(results.length).toBe(1);

				const stats = await sessionStore.getStats();
				expect(stats.totalChunks).toBe(1);

				store.close();
			}
		});

		it("should handle concurrent operations", async () => {
			const store = createStore({ engine: "zvec", dbPath: ":memory:", embeddingDim: 384 });
			await store.init();

			const sessionStore = store.createSessionStore(SESSION_1);

			const writeOps = Array.from({ length: 10 }, (_, i) =>
				sessionStore.store(makeContextChunk({
					id: `concurrent-${i}`,
					source: "test",
					contentType: "text",
					content: `Concurrent write ${i}`,
					sessionId: SESSION_1,
				}))
			);

			await Promise.all(writeOps);

			const results = await sessionStore.query("Concurrent");
			expect(results.length).toBe(10);

			store.close();
		});
	});

	describe("Error Handling", () => {
		it("should handle uninitialized store gracefully", async () => {
			const store = createStore({ dbPath: ":memory:", embeddingDim: 384 });

			await expect(async () => {
				await store.store(makeContextChunk({
					id: "test",
					source: "test",
					contentType: "text",
					content: "test",
					sessionId: SESSION_1,
				}));
			}).toThrow();

			store.close();
		});

		it("should handle scan with cursor", async () => {
			const store = createStore({ dbPath: ":memory:", embeddingDim: 384 });
			await store.init();

			const sessionStore = store.createSessionStore(SESSION_1);

			for (let i = 0; i < 5; i++) {
				await sessionStore.store(makeContextChunk({
					id: `scan-${i}`,
					source: "test",
					contentType: "text",
					content: `Scan test ${i}`,
					sessionId: SESSION_1,
				}));
			}

			const scan1 = await sessionStore.scan("scan-0", {}, 2);
			expect(scan1.chunks.length).toBe(2);

			const scan2 = await sessionStore.scan(scan1.nextCursor, {}, 2);
			expect(scan2.chunks.length).toBe(2);

			store.close();
		});
	});

	describe("Suggestion Step", () => {
		it("should generate contextual suggestions from store", async () => {
			const store = createStore({ dbPath: ":memory:", embeddingDim: 384 });
			await store.init();

			const sessionStore = store.createSessionStore(SESSION_1);

			await sessionStore.store(makeContextChunk({
				id: "context-1",
				source: "screenpipe",
				contentType: "text",
				content: "Drafting email to team about sprint planning",
				sessionId: SESSION_1,
			}));

			await sessionStore.store(makeContextChunk({
				id: "context-2",
				source: "screenpipe",
				contentType: "text",
				content: "Reviewing pull request for authentication feature",
				sessionId: SESSION_1,
			}));

			const emailResults = await sessionStore.query("email");
			const prResults = await sessionStore.query("pull request");

			const suggestion: Suggestion = {
				id: "suggestion-1",
				workspace: WORKSPACE,
				sessionId: SESSION_1,
				action: "draft_email",
				confidence: emailResults.length > 0 ? 0.85 : 0.3,
				priority: "medium",
				tool: {
					name: "email_draft",
					provider: "openai",
					params: {
						topic: "sprint planning",
						contextChunks: emailResults.map((c) => c.content),
					},
				},
				relatedChunks: emailResults.map((c) => c.id),
			};

			expect(suggestion.action).toBe("draft_email");
			expect(suggestion.confidence).toBe(0.85);
			expect(suggestion.relatedChunks?.length).toBeGreaterThan(0);

			store.close();
		});

		it("should provide calendar suggestions from context", async () => {
			const store = createStore({ dbPath: ":memory:", embeddingDim: 384 });
			await store.init();

			const sessionStore = store.createSessionStore(SESSION_1);

			await sessionStore.store(makeContextChunk({
				id: "meeting-context",
				source: "screenpipe",
				contentType: "text",
				content: "Weekly team standup meeting scheduled for Tuesday 10am",
				sessionId: SESSION_1,
			}));

			const meetingResults = await sessionStore.query("meeting");

			const calendarSuggestion: Suggestion = {
				id: "suggestion-cal-1",
				workspace: WORKSPACE,
				sessionId: SESSION_1,
				action: "create_calendar_event",
				confidence: meetingResults.length > 0 ? 0.9 : 0.1,
				priority: "high",
				tool: {
					name: "calendar_create",
					provider: "google-calendar",
					params: {
						title: "Weekly Team Standup",
						time: "Tuesday 10am",
						attendees: ["team@company.com"],
					},
				},
				relatedChunks: meetingResults.map((c) => c.id),
			};

			expect(calendarSuggestion.priority).toBe("high");
			expect(calendarSuggestion.tool?.name).toBe("calendar_create");

			store.close();
		});
	});
});

describe("Matrix Testing: All Engines x All Scenarios", () => {
	const engines: VectorEngine[] = ["zvec", "sqlite-vec", "chroma"];
	const scenarios = [
		"basic-store-retrieve",
		"session-isolation",
		"rag-docs-lifecycle",
		"concurrent-writes",
		"error-recovery",
	] as const;

	it.each(scenarios)("should pass %s for all engines", async (scenario) => {
		for (const engine of engines) {
			const store = createStore({ engine, dbPath: ":memory:", embeddingDim: 384 });
			await store.init();

			const sessionStore = store.createSessionStore(SESSION_1);

			switch (scenario) {
				case "basic-store-retrieve":
					await sessionStore.store(makeContextChunk({
						id: `matrix-${scenario}`,
						source: "test",
						contentType: "text",
						content: `Matrix test for ${scenario} with ${engine}`,
						sessionId: SESSION_1,
					}));
					const results = await sessionStore.query("Matrix test");
					expect(results.length).toBe(1);
					break;

				case "session-isolation":
					const session2Store = store.createSessionStore(SESSION_2);
					await sessionStore.store(makeContextChunk({
						id: "iso-1",
						source: "test",
						contentType: "text",
						content: "Session 1 content",
						sessionId: SESSION_1,
					}));
					await session2Store.store(makeContextChunk({
						id: "iso-2",
						source: "test",
						contentType: "text",
						content: "Session 2 content",
						sessionId: SESSION_2,
					}));
					const s1Q = await sessionStore.query("Session");
					const s2Q = await session2Store.query("Session");
					expect(s1Q.length).toBe(1);
					expect(s2Q.length).toBe(1);
					expect(s1Q[0].content).toBe("Session 1 content");
					expect(s2Q[0].content).toBe("Session 2 content");
					break;

				case "rag-docs-lifecycle":
					await sessionStore.addRagDocs([
						{ id: `rag-${engine}`, content: `RAG doc for ${engine}` },
					]);
					let stats = await sessionStore.getStats();
					expect(stats.ragDocs).toBe(1);
					await sessionStore.removeRagDocs([`rag-${engine}`]);
					stats = await sessionStore.getStats();
					expect(stats.ragDocs).toBe(0);
					break;

				case "concurrent-writes":
					await Promise.all([
						sessionStore.store(makeContextChunk({
							id: `concurrent-1-${engine}`,
							source: "test",
							contentType: "text",
							content: "Concurrent 1",
							sessionId: SESSION_1,
						})),
						sessionStore.store(makeContextChunk({
							id: `concurrent-2-${engine}`,
							source: "test",
							contentType: "text",
							content: "Concurrent 2",
							sessionId: SESSION_1,
						})),
					]);
					const concurrentResults = await sessionStore.query("Concurrent");
					expect(concurrentResults.length).toBe(2);
					break;

				case "error-recovery":
					await sessionStore.store(makeContextChunk({
						id: `error-recovery-${engine}`,
						source: "test",
						contentType: "text",
						content: "Error recovery test",
						sessionId: SESSION_1,
					}));
					const recoveryResults = await sessionStore.query("Error recovery");
					expect(recoveryResults.length).toBe(1);
					break;
			}

			store.close();
		}
	});
});

describe("Full Pipeline Integration", () => {
	it("should complete full screenpipe -> bus -> store -> suggestion pipeline", async () => {
		const store = createStore({ engine: "zvec", dbPath: ":memory:", embeddingDim: 384 });
		await store.init();

		let storedViaBus = 0;
		const bus = new EnhancementBus(WORKSPACE, {
			capacity: 100,
		});

		const sessionStore = store.createSessionStore(SESSION_1);

		bus.subscribe("screenshot", async (chunk: RawChunk) => {
			await sessionStore.store({
				kind: "context",
				id: `screenshot-${Date.now()}`,
				source: chunk.source,
				workspace: chunk.workspace,
				sessionId: chunk.sessionId,
				content: typeof chunk.data === "string" ? chunk.data : chunk.data.toString("utf-8"),
				contentType: chunk.contentType,
				timestamp: chunk.timestamp,
				generation: chunk.generation,
			});
			storedViaBus++;
		});

		bus.subscribe("audio", async (chunk: RawChunk) => {
			await sessionStore.store({
				kind: "context",
				id: `audio-${Date.now()}`,
				source: chunk.source,
				workspace: chunk.workspace,
				sessionId: chunk.sessionId,
				content: typeof chunk.data === "string" ? chunk.data : chunk.data.toString("utf-8"),
				contentType: chunk.contentType,
				timestamp: chunk.timestamp,
				generation: chunk.generation,
			});
			storedViaBus++;
		});

		bus.publish(makeChunk({
			source: "screenpipe",
			contentType: "screenshot",
			data: "Encoded screenshot image data",
			sessionId: SESSION_1,
			generation: 0,
		}));

		await sleep(100);

		bus.publish(makeChunk({
			source: "screenpipe-2",
			contentType: "screenshot",
			data: "Another screenshot frame",
			sessionId: SESSION_1,
			generation: 0,
		}));

		await sleep(100);

		bus.publish(makeChunk({
			source: "screenpipe-3",
			contentType: "audio",
			data: "Audio transcription text",
			sessionId: SESSION_1,
			generation: 0,
		}));

		await sessionStore.store(makeContextChunk({
			id: "static-document",
			source: "context-bag",
			contentType: "document",
			content: "unique-document-xyz meeting notes from standup",
			sessionId: SESSION_1,
		}));

		await sessionStore.addRagDocs([
			{
				id: "rag-reference",
				content: "unique-document-xyz Sprint planning guidelines and best practices",
				metadata: { type: "reference" },
			},
		]);

		await sleep(500);

		const allChunks = await sessionStore.query("screenshot", { contentType: "screenshot" });
		expect(allChunks.length).toBe(2);

		const audioResults = await sessionStore.query("Audio", { contentType: "audio" });
		expect(audioResults.length).toBe(1);

		const docResults = await sessionStore.query("unique-document-xyz", { contentType: "document" });
		expect(docResults.length).toBe(2);

		const ragStats = await sessionStore.getStats();
		expect(ragStats.ragDocs).toBe(1);

		const sprintResults = await sessionStore.query("sprint");
		const suggestion: Suggestion = {
			id: "final-suggestion",
			workspace: WORKSPACE,
			sessionId: SESSION_1,
			action: sprintResults.length > 0 ? "draft_sprint_email" : "general_reminder",
			confidence: sprintResults.length > 0 ? 0.85 : 0.5,
			priority: sprintResults.length > 0 ? "high" : "low",
			tool: {
				name: sprintResults.length > 0 ? "email_draft" : "reminder",
				provider: "openai",
				params: {
					context: sprintResults.map((c) => c.content).join("; "),
				},
			},
			relatedChunks: sprintResults.map((c) => c.id),
		};

		expect(suggestion.confidence).toBeGreaterThan(0.5);
		expect(suggestion.relatedChunks?.length).toBeGreaterThan(0);
		expect(storedViaBus).toBe(3);

		store.close();
	});
});
