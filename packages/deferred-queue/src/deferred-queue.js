// ============================================================================
// Enhancement — Deferred Execution Queue
// ============================================================================
// Implements the "[act later]" functionality for n8n/ActivePieces parity
// Allows actions to be queued and executed later based on time or conditions
// ============================================================================
// Deferred Queue Implementation
// ============================================================================
export class DeferredQueue {
    db;
    credentialProvider;
    actionExecutor;
    checkIntervalMs;
    intervalId;
    constructor(db, credentialProvider, actionExecutor, options) {
        this.db = db;
        this.credentialProvider = credentialProvider;
        this.actionExecutor = actionExecutor;
        this.checkIntervalMs = options?.checkIntervalMs ?? 5000;
    }
    /**
     * Start the background processing loop
     */
    start() {
        if (this.intervalId)
            return;
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
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
            console.log("[DeferredQueue] Stopped");
        }
    }
    /**
     * Enqueue an action for deferred execution
     */
    async enqueue(action, input, workspace, options = {}) {
        const id = `deferred_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const now = Date.now();
        let deferUntil;
        let deferCondition;
        let deferType;
        if (options.until) {
            deferType = "condition";
            deferCondition = options.until;
        }
        else if (options.queueName) {
            deferType = "queue";
        }
        else if (options.delayMs) {
            deferType = "delay";
            deferUntil = now + options.delayMs;
        }
        else {
            deferType = "queue";
        }
        const deferredAction = {
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
        await this.db.insert({}).values({
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
    async enqueueWithCredentials(action, input, workspace, credentialRefs, options = {}) {
        const id = await this.enqueue(action, input, workspace, options);
        await this.db.update({}).set({
            credentialRefs: JSON.stringify(credentialRefs),
        }).where({ id });
        return id;
    }
    /**
     * Cancel a pending deferred action
     */
    async cancel(id) {
        try {
            await this.db.update({}).set({ status: "cancelled" }).where({ id });
            console.log(`[DeferredQueue] Cancelled action ${id}`);
            return true;
        }
        catch (err) {
            console.error(`[DeferredQueue] Failed to cancel action ${id}:`, err);
            return false;
        }
    }
    /**
     * Flush a specific queue or all pending actions
     */
    async flush(queueName, condition) {
        const results = (await this.db
            .select()
            .from({})
            .where({ status: "pending" })
            .all());
        const actions = results.map((row) => ({
            id: row.id,
            action: row.action,
            input: JSON.parse(row.input),
            credentialRefs: JSON.parse(row.credentialRefs),
            deferType: row.deferType,
            deferUntil: row.deferUntil ?? undefined,
            deferCondition: row.deferCondition ?? undefined,
            queueName: row.queueName ?? undefined,
            status: row.status,
            retryCount: row.retryCount,
            maxRetries: 3,
            workspace: row.workspace,
            createdAt: row.createdAt,
            priority: 0,
        }));
        for (const action of actions) {
            await this.db.update({}).set({ status: "ready" }).where({ id: action.id });
        }
        console.log(`[DeferredQueue] Flushed ${actions.length} actions`);
        return actions;
    }
    /**
     * Process all ready actions
     */
    async processReadyActions() {
        const results = (await this.db
            .select()
            .from({})
            .where({ status: "ready" })
            .all());
        for (const row of results) {
            await this.executeAction({
                id: row.id,
                action: row.action,
                input: JSON.parse(row.input),
                credentialRefs: JSON.parse(row.credentialRefs),
                status: row.status,
                retryCount: row.retryCount,
                workspace: row.workspace,
            });
        }
    }
    /**
     * Execute a single deferred action
     */
    async executeAction(action) {
        console.log(`[DeferredQueue] Executing action ${action.action} (${action.id})`);
        try {
            await this.db.update({}).set({ status: "executing" }).where({ id: action.id });
            const result = await this.actionExecutor(action.action, action.input, this.credentialProvider);
            if (result.success) {
                await this.db
                    .update({})
                    .set({ status: "completed", executedAt: Date.now() })
                    .where({ id: action.id });
                console.log(`[DeferredQueue] Action ${action.id} completed successfully`);
            }
            else {
                throw new Error(result.error || "Action failed");
            }
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            console.error(`[DeferredQueue] Action ${action.id} failed:`, errorMessage);
            const newRetryCount = action.retryCount + 1;
            const newStatus = newRetryCount >= action.maxRetries ? "failed" : "pending";
            await this.db
                .update({})
                .set({ status: newStatus, errorMessage, retryCount: newRetryCount })
                .where({ id: action.id });
        }
    }
    /**
     * Get pending actions for a workspace
     */
    async getPendingActions(workspace) {
        const results = (await this.db
            .select()
            .from({})
            .where({ workspace, status: "pending" })
            .all());
        return results.map((row) => ({
            id: row.id,
            action: row.action,
            input: JSON.parse(row.input),
            credentialRefs: JSON.parse(row.credentialRefs),
            deferType: row.deferType,
            deferUntil: row.deferUntil ?? undefined,
            deferCondition: row.deferCondition ?? undefined,
            queueName: row.queueName ?? undefined,
            status: row.status,
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
    async getAllActions(options) {
        let results = (await this.db
            .select()
            .from({})
            .all());
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
            deferType: row.deferType,
            deferUntil: row.deferUntil ?? undefined,
            deferCondition: row.deferCondition ?? undefined,
            queueName: row.queueName ?? undefined,
            status: row.status,
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
export function createDeferredQueue(db, credentialProvider, actionExecutor, options) {
    return new DeferredQueue(db, credentialProvider, actionExecutor, options);
}
//# sourceMappingURL=deferred-queue.js.map