export type ToggleState = {
    enabled: boolean;
    lastChanged: number;
};
export interface SourceToggle extends ToggleState {
    sourceId: string;
}
export interface TransformToggle extends ToggleState {
    transformId: string;
}
export interface PipelineOverrides {
    sourcesEnabled: Record<string, boolean>;
    transformsEnabled: Record<string, boolean>;
}
export type NodeType = "source" | "transform" | "merge" | "split" | "conditional" | "recipe" | "trigger" | "action" | "sink";
export type MergeStrategy = "zip" | "concat" | "interleave" | "latest" | "wait-all";
export type SplitStrategy = "broadcast" | "round-robin" | "content-based" | "load-balance";
export interface SplitBranch {
    id: string;
    condition?: string;
    filter?: {
        contentTypes: string[];
    };
    priority: number;
}
export interface GraphNode {
    id: string;
    type: NodeType;
    config: Record<string, unknown>;
    enabled: boolean;
    inputs: string[];
    outputs: string[];
}
export type DeferType = "queue" | "delay" | "condition";
export interface DeferStrategy {
    type: DeferType;
    delayMs?: number;
    condition?: string;
    queueName?: string;
    priority?: number;
}
export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    contentType: string;
    deferStrategy?: DeferStrategy;
}
export interface TriggerNode extends GraphNode {
    type: "trigger";
    triggerType: "schedule" | "webhook" | "event" | "condition";
    config: {
        cron?: string;
        timezone?: string;
        webhookPath?: string;
        webhookMethod?: "GET" | "POST" | "PUT" | "DELETE";
        webhookSecret?: string;
        eventFilter?: string;
        conditionExpression?: string;
    };
}
export interface ActionNode extends GraphNode {
    type: "action" | "sink";
    capability: string;
    credentialRef?: string;
    config: {
        template?: string;
        recipients?: string[];
        format?: string;
        metadata?: Record<string, unknown>;
    };
    deferConfig?: {
        enabled: boolean;
        defaultStrategy?: DeferStrategy;
    };
}
export type RecipeNodeType = "recipe_step" | "recipe_merge" | "recipe_conditional" | "recipe_loop" | "recipe_output";
export interface RecipeGraphNode {
    id: string;
    type: RecipeNodeType;
    stepId?: string;
    config: Record<string, unknown>;
    inputs: string[];
    outputs: string[];
    condition?: string;
    loopConfig?: {
        maxIterations: number;
        breakCondition: string;
    };
}
export interface PipelineStatus {
    workspace: string;
    sessionId?: string;
    sources: Record<string, ToggleState>;
    transforms: Record<string, ToggleState>;
    overridesActive: boolean;
}
//# sourceMappingURL=pipeline.d.ts.map