import { describe, expect, it } from "bun:test";
import {
	createBarrierJoin,
	createFirstWinsJoin,
	createTimeoutJoin,
	createWaitAllJoin,
	createWaitAnyJoin,
	JoinError,
	JoinSynchronizer,
} from "../src/index.js";
import type { RawChunk } from "../../types/src/index.js";

// --- Test Helpers ---

function createMockChunk(
	source: string,
	contentType: string,
	data: string,
	timestamp: number,
	generation = 1
): RawChunk {
	return {
		kind: "raw",
		source,
		workspace: "test-workspace",
		sessionId: "test-session",
		contentType,
		data: Buffer.from(data),
		timestamp,
		generation,
		metadata: {},
	};
}

// --- Test Suite ---

describe("JoinSynchronizer", () => {
	describe("wait-all strategy", () => {
		it("should wait for all branches to complete", async () => {
			const synchronizer = createWaitAllJoin();
			const branchIds = ["branch-a", "branch-b", "branch-c"];

			// Start consuming the join stream
			const streamPromise = (async () => {
				const generator = synchronizer.joinStream(branchIds);
				const result = await generator.next();
				return result.value;
			})();

			// Complete branches one by one
			synchronizer.markComplete("branch-a");
			await new Promise((resolve) => setTimeout(resolve, 10));
			// Should not resolve yet

			synchronizer.markComplete("branch-b");
			await new Promise((resolve) => setTimeout(resolve, 10));
			// Should not resolve yet

			synchronizer.markComplete("branch-c");

			const result = await streamPromise;
			expect(result).toBeDefined();
		});

		it("should collect all chunks from all branches", () => {
			const synchronizer = createWaitAllJoin();
			const branchIds = ["branch-a", "branch-b"];

			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A1", 1000));
			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A2", 1001));
			synchronizer.addChunk("branch-b", createMockChunk("src-b", "text", "B1", 1000));

			synchronizer.markComplete("branch-a");
			synchronizer.markComplete("branch-b");

			const result = synchronizer.getAllChunks(branchIds);
			expect(result).toHaveLength(3);
		});

		it("should throw error if continueOnError is false", async () => {
			const synchronizer = createWaitAllJoin(false);
			const branchIds = ["branch-a", "branch-b"];

			// Start consuming
			const generator = synchronizer.joinStream(branchIds);
			const nextPromise = generator.next();

			// Mark one branch complete, one with error
			synchronizer.markComplete("branch-a");
			synchronizer.markError("branch-b", new Error("Branch B failed"));

			await expect(nextPromise).rejects.toThrow(JoinError);
		});

		it("should continue with partial results if continueOnError is true", async () => {
			const synchronizer = createWaitAllJoin(true);
			const branchIds = ["branch-a", "branch-b"];

			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A1", 1000));
			synchronizer.markComplete("branch-a");
			synchronizer.markError("branch-b", new Error("Branch B failed"));

			// Need to wait for markComplete to process on error branch
			await new Promise((resolve) => setTimeout(resolve, 20));

			const generator = synchronizer.joinStream(branchIds);
			const result = await generator.next();

			expect(result.value).toHaveLength(1);
			expect(result.value?.[0]?.data.toString()).toBe("A1");
		});
	});

	describe("wait-any strategy", () => {
		it("should emit as soon as any branch completes", async () => {
			const synchronizer = createWaitAnyJoin();
			const branchIds = ["branch-a", "branch-b", "branch-c"];

			// Start consuming
			const generator = synchronizer.joinStream(branchIds);
			const nextPromise = generator.next();

			// Complete only one branch
			synchronizer.markComplete("branch-b");

			const result = await nextPromise;
			expect(result.done).toBe(false);
			expect(result.value).toBeDefined();
		});

		it("should emit when first branch completes with chunks", async () => {
			const synchronizer = createWaitAnyJoin();
			const branchIds = ["branch-a", "branch-b"];

			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A1", 1000));

			const generator = synchronizer.joinStream(branchIds);
			const nextPromise = generator.next();

			synchronizer.markComplete("branch-a");

			const result = await nextPromise;
			expect(result.value).toHaveLength(1);
		});
	});

	describe("barrier strategy", () => {
		it("should wait for barrierSize chunks from each branch", async () => {
			const barrierSize = 3;
			const synchronizer = createBarrierJoin(barrierSize);
			const branchIds = ["branch-a", "branch-b"];

			// Start consuming
			const generator = synchronizer.joinStream(branchIds);
			const nextPromise = generator.next();

			// Add chunks below barrier
			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A1", 1000));
			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A2", 1001));
			await new Promise((resolve) => setTimeout(resolve, 10));

			synchronizer.addChunk("branch-b", createMockChunk("src-b", "text", "B1", 1000));
			synchronizer.addChunk("branch-b", createMockChunk("src-b", "text", "B2", 1001));
			synchronizer.addChunk("branch-b", createMockChunk("src-b", "text", "B3", 1002));
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Still waiting for branch-a to hit barrier
			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A3", 1002));

			const result = await nextPromise;
			// Total: A1, A2, A3, B1, B2, B3 = 6 chunks
			expect(result.value).toHaveLength(6);
		});

		it("should use default barrierSize of 1 if not specified", async () => {
			const synchronizer = new JoinSynchronizer({ strategy: "barrier" });
			const branchIds = ["branch-a", "branch-b"];

			const generator = synchronizer.joinStream(branchIds);
			const nextPromise = generator.next();

			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A1", 1000));
			synchronizer.addChunk("branch-b", createMockChunk("src-b", "text", "B1", 1000));

			const result = await nextPromise;
			expect(result.value).toHaveLength(2);
		});
	});

	describe("timeout strategy", () => {
		it("should emit after timeout expires", async () => {
			const timeoutMs = 50;
			const synchronizer = createTimeoutJoin(timeoutMs);
			const branchIds = ["branch-a", "branch-b"];

			// Add a chunk before timeout
			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A1", 1000));

			const generator = synchronizer.joinStream(branchIds);
			const nextPromise = generator.next();

			const start = Date.now();
			const result = await nextPromise;
			const elapsed = Date.now() - start;

			expect(elapsed).toBeGreaterThanOrEqual(timeoutMs - 10); // Allow for some variance
			expect(result.value).toHaveLength(1);
			expect(result.value?.[0]?.data.toString()).toBe("A1");
		});

		it("should emit earlier if condition is met before timeout", async () => {
			const timeoutMs = 500; // Longer timeout
			const synchronizer = createTimeoutJoin(timeoutMs);
			const branchIds = ["branch-a"];

			const generator = synchronizer.joinStream(branchIds);
			const nextPromise = generator.next();

			synchronizer.markComplete("branch-a");

			const start = Date.now();
			const result = await nextPromise;
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(timeoutMs - 100);
			expect(result.value).toBeDefined();
		});
	});

	describe("first-wins strategy", () => {
		it("should return only chunks from first completed branch", async () => {
			const synchronizer = createFirstWinsJoin();
			const branchIds = ["branch-a", "branch-b"];

			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A1", 1000));
			synchronizer.addChunk("branch-a", createMockChunk("src-a", "text", "A2", 1001));
			synchronizer.addChunk("branch-b", createMockChunk("src-b", "text", "B1", 1000));

			// Complete branch-b first
			synchronizer.markComplete("branch-b");
			await new Promise((resolve) => setTimeout(resolve, 10));
			synchronizer.markComplete("branch-a");

			const generator = synchronizer.joinStream(branchIds);
			const result = await generator.next();

			// Should only get branch-b's chunks
			expect(result.value).toHaveLength(1);
			expect(result.value?.[0]?.data.toString()).toBe("B1");
		});

		it("should use completion time to determine first", async () => {
			const synchronizer = createFirstWinsJoin();
			const branchIds = ["fast-branch", "slow-branch"];

			synchronizer.addChunk("fast-branch", createMockChunk("src-f", "text", "Fast", 1000));
			synchronizer.addChunk("slow-branch", createMockChunk("src-s", "text", "Slow", 1000));

			// Complete fast branch first
			synchronizer.markComplete("fast-branch");
			await new Promise((resolve) => setTimeout(resolve, 50));
			synchronizer.markComplete("slow-branch");

			const firstResult = synchronizer.getFirstCompletedChunks(branchIds);
			expect(firstResult?.branchId).toBe("fast-branch");
			expect(firstResult?.chunks).toHaveLength(1);
			expect(firstResult?.chunks[0]?.data.toString()).toBe("Fast");
		});
	});

	describe("error handling", () => {
		it("should track errors per branch", () => {
			const synchronizer = createWaitAllJoin(true);
			synchronizer.markError("branch-a", new Error("Error A"));
			synchronizer.markError("branch-b", new Error("Error B"));

			const stats = synchronizer.getStats();
			expect(stats.errors).toBe(2);
		});

		it("should not mark as failed when continueOnError is true", () => {
			const synchronizer = createWaitAllJoin(true);
			synchronizer.markError("branch-a", new Error("Test error"));

			expect(synchronizer.isFailed()).toBe(false);
		});

		it("should mark as failed when continueOnError is false", () => {
			const synchronizer = createWaitAllJoin(false);
			synchronizer.markError("branch-a", new Error("Test error"));

			expect(synchronizer.isFailed()).toBe(true);
		});

		it("should include branch IDs in JoinError", async () => {
			const synchronizer = createWaitAllJoin(false);
			const branchIds = ["branch-a", "branch-b"];

			const generator = synchronizer.joinStream(branchIds);
			const nextPromise = generator.next();

			synchronizer.markError("branch-a", new Error("Error in A"));
			synchronizer.markError("branch-b", new Error("Error in B"));

			try {
				await nextPromise;
				expect.fail("Should have thrown JoinError");
			} catch (error) {
				expect(error).toBeInstanceOf(JoinError);
				if (error instanceof JoinError) {
					expect(error.failedBranchIds).toContain("branch-a");
					expect(error.failedBranchIds).toContain("branch-b");
				}
			}
		});
	});

	describe("branch registration", () => {
		it("should auto-register branches on addChunk", () => {
			const synchronizer = createWaitAllJoin();

			synchronizer.addChunk("unregistered-branch", createMockChunk("src", "text", "data", 1000));

			const stats = synchronizer.getStats();
			expect(stats.totalBranches).toBe(1);
		});

		it("should auto-register branches on markComplete", () => {
			const synchronizer = createWaitAllJoin();

			synchronizer.markComplete("unregistered-branch");

			const stats = synchronizer.getStats();
			expect(stats.totalBranches).toBe(1);
			expect(stats.completedBranches).toBe(1);
		});

		it("should register all branches at start of joinStream", async () => {
			const synchronizer = createWaitAllJoin();
			const branchIds = ["a", "b", "c"];

			// Start the stream - this registers branches
			const generator = synchronizer.joinStream(branchIds);

			// Complete all branches to finish the join
			synchronizer.markComplete("a");
			synchronizer.markComplete("b");
			synchronizer.markComplete("c");

			// Wait for the join to complete
			await generator.next();

			const stats = synchronizer.getStats();
			expect(stats.totalBranches).toBe(3);
			expect(stats.completedBranches).toBe(3);
		});
	});

	describe("stats tracking", () => {
		it("should track total chunks across all branches", () => {
			const synchronizer = createWaitAllJoin();

			synchronizer.addChunk("a", createMockChunk("src", "text", "1", 1000));
			synchronizer.addChunk("a", createMockChunk("src", "text", "2", 1001));
			synchronizer.addChunk("b", createMockChunk("src", "text", "3", 1000));

			const stats = synchronizer.getStats();
			expect(stats.totalChunks).toBe(3);
		});

		it("should track duration", async () => {
			const synchronizer = createWaitAllJoin();
			const branchIds = ["a"];

			const generator = synchronizer.joinStream(branchIds);
			const nextPromise = generator.next();

			await new Promise((resolve) => setTimeout(resolve, 50));
			synchronizer.markComplete("a");
			await nextPromise;

			const stats = synchronizer.getStats();
			expect(stats.durationMs).toBeGreaterThanOrEqual(40); // Allow some variance
		});
	});

	describe("reset functionality", () => {
		it("should clear all state on reset", () => {
			const synchronizer = createWaitAllJoin();

			synchronizer.addChunk("a", createMockChunk("src", "text", "data", 1000));
			synchronizer.markComplete("a");
			synchronizer.markError("b", new Error("Error"));

			synchronizer.reset();

			const stats = synchronizer.getStats();
			expect(stats.totalBranches).toBe(0);
			expect(stats.totalChunks).toBe(0);
			expect(stats.errors).toBe(0);
		});
	});

	describe("convenience factory functions", () => {
		it("createWaitAllJoin should use wait-all strategy", () => {
			const sync = createWaitAllJoin(true);
			expect(sync.getConfig().strategy).toBe("wait-all");
			expect(sync.getConfig().continueOnError).toBe(true);
		});

		it("createWaitAnyJoin should use wait-any strategy", () => {
			const sync = createWaitAnyJoin();
			expect(sync.getConfig().strategy).toBe("wait-any");
		});

		it("createBarrierJoin should use barrier strategy with size", () => {
			const sync = createBarrierJoin(5);
			expect(sync.getConfig().strategy).toBe("barrier");
			expect(sync.getConfig().barrierSize).toBe(5);
		});

		it("createTimeoutJoin should use timeout strategy with ms", () => {
			const sync = createTimeoutJoin(1000);
			expect(sync.getConfig().strategy).toBe("timeout");
			expect(sync.getConfig().timeoutMs).toBe(1000);
		});

		it("createFirstWinsJoin should use first-wins strategy", () => {
			const sync = createFirstWinsJoin();
			expect(sync.getConfig().strategy).toBe("first-wins");
		});
	});

	describe("join result methods", () => {
		it("join() should return map of all branch chunks", () => {
			const synchronizer = createWaitAllJoin();
			const branchIds = ["a", "b"];

			synchronizer.addChunk("a", createMockChunk("src-a", "text", "A1", 1000));
			synchronizer.addChunk("b", createMockChunk("src-b", "text", "B1", 1000));
			synchronizer.addChunk("b", createMockChunk("src-b", "text", "B2", 1001));

			const result = synchronizer.join(branchIds);
			expect(result.get("a")).toHaveLength(1);
			expect(result.get("b")).toHaveLength(2);
		});

		it("getAllChunks() should flatten all branch chunks", () => {
			const synchronizer = createWaitAllJoin();
			const branchIds = ["a", "b"];

			synchronizer.addChunk("a", createMockChunk("src-a", "text", "A1", 1000));
			synchronizer.addChunk("b", createMockChunk("src-b", "text", "B1", 1000));
			synchronizer.addChunk("b", createMockChunk("src-b", "text", "B2", 1001));

			const result = synchronizer.getAllChunks(branchIds);
			expect(result).toHaveLength(3);
		});

		it("getFirstCompletedChunks() should return null if no branches completed", () => {
			const synchronizer = createFirstWinsJoin();
			const branchIds = ["a", "b"];

			synchronizer.addChunk("a", createMockChunk("src-a", "text", "A1", 1000));

			const result = synchronizer.getFirstCompletedChunks(branchIds);
			expect(result).toBeNull();
		});
	});

	describe("edge cases", () => {
		it("should handle empty branch IDs", async () => {
			const synchronizer = createWaitAllJoin();
			const generator = synchronizer.joinStream([]);
			const result = await generator.next();
			expect(result.value).toHaveLength(0);
		});

		it("should handle single branch", async () => {
			const synchronizer = createWaitAllJoin();
			const generator = synchronizer.joinStream(["only-branch"]);

			synchronizer.markComplete("only-branch");

			const result = await generator.next();
			expect(result.value).toHaveLength(0); // No chunks added
			expect(result.done).toBe(false);
		});

		it("should handle multiple chunks via addChunks", () => {
			const synchronizer = createWaitAllJoin();
			const chunks = [
				createMockChunk("src", "text", "1", 1000),
				createMockChunk("src", "text", "2", 1001),
				createMockChunk("src", "text", "3", 1002),
			];

			synchronizer.addChunks("branch-a", chunks);

			const stats = synchronizer.getStats();
			expect(stats.totalChunks).toBe(3);
		});
	});
});
