import { describe, expect, test } from "bun:test";
import {
	JoinSynchronizer,
	JoinError,
	createWaitAllJoin,
	createWaitAnyJoin,
	createBarrierJoin,
	createTimeoutJoin,
	createFirstWinsJoin,
} from "../src/index.js";
import type { JoinStrategy } from "@loomai/types";

describe("@loomai/join-synchronizer conformance", () => {
	test("exports JoinSynchronizer", () => {
		expect(JoinSynchronizer).toBeDefined();
		expect(typeof JoinSynchronizer).toBe("function");
	});

	test("exports JoinError", () => {
		expect(JoinError).toBeDefined();
		expect(typeof JoinError).toBe("function");
	});

	test("exports all factory functions", () => {
		expect(createWaitAllJoin).toBeDefined();
		expect(createWaitAnyJoin).toBeDefined();
		expect(createBarrierJoin).toBeDefined();
		expect(createTimeoutJoin).toBeDefined();
		expect(createFirstWinsJoin).toBeDefined();
	});

	test("supports all 5 join strategies", () => {
		const strategies: JoinStrategy[] = ["wait-all", "wait-any", "barrier", "timeout", "first-wins"];
		
		for (const strategy of strategies) {
			const sync = new JoinSynchronizer({ strategy });
			expect(sync.getConfig().strategy).toBe(strategy);
		}
	});

	test("JoinError includes failed branch IDs", () => {
		const error = new JoinError("Test error", ["branch-a", "branch-b"]);
		expect(error.failedBranchIds).toContain("branch-a");
		expect(error.failedBranchIds).toContain("branch-b");
	});
});
