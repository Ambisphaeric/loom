// ============================================================================
// Enhancement — Deferred Execution Queue
// ============================================================================
// Implements the "[act later]" functionality for n8n/ActivePieces parity
// Allows actions to be queued and executed later based on time or conditions

import type { CredentialProvider } from "@enhancement/types";

// ============================================================================
// Types
// ============================================================================

export type DeferredActionStatus =
	| "pending"
	| "ready"
	| "executing"
	| "completed"
	| "failed"
	| "cancelled";

export interface DeferredAction {
	id: string;
	action: string;
	input: unknown;
	credentialRefs: string[];
	deferType: "delay" | "condition" | "queue";
	deferUntil?: number;
	deferCondition?: string;
	queueName?: string;
	status: DeferredActionStatus;
	retryCount: number;
	maxRetries: number;
	workspace: string;
	createdAt: number;
	executedAt?: number;
	errorMessage?: string;
	priority: number;
	metadata?: Record<string, unknown>;
}

export interface EnqueueOptions {
	delayMs?: number;
	until?: string;
	queueName?: string;
	priority?: number;
	maxRetries?: number;
	metadata?: Record<string, unknown>;
}

export type ActionExecutor = (
	name: string,
	input: unknown,
	credentials: CredentialProvider
) => Promise<{
	success: boolean;
	output?: unknown;
	error?: string;
}>;

// ============================================================================
// Database Interface
// ============================================================================

export interface Database {
	select(): {
		from: (table: unknown) => {
			where: (condition: unknown) => {
				all: () => Promise<unknown[]>;
				orderBy: (...columns: unknown[]) => {
					all: () => Promise<unknown[]>;
				};
			};
			all: () => Promise<unknown[]>;
		};
	};
	insert(table: unknown): {
		values(data: unknown): Promise<void>;
	};
	update(table: unknown): {
		set(data: unknown): {
			where: (condition: unknown) => Promise<void>;
		};
	};
	delete(table: unknown): {
		where: (condition: unknown) => Promise<void>;
	};
}

// ============================================================================
// Deferred Queue Implementation
// ============================================================================

export class DeferredQueue {
	private db: Database;
	private credentialProvider: CredentialProvider;
	private actionExecutor: ActionExecutor;
	private checkIntervalMs: number;
	private intervalId?: ReturnType<typeof setInterval>;

	constructor(
		db: Database,
		credentialProvider: CredentialProvider,
		actionExecutor: ActionExecutor,
		options?: { checkIntervalMs?: number }
	) {
		this.db = db;
		this.credentialProvider = credentialProvider;
		this.actionExecutor = actionExecutor;
		this.checkIntervalMs = options?.checkIntervalMs ?? 5000;
	}

	/**
	 * Start the background processing loop
	 */
	start(): void {
		if (this.intervalId) return;

		console.log("[DeferredQueue] Started with interval", this.checkIntervalMs, "ms");
		this.intervalId = setInterval(() => {
			this.processReadyActions().catch((err) => {
				console.error("[DeferredQueue] Error processing actions:", err);
			});
		}, this.checkIntervalMs);
	}

	/**
	 * Stop the background processing loop
	 */
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
			console.log("[DeferredQueue] Stopped");
		}
	}

	/**
	 * Enqueue an action for deferred execution
	 */
	async enqueue(
		action: string,
		input: unknown,
		workspace: string,
		options: EnqueueOptions = {}
	): Promise<string> {
		const id = `deferred_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
		const now = Date.now();

		let deferUntil: number | undefined;
		let deferCondition: string | undefined;
		let deferType: "delay" | "condition" | "queue";

		if (options.until) {
			deferType = "condition";
			deferCondition = options.until;
		} else if (options.queueName) {
			deferType = "queue";
		} else if (options.delayMs) {
			deferType = "delay";
			deferUntil = now + options.delayMs;
		} else {
			deferType = "queue";
		}

		const deferredAction: DeferredAction = {
			id,
			action,
			input,
			credentialRefs: [],
			deferType,
			deferUntil,
			deferCondition,
			queueName: options.queueName,
			status: "pending",
			retryCount: 0,
			maxRetries: options.maxRetries ?? 3,
			workspace,
			createdAt: now,
			priority: options.priority ?? 0,
			metadata: options.metadata,
		};

		await this.db.insert({} as unknown).values({
			id: deferredAction.id,
			action: deferredAction.action,
			input: JSON.stringify(deferredAction.input),
			credentialRefs: JSON.stringify(deferredAction.credentialRefs),
			deferType: deferredAction.deferType,
			deferUntil: deferredAction.deferUntil,
			deferCondition: deferredAction.deferCondition,
			queueName: deferredAction.queueName,
			status: deferredAction.status,
			retryCount: deferredAction.retryCount,
			workspace: deferredAction.workspace,
			createdAt: deferredAction.createdAt,
		});

		console.log(`[DeferredQueue] Enqueued action ${action} (${id}) for workspace ${workspace}`);
		return id;
	}

	/**
	 * Enqueue an action with credential references
	 */
	async enqueueWithCredentials(
		action: string,
		input: unknown,
		workspace: string,
		credentialRefs: string[],
		options: EnqueueOptions = {}
	): Promise<string> {
		const id = await this.enqueue(action, input, workspace, options);

		await this.db.update({} as unknown).set({
			credentialRefs: JSON.stringify(credentialRefs),
		}).where({ id });

		return id;
	}

	/**
	 * Cancel a pending deferred action
	 */
	async cancel(id: string): Promise<boolean> {
		try {
			await this.db.update({} as unknown).set({ status: "cancelled" }).where({ id });
			console.log(`[DeferredQueue] Cancelled action ${id}`);
			return true;
		} catch (err) {
			console.error(`[DeferredQueue] Failed to cancel action ${id}:`, err);
			return false;
		}
	}

	/**
	 * Flush a specific queue or all pending actions
	 */
	async flush(queueName?: string, condition?: string): Promise<DeferredAction[]> {
		const results = (await this.db
			.select()
			.from({} as unknown)
			.where({ status: "pending" })
			.all()) as Array<{
				id: string;
				action: string;
				input: string;
				credentialRefs: string;
				deferType: string;
				deferUntil: number | null;
				deferCondition: string | null;
				queueName: string | null;
				status: string;
				retryCount: number;
				workspace: string;
				createdAt: number;
			}>;

		const actions: DeferredAction[] = results.map((row) => ({
			id: row.id,
			action: row.action,
			input: JSON.parse(row.input),
			credentialRefs: JSON.parse(row.credentialRefs),
			deferType: row.deferType as "delay" | "condition" | "queue",
			deferUntil: row.deferUntil ?? undefined,
			deferCondition: row.deferCondition ?? undefined,
			queueName: row.queueName ?? undefined,
			status: row.status as DeferredActionStatus,
			retryCount: row.retryCount,
			maxRetries: 3,
			workspace: row.workspace,
			createdAt: row.createdAt,
			priority: 0,
		}));

		for (const action of actions) {
			await this.db.update({} as unknown).set({ status: "ready" }).where({ id: action.id });
		}

		console.log(`[DeferredQueue] Flushed ${actions.length} actions`);
		return actions;
	}

	/**
	 * Process all ready actions
	 */
	async processReadyActions(): Promise<void> {
		const results = (await this.db
			.select()
			.from({} as unknown)
			.where({ status: "ready" })
			.all()) as Array<{
				id: string;
				action: string;
				input: string;
				credentialRefs: string;
				status: string;
				retryCount: number;
				workspace: string;
			}>;

		for (const row of results) {
			await this.executeAction({
				id: row.id,
				action: row.action,
				input: JSON.parse(row.input),
				credentialRefs: JSON.parse(row.credentialRefs),
				status: row.status as DeferredActionStatus,
				retryCount: row.retryCount,
				workspace: row.workspace,
			} as DeferredAction);
		}
	}

	/**
	 * Execute a single deferred action
	 */
	private async executeAction(action: DeferredAction): Promise<void> {
		console.log(`[DeferredQueue] Executing action ${action.action} (${action.id})`);

		try {
			await this.db.update({} as unknown).set({ status: "executing" }).where({ id: action.id });

			const result = await this.actionExecutor(
				action.action,
				action.input,
				this.credentialProvider
			);

			if (result.success) {
				await this.db
					.update({} as unknown)
					.set({ status: "completed", executedAt: Date.now() })
					.where({ id: action.id });
				console.log(`[DeferredQueue] Action ${action.id} completed successfully`);
			} else {
				throw new Error(result.error || "Action failed");
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown error";
			console.error(`[DeferredQueue] Action ${action.id} failed:`, errorMessage);

			const newRetryCount = action.retryCount + 1;
			const newStatus = newRetryCount >= action.maxRetries ? "failed" : "pending";

			await this.db
				.update({} as unknown)
				.set({ status: newStatus, errorMessage, retryCount: newRetryCount })
				.where({ id: action.id });
		}
	}

	/**
	 * Get pending actions for a workspace
	 */
	async getPendingActions(workspace: string): Promise<DeferredAction[]> {
		const results = (await this.db
			.select()
			.from({} as unknown)
			.where({ workspace, status: "pending" })
			.all()) as Array<{
				id: string;
				action: string;
				input: string;
				credentialRefs: string;
				deferType: string;
				deferUntil: number | null;
				deferCondition: string | null;
				queueName: string | null;
				status: string;
				retryCount: number;
				createdAt: number;
			}>;

		return results.map((row) => ({
			id: row.id,
			action: row.action,
			input: JSON.parse(row.input),
			credentialRefs: JSON.parse(row.credentialRefs),
			deferType: row.deferType as "delay" | "condition" | "queue",
			deferUntil: row.deferUntil ?? undefined,
			deferCondition: row.deferCondition ?? undefined,
			queueName: row.queueName ?? undefined,
			status: row.status as DeferredActionStatus,
			retryCount: row.retryCount,
			maxRetries: 3,
			workspace,
			createdAt: row.createdAt,
			priority: 0,
		}));
	}

	/**
	 * Get all deferred actions (for admin/debugging)
	 */
	async getAllActions(options?: {
		status?: DeferredActionStatus;
		workspace?: string;
		limit?: number;
	}): Promise<DeferredAction[]> {
		let results = (await this.db
			.select()
			.from({} as unknown)
			.all()) as Array<{
				id: string;
				action: string;
				input: string;
				credentialRefs: string;
				deferType: string;
				deferUntil: number | null;
				deferCondition: string | null;
				queueName: string | null;
				status: string;
				retryCount: number;
				workspace: string;
				createdAt: number;
			}>;

		if (options?.status) {
			results = results.filter((r) => r.status === options.status);
		}
		if (options?.workspace) {
			results = results.filter((r) => r.workspace === options.workspace);
		}

		const limited = options?.limit ? results.slice(0, options.limit) : results;

		return limited.map((row) => ({
			id: row.id,
			action: row.action,
			input: JSON.parse(row.input),
			credentialRefs: JSON.parse(row.credentialRefs),
			deferType: row.deferType as "delay" | "condition" | "queue",
			deferUntil: row.deferUntil ?? undefined,
			deferCondition: row.deferCondition ?? undefined,
			queueName: row.queueName ?? undefined,
			status: row.status as DeferredActionStatus,
			retryCount: row.retryCount,
			maxRetries: 3,
			workspace: row.workspace,
			createdAt: row.createdAt,
			priority: 0,
		}));
	}
}

// ============================================================================
// Factory Function
// ============================================================================

export function createDeferredQueue(
	db: Database,
	credentialProvider: CredentialProvider,
	actionExecutor: ActionExecutor,
	options?: { checkIntervalMs?: number }
): DeferredQueue {
	return new DeferredQueue(db, credentialProvider, actionExecutor, options);
}
