import type { CredentialProvider } from "@enhancement/types";
export type DeferredActionStatus = "pending" | "ready" | "executing" | "completed" | "failed" | "cancelled";
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
export type ActionExecutor = (name: string, input: unknown, credentials: CredentialProvider) => Promise<{
    success: boolean;
    output?: unknown;
    error?: string;
}>;
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
export declare class DeferredQueue {
    private db;
    private credentialProvider;
    private actionExecutor;
    private checkIntervalMs;
    private intervalId?;
    constructor(db: Database, credentialProvider: CredentialProvider, actionExecutor: ActionExecutor, options?: {
        checkIntervalMs?: number;
    });
    /**
     * Start the background processing loop
     */
    start(): void;
    /**
     * Stop the background processing loop
     */
    stop(): void;
    /**
     * Enqueue an action for deferred execution
     */
    enqueue(action: string, input: unknown, workspace: string, options?: EnqueueOptions): Promise<string>;
    /**
     * Enqueue an action with credential references
     */
    enqueueWithCredentials(action: string, input: unknown, workspace: string, credentialRefs: string[], options?: EnqueueOptions): Promise<string>;
    /**
     * Cancel a pending deferred action
     */
    cancel(id: string): Promise<boolean>;
    /**
     * Flush a specific queue or all pending actions
     */
    flush(queueName?: string, condition?: string): Promise<DeferredAction[]>;
    /**
     * Process all ready actions
     */
    processReadyActions(): Promise<void>;
    /**
     * Execute a single deferred action
     */
    private executeAction;
    /**
     * Get pending actions for a workspace
     */
    getPendingActions(workspace: string): Promise<DeferredAction[]>;
    /**
     * Get all deferred actions (for admin/debugging)
     */
    getAllActions(options?: {
        status?: DeferredActionStatus;
        workspace?: string;
        limit?: number;
    }): Promise<DeferredAction[]>;
}
export declare function createDeferredQueue(db: Database, credentialProvider: CredentialProvider, actionExecutor: ActionExecutor, options?: {
    checkIntervalMs?: number;
}): DeferredQueue;
//# sourceMappingURL=deferred-queue.d.ts.map