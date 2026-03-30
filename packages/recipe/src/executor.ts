import { ulid } from "ulidx";
import type {
	Recipe,
	RecipeStep,
	RecipeRun,
	StepRun,
	RecipeExecutorOptions,
	StepExecutionContext,
	StepKind,
} from "./types.js";
import type { ContextChunk } from "@loomai/types";
import {
	ComputationGraphImpl,
	createMergeNode,
	createSplitNode,
	createConditionalNode,
} from "./graph.js";

export interface ProgressCallback {
	(event: ProgressEvent): void;
}

export type ProgressEvent =
	| { type: "step_started"; runId: string; stepId: string; stepIndex: number }
	| { type: "step_progress"; runId: string; stepId: string; preview: string }
	| { type: "step_completed"; runId: string; stepId: string; outputLength: number }
	| { type: "step_failed"; runId: string; stepId: string; error: string }
	| { type: "run_completed"; runId: string; status: string; durationMs: number };

type StepHandler = (
	step: RecipeStep,
	input: ContextChunk[],
	context: StepExecutionContext,
	onProgress?: (preview: string) => void
) => Promise<ContextChunk[]>;

export class RecipeExecutor {
	private handlers: Map<StepKind, StepHandler> = new Map();
	private graph: ComputationGraphImpl;

	constructor(private options: RecipeExecutorOptions = {}) {
		this.graph = new ComputationGraphImpl();
		this.registerDefaultHandlers();
	}

	private registerDefaultHandlers(): void {
		this.handlers.set("gather", this.handleGather.bind(this));
		this.handlers.set("capture", this.handleCapture.bind(this));
		this.handlers.set("transcribe", this.handleTranscribe.bind(this));
		this.handlers.set("extract", this.handleExtract.bind(this));
		this.handlers.set("orient", this.handleOrient.bind(this));
		this.handlers.set("synthesize", this.handleSynthesize.bind(this));
		this.handlers.set("create", this.handleCreate.bind(this));
		this.handlers.set("detect", this.handleDetect.bind(this));
		this.handlers.set("act", this.handleAct.bind(this));
		this.handlers.set("merge", this.handleMerge.bind(this));
		this.handlers.set("split", this.handleSplit.bind(this));
		this.handlers.set("conditional", this.handleConditional.bind(this));
	}

	registerHandler(kind: StepKind, handler: StepHandler): void {
		this.handlers.set(kind, handler);
	}

	async runRecipe(
		recipe: Recipe,
		input: ContextChunk[] = [],
		progressCallback?: ProgressCallback
	): Promise<RecipeRun> {
		const sessionId = this.options.sessionId ?? `session_${ulid()}`;
		const runId = `run_${ulid()}`;
		const now = Date.now();

		const recipeRun: RecipeRun = {
			id: runId,
			recipeId: recipe.id,
			workspace: recipe.workspace,
			sessionId,
			status: "running",
			steps: recipe.steps.map((step) => ({
				stepId: step.id,
				status: "pending" as const,
			})),
			createdAt: now,
		};

		const context: StepExecutionContext = {
			runId,
			stepId: "",
			sessionId,
			workspace: recipe.workspace,
			variables: new Map(),
		};

		const stepOutputs = new Map<string, ContextChunk[]>();
		let currentInput = input;

		for (let i = 0; i < recipe.steps.length; i++) {
			const step = recipe.steps[i];
			const stepRun = recipeRun.steps[i];
			const stepStartTime = Date.now();

			// Check if step is disabled
			if (step.enabled === false) {
				stepRun.status = "skipped";
				continue;
			}

			progressCallback?.({
				type: "step_started",
				runId,
				stepId: step.id,
				stepIndex: i,
			});

			try {
				stepRun.status = "running";
				context.stepId = step.id;

				const dependsMet = this.checkDependencies(step, recipe.steps, stepOutputs);
				if (!dependsMet) {
					stepRun.status = "skipped";
					progressCallback?.({
						type: "step_failed",
						runId,
						stepId: step.id,
						error: "Dependencies not met",
					});
					continue;
				}

				const handler = this.handlers.get(step.kind);
				if (!handler) {
					throw new Error(`No handler for step kind: ${step.kind}`);
				}

				const onProgress = (preview: string) => {
					progressCallback?.({
						type: "step_progress",
						runId,
						stepId: step.id,
						preview,
					});
				};

				const output = await handler(step, currentInput, context, onProgress);
				stepOutputs.set(step.id, output);
				currentInput = output;

				stepRun.status = "completed";
				stepRun.output = output;
				stepRun.durationMs = Date.now() - stepStartTime;

				progressCallback?.({
					type: "step_completed",
					runId,
					stepId: step.id,
					outputLength: output.length,
				});
			} catch (err) {
				stepRun.status = "failed";
				stepRun.error = err instanceof Error ? err.message : String(err);
				stepRun.durationMs = Date.now() - stepStartTime;

				progressCallback?.({
					type: "step_failed",
					runId,
					stepId: step.id,
					error: stepRun.error,
				});

				if (this.options.verbose) {
					console.error(`[RecipeExecutor] Step ${step.id} failed:`, err);
				}
			}
		}

		recipeRun.status = this.hasFailures(recipeRun) ? "failed" : "completed";
		recipeRun.completedAt = Date.now();

		// Set outputChunks to the final output if completed successfully
		if (recipeRun.status === "completed") {
			recipeRun.outputChunks = currentInput;
		}

		progressCallback?.({
			type: "run_completed",
			runId,
			status: recipeRun.status,
			durationMs: recipeRun.completedAt - now,
		});

		return recipeRun;
	}

	private checkDependencies(
		step: RecipeStep,
		allSteps: RecipeStep[],
		stepOutputs: Map<string, ContextChunk[]>
	): boolean {
		if (!step.dependsOn || step.dependsOn.length === 0) {
			return true;
		}

		for (const depId of step.dependsOn) {
			const depStep = allSteps.find((s) => s.id === depId);
			if (!depStep) continue;

			const depRun = stepOutputs.get(depId);
			if (depRun === undefined) {
				return false;
			}
		}

		return true;
	}

	private hasFailures(run: RecipeRun): boolean {
		return run.steps.some((s) => s.status === "failed");
	}

	private async handleGather(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const query = (step.config.query as string) || "";
		const limit = (step.config.limit as number) || 10;

		const gathered: ContextChunk[] = [...input];

		if (context.variables.has("gathered")) {
			const additional = context.variables.get("gathered") as ContextChunk[];
			gathered.push(...additional.slice(0, limit));
		}

		return gathered.slice(0, limit);
	}

	private async handleCapture(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const captureType = (step.config.captureType as string) || "screenshot";
		const duration = (step.config.duration as number) || 5000;

		const captured: ContextChunk[] = [];

		for (let i = 0; i < input.length; i++) {
			const chunk: ContextChunk = {
				kind: "context",
				id: `captured-${Date.now()}-${i}`,
				source: "recipe-capture",
				workspace: context.workspace,
				sessionId: context.sessionId,
				content: `Captured ${captureType} frame ${i + 1}`,
				contentType: captureType,
				timestamp: Date.now(),
				generation: 0,
				metadata: { duration, stepId: step.id },
			};
			captured.push(chunk);
		}

		return captured;
	}

	private async handleTranscribe(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const transcribed: ContextChunk[] = [];

		for (const chunk of input) {
			if (chunk.contentType === "audio") {
				transcribed.push({
					...chunk,
					id: `transcribed-${chunk.id}`,
					content: `[Transcription] ${chunk.content}`,
					contentType: "text",
				});
			} else {
				transcribed.push(chunk);
			}
		}

		return transcribed;
	}

	private async handleExtract(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const pattern = (step.config.pattern as string) || "";
		const extracted: ContextChunk[] = [];

		for (const chunk of input) {
			if (pattern && chunk.content.includes(pattern)) {
				extracted.push({
					...chunk,
					id: `extracted-${chunk.id}`,
					source: "recipe-extract",
					content: `Extracted: ${chunk.content}`,
				});
			}
		}

		return extracted;
	}

	private async handleOrient(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const orientation = (step.config.orientation as string) || "chronological";

		const oriented = input.map((chunk, i) => ({
			...chunk,
			id: `oriented-${chunk.id}`,
			source: "recipe-orient",
			timestamp: orientation === "chronological" 
				? chunk.timestamp 
				: Date.now() - i * 1000,
		}));

		if (orientation === "reverse") {
			oriented.reverse();
		}

		return oriented;
	}

	private async handleSynthesize(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const prompt = (step.config.prompt as string) || "Summarize the following:";
		const synthesis = input.map((c) => c.content).join("\n---\n");

		const synthesized: ContextChunk = {
			kind: "context",
			id: `synthesized-${Date.now()}`,
			source: "recipe-synthesize",
			workspace: context.workspace,
			sessionId: context.sessionId,
			content: `${prompt}\n\n${synthesis.slice(0, 500)}...`,
			contentType: "document",
			timestamp: Date.now(),
			generation: 0,
		};

		return [synthesized];
	}

	private async handleCreate(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const outputType = (step.config.outputType as string) || "document";

		const created: ContextChunk = {
			kind: "context",
			id: `created-${Date.now()}`,
			source: "recipe-create",
			workspace: context.workspace,
			sessionId: context.sessionId,
			content: `Created ${outputType} from ${input.length} input chunks`,
			contentType: outputType,
			timestamp: Date.now(),
			generation: 0,
		};

		return [created];
	}

	private async handleDetect(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const detectType = (step.config.detectType as string) || "entities";

		const detected: ContextChunk[] = [];

		for (const chunk of input) {
			detected.push({
				...chunk,
				id: `detected-${chunk.id}`,
				source: "recipe-detect",
				content: `[Detected ${detectType}] ${chunk.content}`,
			});
		}

		return detected;
	}

	private async handleAct(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const action = (step.config.action as string) || "log";

		for (const chunk of input) {
			if (action === "log") {
				console.log(`[Recipe] Action: ${chunk.content.slice(0, 100)}`);
			} else if (action === "store") {
				context.variables.set("lastAction", chunk);
			}
		}

		return input;
	}

	private async handleMerge(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const strategy = (step.config.strategy as "concat" | "interleave") || "concat";

		if (strategy === "concat") {
			return input;
		}

		const interleaved: ContextChunk[] = [];
		const half = Math.ceil(input.length / 2);
		const first = input.slice(0, half);
		const second = input.slice(half);

		for (let i = 0; i < Math.max(first.length, second.length); i++) {
			if (first[i]) interleaved.push(first[i]);
			if (second[i]) interleaved.push(second[i]);
		}

		return interleaved;
	}

	private async handleSplit(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const splitBy = (step.config.splitBy as string) || "line";

		let parts: string[];
		if (splitBy === "word") {
			parts = input.map((c) => c.content.split(/\s+/)).flat().filter(p => p.length > 0);
		} else {
			parts = input.map((c) => c.content.split("\n")).flat();
		}

		const splitChunks = parts.map((part, i) => ({
			kind: "context" as const,
			id: `split-${Date.now()}-${i}`,
			source: "recipe-split",
			workspace: context.workspace,
			sessionId: context.sessionId,
			content: part,
			contentType: "text",
			timestamp: Date.now(),
			generation: 0,
		}));

		return splitChunks;
	}

	private async handleConditional(
		step: RecipeStep,
		input: ContextChunk[],
		context: StepExecutionContext
	): Promise<ContextChunk[]> {
		const condition = (step.config.condition as string) || "always";
		const trueSteps = step.config.trueSteps as string[] || [];
		const falseSteps = step.config.falseSteps as string[] || [];

		let conditionMet = false;

		switch (condition) {
			case "always":
				conditionMet = true;
				break;
			case "never":
				conditionMet = false;
				break;
			case "has_content":
				conditionMet = input.length > 0;
				break;
			case "has_error":
				conditionMet = input.some((c) => c.metadata?.error);
				break;
		}

		if (conditionMet) {
			context.variables.set("conditionalBranch", "true");
		} else {
			context.variables.set("conditionalBranch", "false");
		}

		return input;
	}
}

export function createRecipeExecutor(options?: RecipeExecutorOptions): RecipeExecutor {
	return new RecipeExecutor(options);
}
