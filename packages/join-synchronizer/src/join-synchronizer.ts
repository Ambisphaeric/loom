// ============================================================================
// Enhancement — Join Synchronizer
// Coordinates parallel branches with configurable join strategies
// ============================================================================

import type { RawChunk } from "@enhancement/types";

// ============================================================================
// Types
// ============================================================================

export type JoinStrategy =
	| "wait-all" // Wait for all branches to complete
	| "wait-any" // Emit as soon as any branch produces
	| "barrier" // Wait for N chunks from each branch
	| "timeout" // Wait up to X ms
	| "first-wins"; // Take result from first completed branch

export interface JoinConfig {
	strategy: JoinStrategy;
	barrierSize?: number; // for 'barrier' strategy
	timeoutMs?: number; // for 'timeout' strategy
	continueOnError?: boolean; // don't fail if one branch errors
}

export interface BranchState {
	chunks: RawChunk[];
	completed: boolean;
	error?: Error;
	startedAt: number;
	completedAt?: number;
}

// ============================================================================
// Join Synchronizer
// ============================================================================

export class JoinSynchronizer {
	private branches: Map<string, BranchState> = new Map();
	private errors: Map<string, Error> = new Map();
	private startedAt: number = Date.now();

	constructor(private config: JoinConfig) {}

	/**
	 * Get the join configuration
	 */
	getConfig(): JoinConfig {
		return this.config;
	}

	/**
	 * Register a branch to be synchronized
	 */
	registerBranch(branchId: string): void {
		if (!this.branches.has(branchId)) {
			this.branches.set(branchId, {
				chunks: [],
				completed: false,
				startedAt: Date.now(),
			});
		}
	}

	/**
	 * Add a chunk from a branch
	 */
	addChunk(branchId: string, chunk: RawChunk): void {
		this.registerBranch(branchId);
		const state = this.branches.get(branchId);
		if (!state) {
			throw new Error(`Branch ${branchId} not found after registration`);
		}
		state.chunks.push(chunk);
	}

	/**
	 * Add multiple chunks from a branch
	 */
	addChunks(branchId: string, chunks: RawChunk[]): void {
		for (const chunk of chunks) {
			this.addChunk(branchId, chunk);
		}
	}

	/**
	 * Mark a branch as complete
	 */
	markComplete(branchId: string): void {
		this.registerBranch(branchId);
		const state = this.branches.get(branchId)!;
		state.completed = true;
		state.completedAt = Date.now();
	}

	/**
	 * Mark a branch as errored
	 */
	markError(branchId: string, error: Error): void {
		this.registerBranch(branchId);
		const state = this.branches.get(branchId)!;
		state.error = error;
		this.errors.set(branchId, error);

		if (this.config.continueOnError) {
			this.markComplete(branchId);
		}
	}

	/**
	 * Check if join condition is met
	 */
	isReady(branchIds: string[]): boolean {
		switch (this.config.strategy) {
			case "wait-all":
				return branchIds.every((id) => this.branches.get(id)?.completed);
			case "wait-any":
				return branchIds.some((id) => this.branches.get(id)?.completed);
			case "barrier":
				return branchIds.every(
					(id) => (this.branches.get(id)?.chunks.length || 0) >= (this.config.barrierSize || 1)
				);
			case "timeout":
				// Timeout strategy: return true if all branches completed OR timeout has passed
				// (handled externally via timedOut flag)
				return branchIds.every((id) => this.branches.get(id)?.completed);
			case "first-wins":
				return branchIds.some((id) => this.branches.get(id)?.completed);
			default:
				return false;
		}
	}

	/**
	 * Check if the join has failed (errors without continueOnError)
	 */
	isFailed(): boolean {
		if (this.config.continueOnError) return false;
		return this.errors.size > 0;
	}

	/**
	 * Get joined result for all branches
	 */
	join(branchIds: string[]): Map<string, RawChunk[]> {
		const result = new Map<string, RawChunk[]>();
		for (const branchId of branchIds) {
			const state = this.branches.get(branchId);
			result.set(branchId, state?.chunks || []);
		}
		return result;
	}

	/**
	 * Get a single array of all joined chunks (for strategies like first-wins)
	 */
	getAllChunks(branchIds: string[]): RawChunk[] {
		const result: RawChunk[] = [];
		for (const branchId of branchIds) {
			const state = this.branches.get(branchId);
			if (state?.chunks) {
				result.push(...state.chunks);
			}
		}
		return result;
	}

	/**
	 * Get chunks from the first completed branch (for first-wins strategy)
	 */
	getFirstCompletedChunks(branchIds: string[]): { branchId: string; chunks: RawChunk[] } | null {
		// Find first completed branch by completion time
		let firstBranch: { id: string; state: BranchState } | null = null;

		for (const branchId of branchIds) {
			const state = this.branches.get(branchId);
			if (state?.completed && state?.completedAt) {
				if (!firstBranch || state.completedAt < firstBranch.state.completedAt!) {
					firstBranch = { id: branchId, state };
				}
			}
		}

		if (!firstBranch) return null;
		return { branchId: firstBranch.id, chunks: firstBranch.state.chunks };
	}

	/**
	 * Async generator that yields when join condition is met
	 * Handles timeout strategy with proper cleanup
	 */
	async *joinStream(branchIds: string[]): AsyncGenerator<RawChunk[], void, unknown> {
		// Register all branches
		for (const branchId of branchIds) {
			this.registerBranch(branchId);
		}

		if (branchIds.length === 0) {
			yield [];
			return;
		}

		// Set up timeout if configured
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let timedOut = false;

		if (this.config.strategy === "timeout" && this.config.timeoutMs) {
			timeoutId = setTimeout(() => {
				timedOut = true;
			}, this.config.timeoutMs);
		}

		try {
			// Poll until ready or timeout
			while (true) {
				const ready = this.isReady(branchIds);
				const failed = this.isFailed();

				if (ready || failed || timedOut) {
					if (failed) {
						throw new JoinError(
							`Join failed with errors: ${Array.from(this.errors.values())
								.map((e) => e.message)
								.join(", ")}`,
							Array.from(this.errors.keys())
							);
					}
					yield this.getResultForStrategy(branchIds);
					return;
				}

				// Small delay to prevent busy-waiting
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		}
	}

	/**
	 * Get the appropriate result based on join strategy
	 */
	private getResultForStrategy(branchIds: string[]): RawChunk[] {
		switch (this.config.strategy) {
			case "first-wins": {
				const result = this.getFirstCompletedChunks(branchIds);
				return result?.chunks || [];
			}
			default:
				return this.getAllChunks(branchIds);
		}
	}

	/**
	 * Get statistics about the join operation
	 */
	getStats(): {
		durationMs: number;
		totalChunks: number;
		completedBranches: number;
		totalBranches: number;
		errors: number;
	} {
		let totalChunks = 0;
		let completedBranches = 0;

		for (const state of this.branches.values()) {
			totalChunks += state.chunks.length;
			if (state.completed) completedBranches++;
		}

		return {
			durationMs: Date.now() - this.startedAt,
			totalChunks,
			completedBranches,
			totalBranches: this.branches.size,
			errors: this.errors.size,
		};
	}

	/**
	 * Reset the synchronizer state
	 */
	reset(): void {
		this.branches.clear();
		this.errors.clear();
		this.startedAt = Date.now();
	}
}

// ============================================================================
// Join Error
// ============================================================================

export class JoinError extends Error {
	constructor(
		message: string,
		public readonly failedBranchIds: string[]
	) {
		super(message);
		this.name = "JoinError";
	}
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a JoinSynchronizer with wait-all strategy
 */
export function createWaitAllJoin(continueOnError = false): JoinSynchronizer {
	return new JoinSynchronizer({ strategy: "wait-all", continueOnError });
}

/**
 * Create a JoinSynchronizer with wait-any strategy
 */
export function createWaitAnyJoin(): JoinSynchronizer {
	return new JoinSynchronizer({ strategy: "wait-any" });
}

/**
 * Create a JoinSynchronizer with barrier strategy
 */
export function createBarrierJoin(barrierSize: number, continueOnError = false): JoinSynchronizer {
	return new JoinSynchronizer({ strategy: "barrier", barrierSize, continueOnError });
}

/**
 * Create a JoinSynchronizer with timeout strategy
 */
export function createTimeoutJoin(timeoutMs: number, continueOnError = false): JoinSynchronizer {
	return new JoinSynchronizer({ strategy: "timeout", timeoutMs, continueOnError });
}

/**
 * Create a JoinSynchronizer with first-wins strategy
 */
export function createFirstWinsJoin(): JoinSynchronizer {
	return new JoinSynchronizer({ strategy: "first-wins" });
}
