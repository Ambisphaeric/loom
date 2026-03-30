import { describe, expect, test } from "bun:test";
import {
	DeferredQueue,
	createDeferredQueue,
	type DeferredActionStatus,
	type ActionExecutor,
} from "../src/index.js";
import { MockCredentialProvider, MockDatabase } from "../../test-harness/src/index.js";

describe("@enhancement/deferred-queue conformance", () => {
	test("exports DeferredQueue", () => {
		expect(DeferredQueue).toBeDefined();
		expect(typeof DeferredQueue).toBe("function");
	});

	test("exports createDeferredQueue factory", () => {
		expect(createDeferredQueue).toBeDefined();
		expect(typeof createDeferredQueue).toBe("function");
	});

	test("exports all required types", () => {
		// Type-only exports - compile-time check
		const _statuses: DeferredActionStatus[] = [
			"pending",
			"ready",
			"executing",
			"completed",
			"failed",
			"cancelled",
		];
		expect(_statuses).toHaveLength(6);
	});

	test("queue has all required methods", () => {
		const mockDb = new MockDatabase();
		const mockCreds = new MockCredentialProvider();
		const mockExecutor: ActionExecutor = async () => ({ success: true });

		const queue = createDeferredQueue(mockDb, mockCreds, mockExecutor);

		expect(typeof queue.start).toBe("function");
		expect(typeof queue.stop).toBe("function");
		expect(typeof queue.enqueue).toBe("function");
		expect(typeof queue.enqueueWithCredentials).toBe("function");
		expect(typeof queue.cancel).toBe("function");
		expect(typeof queue.flush).toBe("function");
		expect(typeof queue.processReadyActions).toBe("function");
		expect(typeof queue.getPendingActions).toBe("function");
		expect(typeof queue.getAllActions).toBe("function");
	});

	test("queue can be created with mock dependencies", async () => {
		const mockDb = new MockDatabase();
		const mockCreds = new MockCredentialProvider();
		const mockExecutor: ActionExecutor = async () => ({ success: true });

		const queue = createDeferredQueue(mockDb, mockCreds, mockExecutor);
		const id = await queue.enqueue("test-action", {}, "workspace", { delayMs: 1000 });

		expect(id).toBeDefined();
		expect(id.startsWith("deferred_")).toBe(true);
	});
});
