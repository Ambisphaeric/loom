import { ulid } from "ulidx";
import type { MergeStrategy } from "../../types/src/index.js";
import type { Bus, BusHandler, ContextChunk, RawChunk } from "../../types/src/index.js";
import { DEFAULT_BUS_CAPACITY, MAX_GENERATION } from "../../types/src/index.js";

interface QueueEntry {
	chunk: RawChunk;
	enqueuedAt: number;
}

class BoundedQueue {
	private items: QueueEntry[] = [];
	private processing = false;
	private drainScheduled = false;
	private handlers: Set<BusHandler> = new Set();

	constructor(private capacity: number) {}

	addHandler(handler: BusHandler): void {
		this.handlers.add(handler);
	}

	removeHandler(handler: BusHandler): void {
		this.handlers.delete(handler);
	}

	get handlerCount(): number {
		return this.handlers.size;
	}

	get handlersList(): BusHandler[] {
		return [...this.handlers];
	}

	enqueue(chunk: RawChunk): void {
		if (this.items.length >= this.capacity) {
			const sameSession = this.items.findIndex((e) => e.chunk.sessionId === chunk.sessionId);
			if (sameSession >= 0) {
				this.items.splice(sameSession, 1);
			} else {
				this.items.shift();
			}
		}
		this.items.push({ chunk, enqueuedAt: Date.now() });
		this.scheduleDrain();
	}

	get length(): number {
		return this.items.length;
	}

	private scheduleDrain(): void {
		if (!this.drainScheduled) {
			this.drainScheduled = true;
			queueMicrotask(() => {
				this.drainScheduled = false;
				void this.drain();
			});
		}
	}

	private async drain(): Promise<void> {
		if (this.processing) return;
		this.processing = true;

		while (this.items.length > 0) {
			const entry = this.items.shift();
			if (!entry) continue;
			const promises = [...this.handlers].map((handler) =>
				handler(entry.chunk).catch((err) => {
					console.error(`[Bus] Handler error for ${entry.chunk.contentType}:`, err);
				})
			);
			await Promise.allSettled(promises);
		}

		this.processing = false;

		if (this.items.length > 0) {
			this.scheduleDrain();
		}
	}
}

// ============================================================================
// MergeQueue — Multi-source subscription with merge strategies
// ============================================================================

export interface MergeQueueOptions {
	strategy: MergeStrategy;
	timeout?: number; // Timeout in ms for wait-all strategy
	outputContentType?: string; // Content type for merged output
}

type MergeHandler = (chunks: RawChunk[]) => Promise<void>;

export class MergeQueue {
	private buffers: Map<string, RawChunk[]> = new Map();
	private lastSeen: Map<string, number> = new Map(); // For latest strategy
	private timeoutId?: ReturnType<typeof setTimeout>;
	private isDraining = false;
	private onMerged: MergeHandler;
	private strategy: MergeStrategy;
	private timeout: number;
	private outputContentType?: string;

	constructor(
		private contentTypes: string[],
		options: MergeQueueOptions,
		onMerged: MergeHandler
	) {
		this.strategy = options.strategy;
		this.timeout = options.timeout ?? 5000; // Default 5s timeout
		this.outputContentType = options.outputContentType;
		this.onMerged = onMerged;

		// Initialize buffers for each content type
		for (const contentType of contentTypes) {
			this.buffers.set(contentType, []);
			this.lastSeen.set(contentType, 0);
		}

		// Set up timeout for wait-all strategy
		if (this.strategy === "wait-all") {
			this.timeoutId = setTimeout(() => {
				this.forceDrain();
			}, this.timeout);
		}
	}

	/**
	 * Enqueue a chunk from a specific source
	 */
	enqueue(contentType: string, chunk: RawChunk): void {
		if (!this.contentTypes.includes(contentType)) {
			return; // Ignore chunks from non-subscribed sources
		}

		const buffer = this.buffers.get(contentType);
		if (!buffer) return;

		// Update last seen timestamp
		this.lastSeen.set(contentType, Date.now());

		// Add to buffer
		buffer.push(chunk);

		// Check if merge condition is met
		this.checkAndMerge();
	}

	/**
	 * Check if merge condition is met and emit merged result
	 */
	private checkAndMerge(): void {
		switch (this.strategy) {
			case "zip":
				this.mergeZip();
				break;
			case "concat":
				this.mergeConcat();
				break;
			case "interleave":
				this.mergeInterleave();
				break;
			case "latest":
				this.mergeLatest();
				break;
			case "wait-all":
				this.mergeWaitAll();
				break;
		}
	}

	/**
	 * Zip: Emit paired chunks when all sources have same count
	 */
	private mergeZip(): void {
		const bufferArrays = this.getBufferArrays();
		const minLength = Math.min(...bufferArrays.map((arr) => arr.length));

		if (minLength > 0) {
			const toEmit: RawChunk[] = [];

			for (let i = 0; i < minLength; i++) {
				for (const buffer of bufferArrays) {
					const chunk = buffer[i];
					if (chunk) {
						toEmit.push(chunk);
					}
				}
			}

			// Clear emitted chunks from buffers
			this.clearFirstN(minLength);

			// Emit merged result
			void this.emitMerged(toEmit);
		}
	}

	/**
	 * Concat: Emit all buffered chunks and clear
	 */
	private mergeConcat(): void {
		const hasData = this.contentTypes.some((ct) => {
			const buffer = this.buffers.get(ct);
			return buffer && buffer.length > 0;
		});

		if (hasData) {
			const toEmit = this.getBufferArrays().flat();
			this.clearAll();
			void this.emitMerged(toEmit);
		}
	}

	/**
	 * Interleave: Emit when any source has data, round-robin style
	 */
	private mergeInterleave(): void {
		const bufferArrays = this.getBufferArrays();
		const maxLength = Math.max(...bufferArrays.map((arr) => arr.length));

		if (maxLength > 0) {
			const toEmit: RawChunk[] = [];

			for (let i = 0; i < maxLength; i++) {
				for (const buffer of bufferArrays) {
					const chunk = buffer[i];
					if (chunk) {
						toEmit.push(chunk);
					}
				}
			}

			// Clear all emitted chunks
			this.clearAll();
			void this.emitMerged(toEmit);
		}
	}

	/**
	 * Latest: Always emit the most recent chunk from each source
	 */
	private mergeLatest(): void {
		const toEmit: RawChunk[] = [];

		for (const contentType of this.contentTypes) {
			const buffer = this.buffers.get(contentType);
			if (buffer && buffer.length > 0) {
				// Get the most recent chunk
				const latest = buffer.reduce((latest, chunk) => {
					if (chunk.timestamp > latest.timestamp) return chunk;
					if (chunk.timestamp === latest.timestamp && chunk.generation > latest.generation)
						return chunk;
					return latest;
				}, buffer[0]);
				toEmit.push(latest);
			}
		}

		// For latest, we emit immediately when any source updates
		if (toEmit.length > 0) {
			// Keep buffers intact for latest strategy (just emit current state)
			void this.emitMerged(toEmit);
		}
	}

	/**
	 * Wait-all: Emit only when all sources have at least one chunk
	 */
	private mergeWaitAll(): void {
		const allHaveData = this.contentTypes.every((ct) => {
			const buffer = this.buffers.get(ct);
			return buffer && buffer.length > 0;
		});

		if (allHaveData) {
			// Clear timeout since we got all data
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = undefined;
			}

			const toEmit = this.getBufferArrays().flat();
			this.clearAll();
			void this.emitMerged(toEmit);
		}
	}

	/**
	 * Force drain current buffer state (used for timeout or explicit drain)
	 */
	drain(): RawChunk[] | null {
		if (this.isDraining) return null;
		this.isDraining = true;

		// Clear timeout
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = undefined;
		}

		const toEmit = this.getBufferArrays().flat();
		this.clearAll();

		this.isDraining = false;
		return toEmit.length > 0 ? toEmit : null;
	}

	/**
	 * Force drain and emit (used by timeout)
	 */
	private forceDrain(): void {
		const chunks = this.drain();
		if (chunks && chunks.length > 0) {
			void this.emitMerged(chunks);
		}
	}

	/**
	 * Get buffer contents as array of arrays
	 */
	private getBufferArrays(): RawChunk[][] {
		return this.contentTypes.map((ct) => this.buffers.get(ct) ?? []);
	}

	/**
	 * Clear first N chunks from each buffer
	 */
	private clearFirstN(n: number): void {
		for (const contentType of this.contentTypes) {
			const buffer = this.buffers.get(contentType);
			if (buffer) {
				this.buffers.set(contentType, buffer.slice(n));
			}
		}
	}

	/**
	 * Clear all buffers
	 */
	private clearAll(): void {
		for (const contentType of this.contentTypes) {
			this.buffers.set(contentType, []);
		}
	}

	/**
	 * Emit merged chunks to handler
	 */
	private async emitMerged(chunks: RawChunk[]): Promise<void> {
		if (chunks.length === 0) return;

		const outputType = this.outputContentType;
		const processedChunks: RawChunk[] = outputType
			? chunks.map((chunk): RawChunk => ({
					...chunk,
					contentType: outputType,
				}))
			: chunks;

		try {
			await this.onMerged(processedChunks);
		} catch (err) {
			console.error("[MergeQueue] Handler error:", err);
		}
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = undefined;
		}
		this.buffers.clear();
		this.lastSeen.clear();
	}
}

export type PassthroughHandler = (chunk: ContextChunk) => void;

export interface BusOptions {
	capacity?: number;
	onPassthrough?: PassthroughHandler;
	onGenerationExceeded?: PassthroughHandler;
}

export class EnhancementBus implements Bus {
	private queues = new Map<string, BoundedQueue>();
	private cycleTracker = new Map<string, Set<string>>();
	private capacity: number;
	private onPassthrough?: PassthroughHandler;
	private onGenerationExceeded?: PassthroughHandler;

	constructor(
		public readonly workspace: string,
		options: BusOptions = {}
	) {
		this.capacity = options.capacity ?? DEFAULT_BUS_CAPACITY;
		this.onPassthrough = options.onPassthrough;
		this.onGenerationExceeded = options.onGenerationExceeded;
	}

	publish(chunk: RawChunk): void {
		// Generation limit check
		if (chunk.generation >= MAX_GENERATION) {
			const ctx = this.rawToContext(chunk);
			this.onGenerationExceeded?.(ctx);
			return;
		}

		// Find or create queues for all matching patterns (exact + wildcards)
		const matchingQueues: BoundedQueue[] = [];

		// Check exact content type match
		const exactQueue = this.queues.get(chunk.contentType);
		if (exactQueue && exactQueue.handlerCount > 0) {
			matchingQueues.push(exactQueue);
		}

		// Check wildcard patterns (e.g., "notification/*" matches "notification/email")
		for (const [pattern, q] of this.queues) {
			if (pattern.includes("*")) {
				const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
				if (regex.test(chunk.contentType) && q.handlerCount > 0) {
					matchingQueues.push(q);
				}
			}
		}

		// No subscribers → passthrough to store
		if (matchingQueues.length === 0) {
			const ctx = this.rawToContext(chunk);
			this.onPassthrough?.(ctx);
			return;
		}

		// Cycle detection: track (contentType, source) pairs per chunk chain
		const chainKey = `${chunk.sessionId}:${chunk.generation}`;
		if (!this.cycleTracker.has(chainKey)) {
			this.cycleTracker.set(chainKey, new Set());
		}
		const visited = this.cycleTracker.get(chainKey);
		if (!visited) {
			return;
		}
		const pairKey = `${chunk.contentType}:${chunk.source}`;

		if (visited.has(pairKey)) {
			const ctx = this.rawToContext(chunk);
			this.onPassthrough?.(ctx);
			this.cycleTracker.delete(chainKey);
			return;
		}
		visited.add(pairKey);

		// Clean up old cycle tracking entries
		if (this.cycleTracker.size > 1000) {
			const keys = [...this.cycleTracker.keys()];
			for (let i = 0; i < keys.length - 500; i++) {
				this.cycleTracker.delete(keys[i]);
			}
		}

		// Enqueue to all matching queues
		for (const queue of matchingQueues) {
			queue.enqueue(chunk);
		}
	}

	subscribe(contentType: string, handler: BusHandler): () => void {
		if (!this.queues.has(contentType)) {
			this.queues.set(contentType, new BoundedQueue(this.capacity));
		}
		this.queues.get(contentType)?.addHandler(handler);

		// Return unsubscribe function
		return () => {
			this.unsubscribe(contentType, handler);
		};
	}

	unsubscribe(contentType: string, handler: BusHandler): void {
		const queue = this.queues.get(contentType);
		if (queue) {
			queue.removeHandler(handler);
		}
	}

	/**
	 * Subscribe to multiple content types with merge strategy
	 */
	subscribeMultiple(
		contentTypes: string[],
		handler: (chunks: RawChunk[]) => Promise<void>,
		options: { strategy: MergeStrategy; timeout?: number; outputContentType?: string }
	): () => void {
		if (contentTypes.length === 0) {
			return () => {}; // No-op unsubscribe
		}

		// Create merge queue
		const mergeQueue = new MergeQueue(
			contentTypes,
			{
				strategy: options.strategy,
				timeout: options.timeout,
				outputContentType: options.outputContentType,
			},
			handler
		);

		// Create wrapper handlers for each content type
		const handlers = new Map<string, BusHandler>();

		for (const contentType of contentTypes) {
			const wrapperHandler: BusHandler = async (chunk: RawChunk) => {
				mergeQueue.enqueue(contentType, chunk);
			};
			handlers.set(contentType, wrapperHandler);
			this.subscribe(contentType, wrapperHandler);
		}

		// Return unsubscribe function
		return () => {
			for (const [contentType, wrapperHandler] of handlers) {
				this.unsubscribe(contentType, wrapperHandler);
			}
			mergeQueue.destroy();
		};
	}

	get subscriberCount(): number {
		let count = 0;
		for (const queue of this.queues.values()) {
			count += queue.handlerCount;
		}
		return count;
	}

	get contentTypes(): string[] {
		return [...this.queues.keys()];
	}

	private rawToContext(chunk: RawChunk): ContextChunk {
		return {
			kind: "context",
			id: ulid(),
			source: chunk.source,
			workspace: chunk.workspace,
			sessionId: chunk.sessionId,
			content: typeof chunk.data === "string" ? chunk.data : chunk.data.toString("utf-8"),
			contentType: chunk.contentType,
			timestamp: chunk.timestamp,
			generation: chunk.generation,
			metadata: chunk.metadata,
		};
	}
}
