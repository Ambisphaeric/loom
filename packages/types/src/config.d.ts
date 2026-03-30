import { z } from "zod";
export declare const PrivacySchema: z.ZodObject<{
    telemetry: z.ZodDefault<z.ZodBoolean>;
    retentionDays: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    telemetry: boolean;
    retentionDays: number;
}, {
    telemetry?: boolean | undefined;
    retentionDays?: number | undefined;
}>;
export declare const GlobalConfigSchema: z.ZodObject<{
    apiKeys: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    defaultModel: z.ZodDefault<z.ZodString>;
    dataDir: z.ZodDefault<z.ZodString>;
    privacy: z.ZodDefault<z.ZodObject<{
        telemetry: z.ZodDefault<z.ZodBoolean>;
        retentionDays: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        telemetry: boolean;
        retentionDays: number;
    }, {
        telemetry?: boolean | undefined;
        retentionDays?: number | undefined;
    }>>;
    activeWorkspace: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    apiKeys: Record<string, string>;
    defaultModel: string;
    dataDir: string;
    privacy: {
        telemetry: boolean;
        retentionDays: number;
    };
    activeWorkspace?: string | undefined;
}, {
    apiKeys?: Record<string, string> | undefined;
    defaultModel?: string | undefined;
    dataDir?: string | undefined;
    privacy?: {
        telemetry?: boolean | undefined;
        retentionDays?: number | undefined;
    } | undefined;
    activeWorkspace?: string | undefined;
}>;
export declare const MemoryFilterSchema: z.ZodObject<{
    workspace: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
    transform: z.ZodOptional<z.ZodString>;
    before: z.ZodOptional<z.ZodNumber>;
    after: z.ZodOptional<z.ZodNumber>;
    contentType: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    source?: string | undefined;
    transform?: string | undefined;
    workspace?: string | undefined;
    sessionId?: string | undefined;
    before?: number | undefined;
    after?: number | undefined;
    contentType?: string | undefined;
}, {
    source?: string | undefined;
    transform?: string | undefined;
    workspace?: string | undefined;
    sessionId?: string | undefined;
    before?: number | undefined;
    after?: number | undefined;
    contentType?: string | undefined;
}>;
export declare const WorkspaceBehaviorsSchema: z.ZodObject<{
    proactive_suggestions: z.ZodDefault<z.ZodBoolean>;
    proactive_fetch: z.ZodDefault<z.ZodBoolean>;
    suggestion_interval: z.ZodDefault<z.ZodString>;
    suggestion_min_confidence: z.ZodDefault<z.ZodNumber>;
    auto_actions: z.ZodDefault<z.ZodBoolean>;
    change_detection: z.ZodDefault<z.ZodBoolean>;
    max_concurrent_fetches: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    proactive_suggestions: boolean;
    proactive_fetch: boolean;
    suggestion_interval: string;
    suggestion_min_confidence: number;
    auto_actions: boolean;
    change_detection: boolean;
    max_concurrent_fetches: number;
}, {
    proactive_suggestions?: boolean | undefined;
    proactive_fetch?: boolean | undefined;
    suggestion_interval?: string | undefined;
    suggestion_min_confidence?: number | undefined;
    auto_actions?: boolean | undefined;
    change_detection?: boolean | undefined;
    max_concurrent_fetches?: number | undefined;
}>;
export declare const WorkspacePipelineSchema: z.ZodObject<{
    sources: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    fetchers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    transforms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    store: z.ZodDefault<z.ZodString>;
    tools: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    store: string;
    sources: string[];
    fetchers: string[];
    transforms: string[];
    tools: string[];
}, {
    store?: string | undefined;
    sources?: string[] | undefined;
    fetchers?: string[] | undefined;
    transforms?: string[] | undefined;
    tools?: string[] | undefined;
}>;
export declare const WorkspaceModelConfigSchema: z.ZodObject<{
    default: z.ZodString;
    reasoning: z.ZodOptional<z.ZodString>;
    fast: z.ZodOptional<z.ZodString>;
    embedding: z.ZodOptional<z.ZodString>;
    ocr: z.ZodOptional<z.ZodString>;
    local_fallback: z.ZodOptional<z.ZodString>;
    fallback_chain: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    default: string;
    reasoning?: string | undefined;
    fast?: string | undefined;
    embedding?: string | undefined;
    ocr?: string | undefined;
    local_fallback?: string | undefined;
    fallback_chain?: string[] | undefined;
}, {
    default: string;
    reasoning?: string | undefined;
    fast?: string | undefined;
    embedding?: string | undefined;
    ocr?: string | undefined;
    local_fallback?: string | undefined;
    fallback_chain?: string[] | undefined;
}>;
export declare const SessionPluginsSchema: z.ZodObject<{
    inherit: z.ZodDefault<z.ZodBoolean>;
    add: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    remove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    inherit: boolean;
    add: string[];
    remove: string[];
}, {
    inherit?: boolean | undefined;
    add?: string[] | undefined;
    remove?: string[] | undefined;
}>;
export declare const SessionPresetSchema: z.ZodObject<{
    name: z.ZodString;
    session_type: z.ZodEnum<["passive_watch", "meeting_capture", "document_drafting", "research", "custom"]>;
    plugins: z.ZodObject<{
        inherit: z.ZodDefault<z.ZodBoolean>;
        add: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        remove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        inherit: boolean;
        add: string[];
        remove: string[];
    }, {
        inherit?: boolean | undefined;
        add?: string[] | undefined;
        remove?: string[] | undefined;
    }>;
    fabric_patterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    session_type: "passive_watch" | "meeting_capture" | "document_drafting" | "research" | "custom";
    plugins: {
        inherit: boolean;
        add: string[];
        remove: string[];
    };
    fabric_patterns?: string[] | undefined;
}, {
    name: string;
    session_type: "passive_watch" | "meeting_capture" | "document_drafting" | "research" | "custom";
    plugins: {
        inherit?: boolean | undefined;
        add?: string[] | undefined;
        remove?: string[] | undefined;
    };
    fabric_patterns?: string[] | undefined;
}>;
export declare const WorkspaceConfigSchema: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodDefault<z.ZodString>;
    schema_version: z.ZodDefault<z.ZodNumber>;
    description: z.ZodDefault<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    model: z.ZodObject<{
        default: z.ZodString;
        reasoning: z.ZodOptional<z.ZodString>;
        fast: z.ZodOptional<z.ZodString>;
        embedding: z.ZodOptional<z.ZodString>;
        ocr: z.ZodOptional<z.ZodString>;
        local_fallback: z.ZodOptional<z.ZodString>;
        fallback_chain: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        default: string;
        reasoning?: string | undefined;
        fast?: string | undefined;
        embedding?: string | undefined;
        ocr?: string | undefined;
        local_fallback?: string | undefined;
        fallback_chain?: string[] | undefined;
    }, {
        default: string;
        reasoning?: string | undefined;
        fast?: string | undefined;
        embedding?: string | undefined;
        ocr?: string | undefined;
        local_fallback?: string | undefined;
        fallback_chain?: string[] | undefined;
    }>;
    pipeline: z.ZodObject<{
        sources: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        fetchers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        transforms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        store: z.ZodDefault<z.ZodString>;
        tools: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        store: string;
        sources: string[];
        fetchers: string[];
        transforms: string[];
        tools: string[];
    }, {
        store?: string | undefined;
        sources?: string[] | undefined;
        fetchers?: string[] | undefined;
        transforms?: string[] | undefined;
        tools?: string[] | undefined;
    }>;
    fabric_patterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    docs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    behaviors: z.ZodObject<{
        proactive_suggestions: z.ZodDefault<z.ZodBoolean>;
        proactive_fetch: z.ZodDefault<z.ZodBoolean>;
        suggestion_interval: z.ZodDefault<z.ZodString>;
        suggestion_min_confidence: z.ZodDefault<z.ZodNumber>;
        auto_actions: z.ZodDefault<z.ZodBoolean>;
        change_detection: z.ZodDefault<z.ZodBoolean>;
        max_concurrent_fetches: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        proactive_suggestions: boolean;
        proactive_fetch: boolean;
        suggestion_interval: string;
        suggestion_min_confidence: number;
        auto_actions: boolean;
        change_detection: boolean;
        max_concurrent_fetches: number;
    }, {
        proactive_suggestions?: boolean | undefined;
        proactive_fetch?: boolean | undefined;
        suggestion_interval?: string | undefined;
        suggestion_min_confidence?: number | undefined;
        auto_actions?: boolean | undefined;
        change_detection?: boolean | undefined;
        max_concurrent_fetches?: number | undefined;
    }>;
    presets: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        session_type: z.ZodEnum<["passive_watch", "meeting_capture", "document_drafting", "research", "custom"]>;
        plugins: z.ZodObject<{
            inherit: z.ZodDefault<z.ZodBoolean>;
            add: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            remove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            inherit: boolean;
            add: string[];
            remove: string[];
        }, {
            inherit?: boolean | undefined;
            add?: string[] | undefined;
            remove?: string[] | undefined;
        }>;
        fabric_patterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        session_type: "passive_watch" | "meeting_capture" | "document_drafting" | "research" | "custom";
        plugins: {
            inherit: boolean;
            add: string[];
            remove: string[];
        };
        fabric_patterns?: string[] | undefined;
    }, {
        name: string;
        session_type: "passive_watch" | "meeting_capture" | "document_drafting" | "research" | "custom";
        plugins: {
            inherit?: boolean | undefined;
            add?: string[] | undefined;
            remove?: string[] | undefined;
        };
        fabric_patterns?: string[] | undefined;
    }>, "many">>;
    suggested_actions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    pluginSettings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    version: string;
    schema_version: number;
    description: string;
    model: {
        default: string;
        reasoning?: string | undefined;
        fast?: string | undefined;
        embedding?: string | undefined;
        ocr?: string | undefined;
        local_fallback?: string | undefined;
        fallback_chain?: string[] | undefined;
    };
    pipeline: {
        store: string;
        sources: string[];
        fetchers: string[];
        transforms: string[];
        tools: string[];
    };
    behaviors: {
        proactive_suggestions: boolean;
        proactive_fetch: boolean;
        suggestion_interval: string;
        suggestion_min_confidence: number;
        auto_actions: boolean;
        change_detection: boolean;
        max_concurrent_fetches: number;
    };
    fabric_patterns?: string[] | undefined;
    author?: string | undefined;
    docs?: string[] | undefined;
    presets?: {
        name: string;
        session_type: "passive_watch" | "meeting_capture" | "document_drafting" | "research" | "custom";
        plugins: {
            inherit: boolean;
            add: string[];
            remove: string[];
        };
        fabric_patterns?: string[] | undefined;
    }[] | undefined;
    suggested_actions?: string[] | undefined;
    pluginSettings?: Record<string, Record<string, unknown>> | undefined;
}, {
    name: string;
    model: {
        default: string;
        reasoning?: string | undefined;
        fast?: string | undefined;
        embedding?: string | undefined;
        ocr?: string | undefined;
        local_fallback?: string | undefined;
        fallback_chain?: string[] | undefined;
    };
    pipeline: {
        store?: string | undefined;
        sources?: string[] | undefined;
        fetchers?: string[] | undefined;
        transforms?: string[] | undefined;
        tools?: string[] | undefined;
    };
    behaviors: {
        proactive_suggestions?: boolean | undefined;
        proactive_fetch?: boolean | undefined;
        suggestion_interval?: string | undefined;
        suggestion_min_confidence?: number | undefined;
        auto_actions?: boolean | undefined;
        change_detection?: boolean | undefined;
        max_concurrent_fetches?: number | undefined;
    };
    fabric_patterns?: string[] | undefined;
    version?: string | undefined;
    schema_version?: number | undefined;
    description?: string | undefined;
    author?: string | undefined;
    docs?: string[] | undefined;
    presets?: {
        name: string;
        session_type: "passive_watch" | "meeting_capture" | "document_drafting" | "research" | "custom";
        plugins: {
            inherit?: boolean | undefined;
            add?: string[] | undefined;
            remove?: string[] | undefined;
        };
        fabric_patterns?: string[] | undefined;
    }[] | undefined;
    suggested_actions?: string[] | undefined;
    pluginSettings?: Record<string, Record<string, unknown>> | undefined;
}>;
//# sourceMappingURL=config.d.ts.map