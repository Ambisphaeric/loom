// ============================================================================
// Zod Schemas for Configuration
// ============================================================================
import { z } from "zod";
import { DATA_DIR, DEFAULT_RETENTION_DAYS, DEFAULT_MIN_CONFIDENCE, DEFAULT_MAX_CONCURRENT_FETCHES, DEFAULT_SUGGESTION_INTERVAL, } from "./core.js";
export const PrivacySchema = z.object({
    telemetry: z.boolean().default(false),
    retentionDays: z.number().int().positive().default(DEFAULT_RETENTION_DAYS),
});
export const GlobalConfigSchema = z.object({
    apiKeys: z.record(z.string()).default({}),
    defaultModel: z.string().default(""),
    dataDir: z.string().default(DATA_DIR),
    privacy: PrivacySchema.default({}),
    activeWorkspace: z.string().optional(),
});
// Additional utility schemas
export const MemoryFilterSchema = z.object({
    workspace: z.string().optional(),
    sessionId: z.string().optional(),
    source: z.string().optional(),
    transform: z.string().optional(),
    before: z.number().optional(),
    after: z.number().optional(),
    contentType: z.string().optional(),
});
export const WorkspaceBehaviorsSchema = z.object({
    proactive_suggestions: z.boolean().default(true),
    proactive_fetch: z.boolean().default(true),
    suggestion_interval: z.string().default(DEFAULT_SUGGESTION_INTERVAL),
    suggestion_min_confidence: z.number().min(0).max(1).default(DEFAULT_MIN_CONFIDENCE),
    auto_actions: z.boolean().default(false),
    change_detection: z.boolean().default(true),
    max_concurrent_fetches: z.number().int().positive().default(DEFAULT_MAX_CONCURRENT_FETCHES),
});
export const WorkspacePipelineSchema = z.object({
    sources: z.array(z.string()).default([]),
    fetchers: z.array(z.string()).default([]),
    transforms: z.array(z.string()).default([]),
    store: z.string().default("local-memory"),
    tools: z.array(z.string()).default([]),
});
export const WorkspaceModelConfigSchema = z.object({
    default: z.string(),
    reasoning: z.string().optional(),
    fast: z.string().optional(),
    embedding: z.string().optional(),
    ocr: z.string().optional(),
    local_fallback: z.string().optional(),
    fallback_chain: z.array(z.string()).optional(),
});
export const SessionPluginsSchema = z.object({
    inherit: z.boolean().default(true),
    add: z.array(z.string()).default([]),
    remove: z.array(z.string()).default([]),
});
export const SessionPresetSchema = z.object({
    name: z.string(),
    session_type: z.enum([
        "passive_watch",
        "meeting_capture",
        "document_drafting",
        "research",
        "custom",
    ]),
    plugins: SessionPluginsSchema,
    fabric_patterns: z.array(z.string()).optional(),
});
export const WorkspaceConfigSchema = z.object({
    name: z.string(),
    version: z.string().default("0.1.0"),
    schema_version: z.number().int().default(1),
    description: z.string().default(""),
    author: z.string().optional(),
    model: WorkspaceModelConfigSchema,
    pipeline: WorkspacePipelineSchema,
    fabric_patterns: z.array(z.string()).optional(),
    docs: z.array(z.string()).optional(),
    behaviors: WorkspaceBehaviorsSchema,
    presets: z.array(SessionPresetSchema).optional(),
    suggested_actions: z.array(z.string()).optional(),
    pluginSettings: z.record(z.record(z.unknown())).optional(),
});
//# sourceMappingURL=config.js.map