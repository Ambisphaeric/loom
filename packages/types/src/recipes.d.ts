import type { ContextChunk, ModelPurpose } from "./core.js";
import type { MergeStrategy, SplitBranch, SplitStrategy } from "./pipeline.js";
export interface ConditionalRule {
    id: string;
    predicate: string;
    compoundOperator?: "AND" | "OR";
    compoundPredicates?: string[];
    targetBranch: string;
    priority: number;
}
export type StepKind = "gather" | "capture" | "transcribe" | "extract" | "orient" | "synthesize" | "create" | "detect" | "act" | "merge" | "split" | "conditional" | "subrecipe" | string;
export interface Audience {
    id: string;
    name: string;
    description?: string;
    triggers: string[];
}
export interface StepTrigger {
    type: "manual" | "auto" | "conditional";
    condition?: string;
    after?: string[];
}
export interface RecipeStep {
    id: string;
    kind: StepKind;
    label: string;
    description: string;
    config: Record<string, unknown>;
    model?: string;
    purpose?: ModelPurpose;
    trigger: StepTrigger;
    audienceRef?: string | "*";
    enabled: boolean;
    dependencies?: string[];
    outputsTo?: string[];
    graphNodeType?: "step" | "merge" | "conditional" | "loop" | "output";
    mergeInputs?: string[];
    condition?: string;
    loopConfig?: {
        maxIterations: number;
        breakCondition: string;
    };
    mergeConfig?: {
        sources: string[];
        strategy: MergeStrategy;
        outputContentType: string;
    };
    conditionalConfig?: {
        rules: ConditionalRule[];
        defaultBranch?: string;
        input?: string;
        outputs?: string[];
    };
    splitConfig?: {
        strategy: SplitStrategy;
        branches: SplitBranch[];
        input?: string;
        outputs?: string[];
        branchSteps?: RecipeStep[];
    };
    subRecipeConfig?: {
        recipeId: string;
        inputMapping: Record<string, string>;
        outputMapping: Record<string, string>;
        passThrough: boolean;
        onError: "fail" | "skip" | "continue";
    };
}
export type RecipeMode = "batch" | "continuous" | "hybrid";
export interface Recipe {
    id: string;
    workspace: string;
    name: string;
    mode: RecipeMode;
    schemaVersion: number;
    audiences: Audience[];
    steps: RecipeStep[];
    createdAt: number;
    updatedAt: number;
    template?: string;
    inputs?: RecipeInput[];
    outputs?: RecipeOutput[];
}
export type RunStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type StepRunStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";
export interface StepRun {
    stepId: string;
    status: StepRunStatus;
    input: ContextChunk[];
    output: ContextChunk[];
    subRuns?: Map<string, StepRun>;
    streamBuffer?: string;
    startedAt?: number;
    completedAt?: number;
    error?: string;
}
export interface RecipeRun {
    id: string;
    recipeId: string;
    workspace: string;
    sessionId: string;
    status: RunStatus;
    steps: StepRun[];
    startedAt: number;
    completedAt?: number;
    error?: string;
}
export interface RecipeInput {
    name: string;
    contentType: string;
    required: boolean;
    description?: string;
}
export interface RecipeOutput {
    name: string;
    contentType: string;
    description?: string;
}
//# sourceMappingURL=recipes.d.ts.map