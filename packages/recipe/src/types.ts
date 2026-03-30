import type { ContextChunk } from "@loomai/types";

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
	| "merge"
	| "split"
	| "conditional"
	| "subrecipe";

export type RecipeMode = "batch" | "streaming" | "interactive";

export interface RecipeStep {
	id: string;
	kind: StepKind;
	name?: string;
	label?: string;
	description?: string;
	config: Record<string, unknown>;
	dependsOn?: string[];
	enabled?: boolean;
	trigger?: { type: string };
}

export interface Recipe {
	id: string;
	workspace: string;
	name: string;
	mode: RecipeMode;
	schemaVersion: number;
	audiences: string[];
	steps: RecipeStep[];
	createdAt: number;
	updatedAt: number;
	template?: string;
}

export interface StepRun {
	stepId: string;
	status: "pending" | "running" | "completed" | "failed" | "skipped";
	output?: ContextChunk[];
	error?: string;
	durationMs?: number;
}

export interface RecipeRun {
	id: string;
	recipeId: string;
	workspace: string;
	sessionId: string;
	status: "pending" | "running" | "completed" | "failed" | "paused";
	steps: StepRun[];
	outputChunks?: ContextChunk[];
	createdAt: number;
	completedAt?: number;
}

export interface RecipeExecutorOptions {
	sessionId?: string;
	verbose?: boolean;
	maxConcurrency?: number;
	timeout?: number;
}

export interface StepExecutionContext {
	runId: string;
	stepId: string;
	sessionId: string;
	workspace: string;
	variables: Map<string, unknown>;
}

export type MergeStrategy = "zip" | "concat" | "interleave" | "latest" | "wait-all";

export interface GraphNode {
	id: string;
	type: string;
	inputs: string[];
	outputs: string[];
	execute?: (chunks: ContextChunk[]) => Promise<ContextChunk[]>;
}

export interface MergeNode {
	id: string;
	type: "merge";
	strategy: MergeStrategy;
	sources: string[];
	inputs?: string[];
	outputs: string[];
}

export interface SplitNode {
	id: string;
	type: "split";
	branches: string[];
	inputs?: string[];
	outputs: string[];
}

export interface ConditionalNode {
	id: string;
	type: "conditional";
	condition: string;
	inputs?: string[];
	outputs: string[];
}

export interface ComputationGraph {
	nodes: Map<string, GraphNode>;
	edges: Map<string, string[]>;
}
