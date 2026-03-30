// ============================================================================
// Enhancement — Recipe Types
// ============================================================================

import type { ContextChunk, ModelPurpose } from "./core.js";
import type { MergeStrategy, SplitBranch, SplitStrategy } from "./pipeline.js";

// --- Conditional Rule (re-export for convenience) ---

export interface ConditionalRule {
	id: string;
	predicate: string; // e.g., "content.contains('TODO')"
	compoundOperator?: "AND" | "OR"; // for multiple predicates
	compoundPredicates?: string[];
	targetBranch: string; // output branch id
	priority: number; // evaluation order (lower = first)
}

// --- Recipe ---

export type StepKind =
	| "gather"
	| "capture"
	| "transcribe"
	| "extract"
	| "orient"
	| "synthesize"
	| "create"
	| "detect"
	| "act"
	| "merge" // Merge multiple data streams
	| "split" // Parallel branching and fan-out
	| "conditional" // Content-based routing decisions
	| "subrecipe" // NEW: Execute nested recipe
	| string; // plugin-provided

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
	// Graph composition fields (optional, for complex recipe flows)
	dependencies?: string[]; // Step IDs this step depends on
	outputsTo?: string[]; // Step IDs that receive this step's output
	graphNodeType?: "step" | "merge" | "conditional" | "loop" | "output";
	mergeInputs?: string[]; // For merge nodes: which step IDs to merge
	condition?: string; // For conditional nodes: condition expression
	loopConfig?: {
		maxIterations: number;
		breakCondition: string;
	}; // For loop nodes
	// Merge configuration for "merge" step kind
	mergeConfig?: {
		sources: string[]; // Content types or step IDs to merge
		strategy: MergeStrategy;
		outputContentType: string;
	};
	// NEW: Conditional configuration for "conditional" step kind
	conditionalConfig?: {
		rules: ConditionalRule[];
		defaultBranch?: string;
		input?: string; // Input edge/node id
		outputs?: string[]; // Output branch ids
	};
	// NEW: Split configuration for "split" step kind
	splitConfig?: {
		strategy: SplitStrategy;
		branches: SplitBranch[];
		input?: string; // Input edge/node id
		outputs?: string[]; // Output branch ids
		branchSteps?: RecipeStep[]; // Steps to execute for each branch
	};
	// NEW: Sub-recipe configuration for "subrecipe" step kind
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

// --- Recipe Run ---

export type RunStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

export type StepRunStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "skipped"
	| "cancelled";

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

// --- Recipe Input/Output Definitions ---

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
