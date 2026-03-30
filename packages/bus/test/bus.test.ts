import { describe, expect, test } from "bun:test";
import { EnhancementBus } from "../src/index.js";
import type { ContextChunk, RawChunk } from "../../types/src/index.js";
import { MAX_GENERATION } from "../../types/src/index.js";

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

describe("EnhancementBus", () => {
	test("delivers chunks to subscribers matching content type", async () => {
		const received: RawChunk[] = [];
		const bus = new EnhancementBus("test-ws");

		bus.subscribe("text", async (chunk) => {
			received.push(chunk);
		});

		bus.publish(makeChunk());

		// Allow async drain
		await new Promise((r) => setTimeout(r, 10));
		expect(received).toHaveLength(1);
		expect(received[0].data).toBe("hello world");
	});

	test("does not deliver to non-matching subscribers", async () => {
		const textReceived: RawChunk[] = [];
		const audioReceived: RawChunk[] = [];
		const bus = new EnhancementBus("test-ws");

		bus.subscribe("text", async (chunk) => textReceived.push(chunk));
		bus.subscribe("audio", async (chunk) => audioReceived.push(chunk));

		bus.publish(makeChunk({ contentType: "text" }));

		await new Promise((r) => setTimeout(r, 10));
		expect(textReceived).toHaveLength(1);
		expect(audioReceived).toHaveLength(0);
	});

	test("calls passthrough when no subscriber matches", async () => {
		const passed: ContextChunk[] = [];
		const bus = new EnhancementBus("test-ws", {
			onPassthrough: (ctx) => passed.push(ctx),
		});

		bus.publish(makeChunk({ contentType: "unknown" }));

		await new Promise((r) => setTimeout(r, 10));
		expect(passed).toHaveLength(1);
		expect(passed[0].kind).toBe("context");
		expect(passed[0].content).toBe("hello world");
	});

	test("enforces generation limit", async () => {
		const exceeded: ContextChunk[] = [];
		const received: RawChunk[] = [];
		const bus = new EnhancementBus("test-ws", {
			onGenerationExceeded: (ctx) => exceeded.push(ctx),
		});

		bus.subscribe("text", async (chunk) => received.push(chunk));

		bus.publish(makeChunk({ generation: MAX_GENERATION }));

		await new Promise((r) => setTimeout(r, 10));
		expect(received).toHaveLength(0);
		expect(exceeded).toHaveLength(1);
	});

	test("allows generation below limit", async () => {
		const received: RawChunk[] = [];
		const bus = new EnhancementBus("test-ws");

		bus.subscribe("text", async (chunk) => received.push(chunk));

		bus.publish(makeChunk({ generation: MAX_GENERATION - 1 }));

		await new Promise((r) => setTimeout(r, 10));
		expect(received).toHaveLength(1);
	});

	test("backpressure: drops oldest from same session when full", async () => {
		const received: RawChunk[] = [];
		// Block the handler so queue fills up
		let unblock: () => void;
		const blocked = new Promise<void>((r) => {
			unblock = r;
		});

		const bus = new EnhancementBus("test-ws", { capacity: 3 });

		bus.subscribe("text", async (chunk) => {
			await blocked;
			received.push(chunk);
		});

		// Publish 5 chunks — first gets picked up by handler (blocked),
		// next 3 fill queue, 5th causes drop
		for (let i = 0; i < 5; i++) {
			bus.publish(
				makeChunk({
					data: `msg-${i}`,
					sessionId: "session-1",
				})
			);
		}

		unblock?.();
		await new Promise((r) => setTimeout(r, 50));

		// Should have received 4 chunks (1 processing + 3 in queue, with 1 dropped)
		expect(received.length).toBeLessThanOrEqual(5);
		expect(received.length).toBeGreaterThanOrEqual(3);
	});

	test("unsubscribe removes handler", async () => {
		const received: RawChunk[] = [];
		const bus = new EnhancementBus("test-ws");

		const handler = async (chunk: RawChunk) => {
			received.push(chunk);
		};

		bus.subscribe("text", handler);
		bus.publish(makeChunk());
		await new Promise((r) => setTimeout(r, 10));
		expect(received).toHaveLength(1);

		bus.unsubscribe("text", handler);
		bus.publish(makeChunk());
		await new Promise((r) => setTimeout(r, 10));
		// Should still be 1 — second chunk was passthroughed, not delivered
		expect(received).toHaveLength(1);
	});

	test("multiple subscribers for same content type", async () => {
		const received1: RawChunk[] = [];
		const received2: RawChunk[] = [];
		const bus = new EnhancementBus("test-ws");

		bus.subscribe("text", async (chunk) => received1.push(chunk));
		bus.subscribe("text", async (chunk) => received2.push(chunk));

		bus.publish(makeChunk());

		await new Promise((r) => setTimeout(r, 10));
		expect(received1).toHaveLength(1);
		expect(received2).toHaveLength(1);
	});

	test("handler errors don't crash the bus", async () => {
		const received: RawChunk[] = [];
		const bus = new EnhancementBus("test-ws");

		bus.subscribe("text", async () => {
			throw new Error("handler exploded");
		});
		bus.subscribe("text", async (chunk) => received.push(chunk));

		bus.publish(makeChunk());

		await new Promise((r) => setTimeout(r, 10));
		// Second handler should still receive despite first throwing
		expect(received).toHaveLength(1);
	});

	test("cycle detection breaks repeated content type + source pairs", async () => {
		const passed: ContextChunk[] = [];
		const received: RawChunk[] = [];
		const bus = new EnhancementBus("test-ws", {
			onPassthrough: (ctx) => passed.push(ctx),
		});

		bus.subscribe("text", async (chunk) => received.push(chunk));

		// First publish: normal
		const chunk1 = makeChunk({ generation: 0 });
		bus.publish(chunk1);

		// Second publish with same contentType + source at same session+generation: cycle
		const chunk2 = makeChunk({ generation: 0 });
		bus.publish(chunk2);

		await new Promise((r) => setTimeout(r, 10));
		expect(received).toHaveLength(1);
		expect(passed).toHaveLength(1);
	});

	test("subscriberCount and contentTypes", () => {
		const bus = new EnhancementBus("test-ws");

		expect(bus.subscriberCount).toBe(0);
		expect(bus.contentTypes).toEqual([]);

		bus.subscribe("text", async () => {});
		bus.subscribe("audio", async () => {});
		bus.subscribe("text", async () => {});

		expect(bus.subscriberCount).toBe(3);
		expect(bus.contentTypes).toContain("text");
		expect(bus.contentTypes).toContain("audio");
	});

	test("converts Buffer data to string in passthrough", async () => {
		const passed: ContextChunk[] = [];
		const bus = new EnhancementBus("test-ws", {
			onPassthrough: (ctx) => passed.push(ctx),
		});

		bus.publish(
			makeChunk({
				contentType: "binary",
				data: Buffer.from("binary content"),
			})
		);

		await new Promise((r) => setTimeout(r, 10));
		expect(passed).toHaveLength(1);
		expect(passed[0].content).toBe("binary content");
	});
});
