// ============================================================================
// Enhancement — Core Types (Base)
// ============================================================================
// --- Plugin Error ---
export class PluginError extends Error {
    plugin;
    operation;
    recoverable;
    context;
    constructor(message, plugin, operation, recoverable, context) {
        super(message);
        this.plugin = plugin;
        this.operation = operation;
        this.recoverable = recoverable;
        this.context = context;
        this.name = "PluginError";
    }
}
// --- Constants ---
export const MAX_GENERATION = 5;
export const DEFAULT_BUS_CAPACITY = 100;
export const DEFAULT_SCAN_THRESHOLD = 3;
export const DEFAULT_SUGGESTION_INTERVAL = "2m";
export const DEFAULT_MIN_CONFIDENCE = 0.6;
export const DEFAULT_MAX_CONCURRENT_FETCHES = 3;
export const DEFAULT_RETENTION_DAYS = 30;
export const DATA_DIR = "~/.enhancement";
//# sourceMappingURL=core.js.map