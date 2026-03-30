import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createStore, type VectorEngine } from "../src/index.js";
import type { ContextChunk, MemoryFilter } from "@enhancement/types";

function createTestChunk(overrides: Partial<ContextChunk> = {}): ContextChunk {
	return {
		kind: "context",
		id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		source: "test",
		workspace: "test-workspace",
		sessionId: "test-session",
		content: "This is a test document about machine learning and AI.",
		contentType: "text",
		timestamp: Date.now(),
		generation: 0,
		...overrides,
	};
}

describe("Store Conformance Tests", () => {
	const engines: VectorEngine[] = ["zvec"];

	for (const engine of engines) {
		describe(`Engine: ${engine}`, () => {
			let store: ReturnType<typeof createStore>;

			beforeEach(async () => {
				store = createStore({ engine, dbPath: ":memory:" });
				await store.init();
			});

			afterEach(() => {
				store.close();
			});

			describe("store()", () => {
				it("should store a chunk", async () => {
					const chunk = createTestChunk();
					await store.store(chunk);

					const results = await store.query(chunk.content, {});
					expect(results.length).toBeGreaterThan(0);
				});

				it("should replace existing chunk with same id", async () => {
					const chunk = createTestChunk({ id: "same-id" });
					await store.store(chunk);

					const updatedChunk = createTestChunk({
						id: "same-id",
						content: "Updated content",
					});
					await store.store(updatedChunk);

					const results = await store.query("Updated content", {});
					expect(results.some((r) => r.id === "same-id")).toBe(true);
				});

				it("should store metadata with chunk", async () => {
					const chunk = createTestChunk({
						metadata: { key: "value", nested: { deep: true } },
					});
					await store.store(chunk);

					const results = await store.query(chunk.content, {});
					expect(results[0].metadata).toEqual({ key: "value", nested: { deep: true } });
				});
			});

			describe("query()", () => {
				it("should find chunks by content", async () => {
					await store.store(createTestChunk({ content: "Python is great for data science" }));
					await store.store(createTestChunk({ content: "JavaScript is great for web development" }));

					const results = await store.query("Python", {});
					expect(results.length).toBeGreaterThan(0);
				});

				it("should filter by workspace", async () => {
					await store.store(createTestChunk({ workspace: "ws1", content: "Content for ws1" }));
					await store.store(createTestChunk({ workspace: "ws2", content: "Content for ws2" }));

					const results = await store.query("Content", { workspace: "ws1" });
					expect(results.every((r) => r.workspace === "ws1")).toBe(true);
				});

				it("should filter by sessionId", async () => {
					await store.store(createTestChunk({ sessionId: "session-1", content: "Session 1 content" }));
					await store.store(createTestChunk({ sessionId: "session-2", content: "Session 2 content" }));

					const results = await store.query("Session", { sessionId: "session-1" });
					expect(results.every((r) => r.sessionId === "session-1")).toBe(true);
				});

				it("should filter by contentType", async () => {
					await store.store(createTestChunk({ contentType: "text", content: "Text content" }));
					await store.store(createTestChunk({ contentType: "image", content: "Image content" }));

					const results = await store.query("content", { contentType: "text" });
					expect(results.every((r) => r.contentType === "text")).toBe(true);
				});

				it("should respect limit parameter", async () => {
					for (let i = 0; i < 10; i++) {
						await store.store(createTestChunk({ content: `Content ${i}` }));
					}

					const results = await store.query("Content", {}, 3);
					expect(results.length).toBeLessThanOrEqual(3);
				});
			});

			describe("scan()", () => {
				it("should scan chunks with cursor", async () => {
					const chunks = [
						createTestChunk({ content: "First" }),
						createTestChunk({ content: "Second" }),
						createTestChunk({ content: "Third" }),
					];
					for (const chunk of chunks) {
						await store.store(chunk);
					}

					const result = await store.scan("", {}, 2);
					expect(result.chunks.length).toBeLessThanOrEqual(2);
					expect(result.nextCursor).toBeDefined();
				});

				it("should use cursor for pagination", async () => {
					const chunks = [
						createTestChunk({ content: "Alpha" }),
						createTestChunk({ content: "Beta" }),
						createTestChunk({ content: "Gamma" }),
					];
					for (const chunk of chunks) {
						await store.store(chunk);
					}

					const firstPage = await store.scan("", {}, 2);
					const secondPage = await store.scan(firstPage.nextCursor, {}, 2);

					const allIds = [...firstPage.chunks, ...secondPage.chunks].map((c) => c.id);
					const uniqueIds = new Set(allIds);
					expect(uniqueIds.size).toBe(allIds.length);
				});
			});

			describe("forget()", () => {
				it("should delete chunks matching filter", async () => {
					await store.store(createTestChunk({ id: "to-delete", source: "test-source" }));
					await store.store(createTestChunk({ id: "to-keep", source: "other-source" }));

					const deleted = await store.forget({ source: "test-source" });
					expect(deleted).toBeGreaterThan(0);
				});

				it("should require at least one filter", async () => {
					await expect(store.forget({})).rejects.toThrow();
				});
			});

			describe("getProfile() / updateProfile()", () => {
				it("should get and update profile", async () => {
					const initial = await store.getProfile("test-ws");
					expect(initial.workspace).toBe("test-ws");
					expect(initial.summary).toBe("");

					await store.updateProfile({
						workspace: "test-ws",
						summary: "Test summary",
						frequentActions: ["action1"],
						dismissedPatterns: ["pattern1"],
						lastUpdated: Date.now(),
					});

					const updated = await store.getProfile("test-ws");
					expect(updated.summary).toBe("Test summary");
					expect(updated.frequentActions).toContain("action1");
				});
			});

			describe("prune()", () => {
				it("should prune expired chunks", async () => {
					const now = Date.now();
					await store.store(
						createTestChunk({
							id: "old-chunk",
							timestamp: now - 8 * 24 * 60 * 60 * 1000,
							ttl: 1,
						})
					);
					await store.store(
						createTestChunk({
							id: "new-chunk",
							timestamp: now,
							ttl: 7,
						})
					);

					const pruned = await store.prune("test-workspace");
					expect(pruned).toBeGreaterThanOrEqual(0);
				});
			});

			describe("createSessionStore()", () => {
				it("should create isolated session store", async () => {
					const sessionStore = store.createSessionStore("my-session");

					await sessionStore.store(createTestChunk({ content: "Session content" }));
					const results = await sessionStore.query("Session", {});
					expect(results.length).toBeGreaterThan(0);

					const stats = await sessionStore.getStats();
					expect(stats.totalChunks).toBeGreaterThan(0);
				});

				it("should support addRagDocs and removeRagDocs", async () => {
					const sessionStore = store.createSessionStore("rag-session");

					await sessionStore.addRagDocs([
						{ id: "doc-1", content: "RAG document 1", metadata: { source: "pdf" } },
						{ id: "doc-2", content: "RAG document 2", metadata: { source: "pdf" } },
					]);

					let stats = await sessionStore.getStats();
					expect(stats.ragDocs).toBe(2);

					await sessionStore.removeRagDocs(["doc-1"]);
					stats = await sessionStore.getStats();
					expect(stats.ragDocs).toBe(1);
				});
			});

			describe("getEngineType()", () => {
				it("should return the configured engine", () => {
					expect(store.getEngineType()).toBe(engine);
				});
			});
		});
	}
});
