export type Permission = "read_screen" | "read_mic" | "read_system_audio" | "read_files" | "write_files" | "network" | "shell";
export interface RawChunk {
    kind: "raw";
    source: string;
    workspace: string;
    sessionId: string;
    contentType: string;
    data: Buffer | string;
    timestamp: number;
    generation: number;
    metadata?: Record<string, unknown>;
}
export interface ContextChunk {
    kind: "context";
    id: string;
    source: string;
    transform?: string;
    workspace: string;
    sessionId: string;
    content: string;
    contentType: string;
    timestamp: number;
    generation: number;
    ttl?: number;
    metadata?: Record<string, unknown>;
    embeddings?: number[];
}
export interface Suggestion {
    id: string;
    workspace: string;
    sessionId?: string;
    action: string;
    confidence: number;
    priority: "low" | "medium" | "high";
    tool?: {
        name: string;
        provider: string;
        params?: Record<string, unknown>;
    };
    relatedChunks?: string[];
    expiresAt?: number;
}
export interface ToolParam {
    type: "string" | "number" | "boolean" | "array" | "object";
    description: string;
    required?: boolean;
    default?: unknown;
}
export interface ToolResult {
    success: boolean;
    output?: string;
    error?: string;
    artifacts?: Array<{
        name: string;
        path: string;
        type: string;
    }>;
    emitChunks?: RawChunk[];
}
export interface Tool {
    name: string;
    description: string;
    parameters: Record<string, ToolParam>;
    execute(params: Record<string, unknown>): Promise<ToolResult>;
}
export interface MemoryFilter {
    workspace?: string;
    sessionId?: string;
    source?: string;
    transform?: string;
    before?: number;
    after?: number;
    contentType?: string;
}
export interface UserProfile {
    workspace: string;
    summary: string;
    frequentActions: string[];
    dismissedPatterns: string[];
    lastUpdated: number;
}
export interface Source {
    produces: string[];
    stream(emit: (chunk: RawChunk) => void): void;
    stop(): void;
}
export interface Fetch {
    accepts: string[];
    retrieve(input: string, options?: Record<string, unknown>): Promise<RawChunk[]>;
}
export interface Transform {
    accepts: string[];
    produces: string[];
    process(input: RawChunk): Promise<(ContextChunk | RawChunk)[]>;
}
export interface ScanResult {
    chunks: ContextChunk[];
    nextCursor: string;
}
export interface Store {
    store(chunk: ContextChunk): Promise<void>;
    query(query: string, filter: MemoryFilter, limit?: number): Promise<ContextChunk[]>;
    scan(cursor: string, filter: MemoryFilter, limit?: number): Promise<ScanResult>;
    forget(filter: MemoryFilter): Promise<number>;
    getProfile(workspace: string): Promise<UserProfile>;
    updateProfile(profile: UserProfile): Promise<void>;
    prune(workspace: string): Promise<number>;
}
export interface ToolProvider {
    tools(): Tool[];
}
import type { CredentialProvider } from "./credentials.js";
export type { CredentialProvider } from "./credentials.js";
export interface Trigger {
    type: "schedule" | "webhook" | "event" | "condition";
    config: Record<string, unknown>;
    start(): void;
    stop(): void;
    onTrigger(handler: (payload: unknown) => void): void;
}
export interface ActionContext {
    credentials: CredentialProvider;
    defer?: (delayMs: number, until?: string) => Promise<void>;
    workspace: string;
}
export interface ActionResult {
    success: boolean;
    output?: unknown;
    error?: string;
}
export interface Action {
    name: string;
    description: string;
    execute(input: unknown, context: ActionContext): Promise<ActionResult>;
    supportsDeferral: boolean;
}
export interface ModelOptions {
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
}
export interface ModelProvider {
    name: string;
    supportsStreaming: boolean;
    complete(prompt: string, options?: ModelOptions): Promise<string>;
    stream?(prompt: string, options?: ModelOptions): AsyncIterable<string>;
    embed?(text: string): Promise<number[]>;
}
export interface PluginCapabilities {
    source?: Source;
    fetch?: Fetch;
    transform?: Transform;
    store?: Store;
    tools?: ToolProvider;
    credential?: CredentialProvider;
    trigger?: Trigger;
    action?: Action;
    modelProvider?: ModelProvider;
}
export interface Plugin {
    name: string;
    version: string;
    permissions: Permission[];
    init(config: PluginConfig): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    capabilities: PluginCapabilities;
}
export declare class PluginError extends Error {
    readonly plugin: string;
    readonly operation: "init" | "start" | "stream" | "process" | "retrieve" | "store" | "query";
    readonly recoverable: boolean;
    readonly context?: Record<string, unknown> | undefined;
    constructor(message: string, plugin: string, operation: "init" | "start" | "stream" | "process" | "retrieve" | "store" | "query", recoverable: boolean, context?: Record<string, unknown> | undefined);
}
export type BusHandler = (chunk: RawChunk) => Promise<void>;
export interface Bus {
    readonly workspace: string;
    publish(chunk: RawChunk): void;
    subscribe(contentType: string, handler: BusHandler): void;
    unsubscribe(contentType: string, handler: BusHandler): void;
}
export interface ModelEndpoint {
    name: string;
    url: string;
    apiKey?: string;
    maxTokens?: number;
}
export type ModelPurpose = "default" | "reasoning" | "fast" | "embedding" | "ocr" | "vision" | "audio";
export interface Message {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface Router {
    resolve(workspace: string, purpose: ModelPurpose): ModelEndpoint;
    complete(workspace: string, purpose: ModelPurpose, messages: Message[]): Promise<string>;
    embed(workspace: string, text: string): Promise<number[]>;
}
export type SuggestionAction = "approve" | "dismiss" | "ignore";
export interface Loop {
    start(workspace: string, store: Store, router: Router, tools: Tool[]): void;
    stop(): void;
    onSuggestion(handler: (suggestion: Suggestion) => void): void;
    respond(suggestionId: string, action: SuggestionAction): void;
    evaluate(): void;
}
export type SessionType = "passive_watch" | "meeting_capture" | "document_drafting" | "research" | "custom";
export type SessionStatus = "created" | "active" | "paused" | "completed" | "archived";
export interface SessionPlugins {
    inherit: boolean;
    add: string[];
    remove: string[];
}
export interface Session {
    id: string;
    workspace: string;
    type: SessionType;
    status: SessionStatus;
    plugins: SessionPlugins;
    startedAt: number;
    endedAt?: number;
    metadata?: Record<string, unknown>;
    pipelineOverrides?: import("./pipeline.js").PipelineOverrides;
}
export interface PrivacyConfig {
    telemetry: boolean;
    retentionDays: number;
}
export interface GlobalConfig {
    apiKeys: Record<string, string>;
    defaultModel: string;
    dataDir: string;
    privacy: PrivacyConfig;
    activeWorkspace?: string;
}
export interface PluginConfig {
    workspace: string;
    globalConfig: GlobalConfig;
    pluginSettings: Record<string, unknown>;
}
export interface WorkspaceModelConfig {
    default: string;
    reasoning?: string;
    fast?: string;
    embedding?: string;
    ocr?: string;
    local_fallback?: string;
    fallback_chain?: string[];
}
export interface WorkspacePipeline {
    sources: string[];
    fetchers: string[];
    transforms: string[];
    store: string;
    tools: string[];
}
export interface WorkspaceBehaviors {
    proactive_suggestions: boolean;
    proactive_fetch: boolean;
    suggestion_interval: string;
    suggestion_min_confidence: number;
    auto_actions: boolean;
    change_detection: boolean;
    max_concurrent_fetches: number;
}
export interface SessionPreset {
    name: string;
    session_type: SessionType;
    plugins: SessionPlugins;
    fabric_patterns?: string[];
}
export interface WorkspaceConfig {
    name: string;
    version: string;
    schema_version: number;
    description: string;
    author?: string;
    model: WorkspaceModelConfig;
    pipeline: WorkspacePipeline;
    fabric_patterns?: string[];
    docs?: string[];
    behaviors: WorkspaceBehaviors;
    presets?: SessionPreset[];
    suggested_actions?: string[];
    pluginSettings?: Record<string, Record<string, unknown>>;
}
export type EngineEvent = {
    type: "plugin_error";
    plugin: string;
    error: PluginError;
} | {
    type: "plugin_disabled";
    plugin: string;
    reason: string;
} | {
    type: "model_fallback";
    workspace: string;
    from: string;
    to: string;
} | {
    type: "store_buffering";
    workspace: string;
    buffered: number;
} | {
    type: "fetch_complete";
    workspace: string;
    url: string;
    chunks: number;
};
export interface Engine {
    start(workspace: string): Promise<void>;
    stop(): Promise<void>;
    onSuggestion(handler: (suggestion: Suggestion) => void): void;
    respondToSuggestion(id: string, action: SuggestionAction): void;
    onEvent(handler: (event: EngineEvent) => void): void;
    fetch(workspace: string, url: string): Promise<ContextChunk[]>;
    search(workspace: string, query: string, filter?: MemoryFilter): Promise<ContextChunk[]>;
    forget(workspace: string, filter: MemoryFilter): Promise<number>;
}
export declare const MAX_GENERATION = 5;
export declare const DEFAULT_BUS_CAPACITY = 100;
export declare const DEFAULT_SCAN_THRESHOLD = 3;
export declare const DEFAULT_SUGGESTION_INTERVAL = "2m";
export declare const DEFAULT_MIN_CONFIDENCE = 0.6;
export declare const DEFAULT_MAX_CONCURRENT_FETCHES = 3;
export declare const DEFAULT_RETENTION_DAYS = 30;
export declare const DATA_DIR = "~/.enhancement";
//# sourceMappingURL=core.d.ts.map