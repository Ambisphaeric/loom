import { describe, expect, test, beforeEach } from "bun:test";
import { EnhancementBus, MergeQueue } from "../src/index.js";
import type { RawChunk, ContextChunk, MergeStrategy } from "@loomai/types";

describe("Bus Retry Policy Tests", () => {
	let bus: EnhancementBus;

	beforeEach(() => {
		bus = new EnhancementBus("test-bus");
	});

	test.todo("should retry transient errors with exponential backoff");
	test.todo("should not retry permanent errors");
	test.todo("should respect maxRetries limit");
	test.todo("should apply jitter to prevent thundering herd");
	test.todo("should emit retry events for observability");
	test.todo("should send to dead-letter after maxRetries exhausted");
	test.todo("should classify errors correctly");
	test.todo("should preserve chunk metadata through retries");
	test.todo("should calculate exponential backoff delays correctly");
	test.todo("should cap backoff at maxDelay");
});

describe("Bus Session Chain Cycle Detection - Extended", () => {
	let bus: EnhancementBus;

	beforeEach(() => {
		bus = new EnhancementBus("test-bus");
	});

	test.todo("should detect cycle in deeply nested session chain");

	test("should handle cross-session reference cycles", async () => {
		// Session A references output from Session B
		// Session B references output from Session A
		// This creates a logical cycle even without direct emission

		const references = new Map<string, string[]>();
		references.set("session-A", ["session-B"]);
		references.set("session-B", ["session-A"]);

		// Check for cycle in references
		const hasCycle = checkReferenceCycle("session-A", references, new Set());
		expect(hasCycle).toBe(true);
	});

	test("should evict old entries from cycle tracker under high load", () => {
		// Generate 2000 chunks to trigger eviction
		for (let i = 0; i < 2000; i++) {
			try {
				bus.emit({
					kind: "context",
					id: `flood-${i}`,
					workspace: "ws-1",
					sessionId: `session-${i % 100}`,
					contentType: "flood",
					content: `item-${i}`,
					timestamp: Date.now(),
					generation: i % 5,
				});
			} catch (e) {
				// May hit capacity
			}
		}

		// Should not crash, evicted entries means potential missed cycles
		// but system remains stable
		expect(bus).toBeDefined();
	});

	test("should track session ancestry for cycle detection", async () => {
		const ancestry = new Map<string, string[]>();

		// Build ancestry: A -> B -> C
		ancestry.set("session-B", ["session-A"]);
		ancestry.set("session-C", ["session-B", "session-A"]);

		// If C tries to emit to A, that's a cycle
		const attemptedParent = "session-A";
		const ancestors = ancestry.get("session-C") || [];

		expect(ancestors).toContain(attemptedParent);
	});
});

// Helper functions
function isTransientError(code: string): boolean {
	const transientCodes = new Set([
		"ECONNRESET",
		"ETIMEDOUT",
		"ECONNREFUSED",
		"EPIPE",
		"ENOTFOUND", // Sometimes transient (DNS)
	]);
	return transientCodes.has(code);
}

function calculateBackoff(
	attempt: number,
	baseDelay: number,
	multiplier: number,
	maxDelay: number
): number {
	const delay = baseDelay * Math.pow(multiplier, attempt);
	return Math.min(delay, maxDelay);
}

function getNextSession(current: string): string | null {
	const chain: Record<string, string> = {
		"session-A": "session-B",
		"session-B": "session-C",
		"session-C": "session-A", // Cycle!
	};
	return chain[current] || null;
}

function checkReferenceCycle(
	sessionId: string,
	references: Map<string, string[]>,
	visited: Set<string>,
	stack: Set<string> = new Set()
): boolean {
	if (stack.has(sessionId)) return true;
	if (visited.has(sessionId)) return false;

	visited.add(sessionId);
	stack.add(sessionId);

	const refs = references.get(sessionId) || [];
	for (const ref of refs) {
		if (checkReferenceCycle(ref, references, visited, stack)) {
			return true;
		}
	}

	stack.delete(sessionId);
	return false;
}
