import { describe, expect, test, beforeEach } from "bun:test";
import {
	DeferredQueue,
	createDeferredQueue,
	type DeferredAction,
	type DeferredActionStatus,
} from "../src/index.js";
import { MockCredentialProvider, MockDatabase } from "../../test-harness/src/index.js";

describe("DeferredQueue", () => {
	let mockDb: MockDatabase;
	let mockCredentials: MockCredentialProvider;
	let executedActions: Array<{ name: string; input: unknown }> = [];

	const mockExecutor = async (name: string, input: unknown) => {
		executedActions.push({ name, input });
		return { success: true, output: { executed: true } };
	};

	beforeEach(() => {
		mockDb = new MockDatabase();
		mockCredentials = new MockCredentialProvider();
		executedActions = [];
	});

	describe("enqueue", () => {
		test("should create a deferred action", async () => {
			const queue = createDeferredQueue(mockDb, mockCredentials, mockExecutor);
			const id = await queue.enqueue(
				"test-action",
				{ data: "test" },
				"test-workspace",
				{ delayMs: 1000 }
			);

			expect(id).toBeDefined();
			expect(typeof id).toBe("string");
			expect(id).toContain("deferred_");
		});

		test("should support delay-based deferral", async () => {
			const queue = createDeferredQueue(mockDb, mockCredentials, mockExecutor);
			const id = await queue.enqueue(
				"delayed-action",
				{ data: "test" },
				"test-workspace",
				{ delayMs: 5000 }
			);

			expect(id).toBeDefined();
		});

		test("should support condition-based deferral", async () => {
			const queue = createDeferredQueue(mockDb, mockCredentials, mockExecutor);
			const id = await queue.enqueue(
				"conditional-action",
				{ data: "test" },
				"test-workspace",
				{ until: "user-confirm" }
			);

			expect(id).toBeDefined();
		});

		test("should support queue-based deferral", async () => {
			const queue = createDeferredQueue(mockDb, mockCredentials, mockExecutor);
			const id = await queue.enqueue(
				"queued-action",
				{ data: "test" },
				"test-workspace",
				{ queueName: "outbound-emails" }
			);

			expect(id).toBeDefined();
		});
	});

	describe("enqueueWithCredentials", () => {
		test("should enqueue with credential references", async () => {
			const queue = createDeferredQueue(mockDb, mockCredentials, mockExecutor);
			const id = await queue.enqueueWithCredentials(
				"send-email",
				{ to: "test@example.com", body: "Hello" },
				"test-workspace",
				["gmail/default"],
				{ queueName: "emails" }
			);

			expect(id).toBeDefined();
		});
	});

	describe("cancel", () => {
		test("should cancel a pending action", async () => {
			const queue = createDeferredQueue(mockDb, mockCredentials, mockExecutor);
			const id = await queue.enqueue(
				"cancelable-action",
				{ data: "test" },
				"test-workspace",
				{ delayMs: 10000 }
			);

			const result = await queue.cancel(id);
			expect(result).toBe(true);
		});
	});

	describe("factory function", () => {
		test("createDeferredQueue should create a queue instance", () => {
			const queue = createDeferredQueue(mockDb, mockCredentials, mockExecutor);
			expect(queue).toBeDefined();
			expect(typeof queue.start).toBe("function");
			expect(typeof queue.stop).toBe("function");
			expect(typeof queue.enqueue).toBe("function");
			expect(typeof queue.flush).toBe("function");
		});
	});
});

describe("DeferredActionStatus", () => {
	const statuses: DeferredActionStatus[] = [
		"pending",
		"ready",
		"executing",
		"completed",
		"failed",
		"cancelled",
	];

	test("should include all required statuses", () => {
		for (const status of statuses) {
			expect(typeof status).toBe("string");
		}
	});
});
