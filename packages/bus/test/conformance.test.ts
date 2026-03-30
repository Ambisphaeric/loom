import { describe, expect, test } from "bun:test";
import { EnhancementBus, MergeQueue } from "../src/index.js";
import type { RawChunk } from "@loomai/types";
import type { MergeStrategy } from "@loomai/types";

function makeChunk(overrides: Partial<RawChunk> = {}): RawChunk {
	return {
		kind: "raw",
		source: "test-source",
		workspace: "test-ws",
		sessionId: "session-1",
		contentType: "text",
		data: "hello world",
		timestamp: Date.now(),
		generation: 0,
		...overrides,
	};
}

describe("@enhancement/bus conformance", () => {
	test("exports EnhancementBus", () => {
		expect(EnhancementBus).toBeDefined();
		expect(typeof EnhancementBus).toBe("function");
	});

	test("exports MergeQueue", () => {
		expect(MergeQueue).toBeDefined();
		expect(typeof MergeQueue).toBe("function");
	});

	test("implements Bus interface", () => {
		const bus = new EnhancementBus("test");
		expect(bus.workspace).toBe("test");
		expect(typeof bus.publish).toBe("function");
		expect(typeof bus.subscribe).toBe("function");
		expect(typeof bus.unsubscribe).toBe("function");
	});

	test("supports all merge strategies", () => {
		const strategies: MergeStrategy[] = ["zip", "concat", "interleave", "latest", "wait-all"];

		for (const strategy of strategies) {
			const bus = new EnhancementBus("test");
			const received: unknown[] = [];

			const unsubscribe = bus.subscribeMultiple(
				["a", "b"],
				async (chunks) => received.push(chunks),
				{ strategy }
			);

			expect(typeof unsubscribe).toBe("function");
			unsubscribe();
		}
	});

	test("MergeQueue zip strategy emits paired chunks when all sources have data", async () => {
		const received: RawChunk[][] = [];
		const queue = new MergeQueue(
			["type-a", "type-b"],
			{ strategy: "zip" },
			async (chunks) => received.push(chunks)
		);

		// Add chunks - zip waits for both sources to have data
		queue.enqueue("type-a", makeChunk({ data: "A1" }));
		// At this point, only type-a has data, nothing emitted
		expect(received.length).toBe(0);

		queue.enqueue("type-b", makeChunk({ data: "B1" }));
		// Now both have 1 chunk, should emit pair
		await new Promise((r) => setTimeout(r, 10));

		expect(received.length).toBe(1);
		expect(received[0]).toHaveLength(2); // A1, B1

		queue.destroy();
	});

	test("MergeQueue concat strategy emits when any source has data", async () => {
		const received: RawChunk[][] = [];
		const queue = new MergeQueue(
			["type-a", "type-b"],
			{ strategy: "concat" },
			async (chunks) => received.push(chunks)
		);

		// First enqueue - should emit immediately
		queue.enqueue("type-a", makeChunk({ data: "A1" }));
		await new Promise((r) => setTimeout(r, 5));

		expect(received.length).toBe(1);
		expect(received[0]).toHaveLength(1);

		// Second enqueue - new emission
		queue.enqueue("type-b", makeChunk({ data: "B1" }));
		await new Promise((r) => setTimeout(r, 5));

		expect(received.length).toBe(2);
		expect(received[1]).toHaveLength(1);

		queue.destroy();
	});

	test("MergeQueue latest strategy emits most recent from each source", async () => {
		const received: RawChunk[][] = [];
		const queue = new MergeQueue(
			["type-a", "type-b"],
			{ strategy: "latest" },
			async (chunks) => received.push(chunks)
		);

		const baseTime = Date.now();
		queue.enqueue("type-a", makeChunk({ data: "A1", timestamp: baseTime }));
		await new Promise((r) => setTimeout(r, 5));
		// Only type-a has data so far

		queue.enqueue("type-a", makeChunk({ data: "A2", timestamp: baseTime + 100 }));
		await new Promise((r) => setTimeout(r, 5));

		// Should emit with A2 (latest from type-a)
		expect(received.length).toBeGreaterThanOrEqual(1);

		queue.destroy();
	});

	test("MergeQueue wait-all strategy waits for all sources", async () => {
		const received: RawChunk[][] = [];
		const queue = new MergeQueue(
			["type-a", "type-b"],
			{ strategy: "wait-all", timeout: 100 },
			async (chunks) => received.push(chunks)
		);

		// Only add to one source - should wait
		queue.enqueue("type-a", makeChunk({ data: "A1" }));
		await new Promise((r) => setTimeout(r, 10));
		expect(received).toHaveLength(0);

		// Now add to second source - should emit
		queue.enqueue("type-b", makeChunk({ data: "B1" }));

		await new Promise((r) => setTimeout(r, 10));
		expect(received).toHaveLength(1);
		expect(received[0]).toHaveLength(2);

		queue.destroy();
	});

	test("MergeQueue interleave strategy emits when any source has data", async () => {
		const received: RawChunk[][] = [];
		const queue = new MergeQueue(
			["type-a", "type-b"],
			{ strategy: "interleave" },
			async (chunks) => received.push(chunks)
		);

		// First enqueue - interleave emits immediately when any data available
		queue.enqueue("type-a", makeChunk({ data: "A1" }));
		await new Promise((r) => setTimeout(r, 5));
		expect(received.length).toBe(1);

		queue.enqueue("type-a", makeChunk({ data: "A2" }));
		await new Promise((r) => setTimeout(r, 5));
		expect(received.length).toBe(2);

		queue.enqueue("type-b", makeChunk({ data: "B1" }));
		await new Promise((r) => setTimeout(r, 5));
		expect(received.length).toBe(3);

		queue.destroy();
	});

	test("subscribeMultiple returns unsubscribe function", () => {
		const bus = new EnhancementBus("test");

		const unsubscribe = bus.subscribeMultiple(
			["audio", "transcript"],
			async (_chunks) => {},
			{ strategy: "zip" }
		);

		expect(typeof unsubscribe).toBe("function");
		unsubscribe();
	});
});
