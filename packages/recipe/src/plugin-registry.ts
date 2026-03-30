// Plugin Registry for Recipe Step Handlers
// Enables dynamic registration of custom step kinds

import type { ContextChunk } from "@loomai/types";
import type {
	RecipeStep,
	StepExecutionContext,
	StepKind,
} from "./types.js";

// Local type definition to avoid circular import
type OnProgress = (preview: string) => void;

export type StepHandler = (
	step: RecipeStep,
	input: ContextChunk[],
	context: StepExecutionContext,
	onProgress?: OnProgress
) => Promise<ContextChunk[]>;

export class UnknownStepKindError extends Error {
	constructor(kind: string) {
		super(`Unknown step kind: "${kind}". No handler registered.`);
		this.name = "UnknownStepKindError";
	}
}

export class DuplicateHandlerError extends Error {
	constructor(kind: string) {
		super(`Handler already registered for step kind: "${kind}"`);
		this.name = "DuplicateHandlerError";
	}
}

/**
 * PluginRegistry for managing step handlers.
 * Supports dynamic registration, built-in handlers, and handler composition.
 */
export class PluginRegistry {
	private handlers = new Map<StepKind, StepHandler>();
	private readonly builtInKinds: Set<StepKind> = new Set([
		"gather",
		"capture",
		"transcribe",
		"extract",
		"orient",
		"synthesize",
		"create",
		"detect",
		"act",
		"merge",
		"split",
		"conditional",
	]);

	/**
	 * Register a handler for a step kind.
	 * @throws DuplicateHandlerError if handler already registered
	 */
	register(kind: StepKind, handler: StepHandler): void {
		if (this.handlers.has(kind)) {
			throw new DuplicateHandlerError(kind);
		}
		this.handlers.set(kind, handler);
	}

	/**
	 * Override an existing handler (for extending built-ins).
	 */
	override(kind: StepKind, handler: StepHandler): void {
		this.handlers.set(kind, handler);
	}

	/**
	 * Get handler for a step kind.
	 * @throws UnknownStepKindError if no handler registered
	 */
	get(kind: StepKind): StepHandler {
		const handler = this.handlers.get(kind);
		if (!handler) {
			throw new UnknownStepKindError(kind);
		}
		return handler;
	}

	/**
	 * Check if handler exists for step kind.
	 */
	has(kind: StepKind): boolean {
		return this.handlers.has(kind);
	}

	/**
	 * List all registered step kinds.
	 */
	list(): StepKind[] {
		return Array.from(this.handlers.keys());
	}

	/**
	 * Check if step kind is a built-in.
	 */
	isBuiltIn(kind: StepKind): boolean {
		return this.builtInKinds.has(kind);
	}

	/**
	 * Create a registry with all built-in handlers.
	 * Used by RecipeExecutor for default setup.
	 */
	static createWithDefaults(
		executor: RecipeExecutorInterface
	): PluginRegistry {
		const registry = new PluginRegistry();

		// Register all built-in handlers bound to executor
		registry.register("gather", executor.handleGather.bind(executor));
		registry.register("capture", executor.handleCapture.bind(executor));
		registry.register("transcribe", executor.handleTranscribe.bind(executor));
		registry.register("extract", executor.handleExtract.bind(executor));
		registry.register("orient", executor.handleOrient.bind(executor));
		registry.register("synthesize", executor.handleSynthesize.bind(executor));
		registry.register("create", executor.handleCreate.bind(executor));
		registry.register("detect", executor.handleDetect.bind(executor));
		registry.register("act", executor.handleAct.bind(executor));
		registry.register("merge", executor.handleMerge.bind(executor));
		registry.register("split", executor.handleSplit.bind(executor));
		registry.register("conditional", executor.handleConditional.bind(executor));

		return registry;
	}
}

/**
 * Interface for RecipeExecutor to bind handlers.
 */
export interface RecipeExecutorInterface {
	handleGather: StepHandler;
	handleCapture: StepHandler;
	handleTranscribe: StepHandler;
	handleExtract: StepHandler;
	handleOrient: StepHandler;
	handleSynthesize: StepHandler;
	handleCreate: StepHandler;
	handleDetect: StepHandler;
	handleAct: StepHandler;
	handleMerge: StepHandler;
	handleSplit: StepHandler;
	handleConditional: StepHandler;
}
