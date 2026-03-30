/**
 * Bus Error Classification and Retry Policy
 *
 * Handles transient vs permanent error classification,
 * exponential backoff with jitter, and dead-letter queue.
 */

import type { RawChunk, ContextChunk } from "@loomai/types";

// ============================================================================
// Error Classification
// ============================================================================

export type ErrorCategory = "transient" | "permanent" | "unknown";

export interface ClassifiedError {
	original: Error;
	category: ErrorCategory;
	retryable: boolean;
	code?: string;
	message: string;
}

const TRANSIENT_ERROR_CODES = new Set([
	"ECONNRESET",
	"ETIMEDOUT",
	"ECONNREFUSED",
	"EPIPE",
	"ENOTFOUND", // Sometimes transient (DNS)
	"EAGAIN",
	"EBUSY",
	"ECONNABORTED",
	"ENETUNREACH",
	"EAI_AGAIN", // DNS lookup timeout
]);

const PERMANENT_ERROR_CODES = new Set([
	"EACCES",
	"EPERM",
	"ENOENT",
	"EISDIR",
	"ENOTDIR",
	"ENOTEMPTY",
]);

/**
 * Classify an error as transient (retryable) or permanent (non-retryable)
 */
export function classifyError(error: unknown): ClassifiedError {
	const err = error instanceof Error ? error : new Error(String(error));

	// Check for explicit error codes
	const code = (err as Error & { code?: string }).code;
	if (code) {
		if (TRANSIENT_ERROR_CODES.has(code)) {
			return {
				original: err,
				category: "transient",
				retryable: true,
				code,
				message: err.message,
			};
		}
		if (PERMANENT_ERROR_CODES.has(code)) {
			return {
				original: err,
				category: "permanent",
				retryable: false,
				code,
				message: err.message,
			};
		}
	}

	// Check error message patterns
	const msg = err.message.toLowerCase();
	if (
		msg.includes("timeout") ||
		msg.includes("network") ||
		msg.includes("connection") ||
		msg.includes("unavailable") ||
		msg.includes("rate limit") ||
		msg.includes("too many requests") ||
		msg.includes("econnreset") ||
		msg.includes("etimedout")
	) {
		return {
			original: err,
			category: "transient",
			retryable: true,
			code,
			message: err.message,
		};
	}

	if (
		msg.includes("unauthorized") ||
		msg.includes("forbidden") ||
		msg.includes("not found") ||
		msg.includes("invalid") ||
		msg.includes("bad request") ||
		msg.includes("authentication")
	) {
		return {
			original: err,
			category: "permanent",
			retryable: false,
			code,
			message: err.message,
		};
	}

	// Default to unknown (non-retryable for safety)
	return {
		original: err,
		category: "unknown",
		retryable: false,
		code,
		message: err.message,
	};
}

// ============================================================================
// Retry Policy
// ============================================================================

export interface RetryPolicyOptions {
	maxRetries: number;
	baseDelay: number;
	maxDelay: number;
	multiplier: number;
	jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyOptions = {
	maxRetries: 3,
	baseDelay: 1000, // 1 second
	maxDelay: 30000, // 30 seconds
	multiplier: 2,
	jitter: true,
};

/**
 * Calculate exponential backoff delay with optional jitter
 */
export function calculateBackoff(
	attempt: number,
	options: Partial<RetryPolicyOptions> = {}
): number {
	const opts = { ...DEFAULT_RETRY_POLICY, ...options };

	// Exponential: baseDelay * multiplier^attempt
	const delay = opts.baseDelay * Math.pow(opts.multiplier, attempt);

	// Cap at maxDelay
	const cappedDelay = Math.min(delay, opts.maxDelay);

	// Add jitter (±25% randomization) to prevent thundering herd
	if (opts.jitter) {
		const jitter = 0.75 + Math.random() * 0.5; // 0.75 - 1.25
		return Math.floor(cappedDelay * jitter);
	}

	return Math.floor(cappedDelay);
}

// ============================================================================
// Retry State Tracking
// ============================================================================

export interface RetryState {
	chunk: RawChunk;
	attempt: number;
	errors: ClassifiedError[];
	enqueuedAt: number;
	lastAttemptAt?: number;
	nextAttemptAt?: number;
}

export type RetryEventType =
	| "retry_scheduled"
	| "retry_executed"
	| "retry_exhausted"
	| "dead_letter"
	| "retry_error";

export interface RetryEvent {
	type: RetryEventType;
	chunkId: string;
	contentType: string;
	attempt: number;
	maxRetries: number;
	delay?: number;
	error?: ClassifiedError;
	metadata?: Record<string, unknown>;
	timestamp: number;
}

export type RetryEventHandler = (event: RetryEvent) => void;

// ============================================================================
// Dead Letter Queue
// ============================================================================

export interface DeadLetterEntry {
	chunk: RawChunk;
	reason: string;
	errors: ClassifiedError[];
	timestamp: number;
}

export class DeadLetterQueue {
	private items: DeadLetterEntry[] = [];
	private maxSize: number;

	constructor(maxSize = 1000) {
		this.maxSize = maxSize;
	}

	enqueue(entry: DeadLetterEntry): void {
		// Evict oldest if at capacity
		if (this.items.length >= this.maxSize) {
			this.items.shift();
		}
		this.items.push(entry);
	}

	getAll(): DeadLetterEntry[] {
		return [...this.items];
	}

	get size(): number {
		return this.items.length;
	}

	clear(): void {
		this.items = [];
	}
}

// ============================================================================
// Retry Queue
// ============================================================================

export class RetryQueue {
	private retries = new Map<string, RetryState>();
	private timer?: ReturnType<typeof setTimeout>;
	private processing = false;
	private eventHandlers: RetryEventHandler[] = [];

	constructor(
		private policy: RetryPolicyOptions,
		private deadLetterQueue: DeadLetterQueue,
		private onProcess: (state: RetryState) => Promise<void>
	) {}

	onEvent(handler: RetryEventHandler): () => void {
		this.eventHandlers.push(handler);
		return () => {
			const idx = this.eventHandlers.indexOf(handler);
			if (idx !== -1) {
				this.eventHandlers.splice(idx, 1);
			}
		};
	}

	private emit(event: RetryEvent): void {
		for (const handler of this.eventHandlers) {
			try {
				handler(event);
			} catch (err) {
				console.error("[RetryQueue] Event handler error:", err);
			}
		}
	}

	schedule(chunk: RawChunk, error: ClassifiedError): void {
		const key = this.getKey(chunk);
		const existing = this.retries.get(key);

		if (existing) {
			// Update existing retry state
			existing.attempt++;
			existing.errors.push(error);
			existing.lastAttemptAt = Date.now();

			if (existing.attempt > this.policy.maxRetries) {
				// Max retries exhausted - send to dead letter
				this.sendToDeadLetter(existing, "max_retries_exhausted");
				this.retries.delete(key);
				return;
			}
		} else {
			// New retry state
			this.retries.set(key, {
				chunk,
				attempt: 1,
				errors: [error],
				enqueuedAt: Date.now(),
				lastAttemptAt: Date.now(),
			});
		}

		const state = this.retries.get(key)!;
		const delay = calculateBackoff(state.attempt - 1, this.policy);
		state.nextAttemptAt = Date.now() + delay;

		// Emit retry scheduled event
		this.emit({
			type: "retry_scheduled",
			chunkId: this.getKey(chunk),
			contentType: chunk.contentType,
			attempt: state.attempt,
			maxRetries: this.policy.maxRetries,
			delay,
			error,
			metadata: { sessionId: chunk.sessionId, generation: chunk.generation },
			timestamp: Date.now(),
		});

		this.scheduleProcessing();
	}

	private getKey(chunk: RawChunk): string {
		// RawChunk doesn't have an id field, use sessionId + contentType + timestamp as fallback
		return `${chunk.sessionId}:${chunk.contentType}:${chunk.timestamp}`;
	}

	private sendToDeadLetter(state: RetryState, reason: string): void {
		this.deadLetterQueue.enqueue({
			chunk: state.chunk,
			reason,
			errors: state.errors,
			timestamp: Date.now(),
		});

		this.emit({
			type: "dead_letter",
			chunkId: this.getKey(state.chunk),
			contentType: state.chunk.contentType,
			attempt: state.attempt,
			maxRetries: this.policy.maxRetries,
			error: state.errors[state.errors.length - 1],
			metadata: { sessionId: state.chunk.sessionId, reason },
			timestamp: Date.now(),
		});
	}

	private scheduleProcessing(): void {
		if (this.timer) return;

		// Find next retry that's ready
		const now = Date.now();
		let nextTime = Infinity;

		for (const state of this.retries.values()) {
			if (state.nextAttemptAt && state.nextAttemptAt < nextTime) {
				nextTime = state.nextAttemptAt;
			}
		}

		if (nextTime === Infinity) return;

		const delay = Math.max(0, nextTime - now);
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.process();
		}, delay);
	}

	private async process(): Promise<void> {
		if (this.processing) return;
		this.processing = true;

		const now = Date.now();
		const ready: RetryState[] = [];

		// Find all retries that are ready
		for (const [key, state] of this.retries.entries()) {
			if (state.nextAttemptAt && state.nextAttemptAt <= now) {
				ready.push(state);
				this.retries.delete(key);
			}
		}

		// Process each retry
		for (const state of ready) {
		this.emit({
			type: "retry_executed",
			chunkId: this.getKey(state.chunk),
			contentType: state.chunk.contentType,
			attempt: state.attempt,
			maxRetries: this.policy.maxRetries,
			metadata: { sessionId: state.chunk.sessionId },
			timestamp: Date.now(),
		});

			try {
				await this.onProcess(state);
			} catch (err) {
				// Retry failed again - reclassify and reschedule
				const classified = classifyError(err);
				if (classified.retryable && state.attempt < this.policy.maxRetries) {
					this.schedule(state.chunk, classified);
				} else {
					// Non-retryable or max retries - dead letter
					this.sendToDeadLetter(state, classified.retryable ? "max_retries_exhausted" : "non_retryable_error");
				}
			}
		}

		this.processing = false;

		// Schedule next batch if there are more retries
		if (this.retries.size > 0) {
			this.scheduleProcessing();
		}
	}

	get size(): number {
		return this.retries.size;
	}

	destroy(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		// Send all pending to dead letter
		for (const state of this.retries.values()) {
			this.sendToDeadLetter(state, "queue_destroyed");
		}
		this.retries.clear();
	}
}
