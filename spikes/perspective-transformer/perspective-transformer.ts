/**
 * Perspective-Oriented Transformation System
 *
 * Demonstrates the core building blocks:
 * Perspective + Orientation + Input → Transformation → Output
 *
 * Uses: Fabric (patterns) + AI Providers (LLM) + Bus (events) + Store (persistence)
 */

import {
	createFabricTransformer,
	FabricTransformer,
} from "@enhancement/fabric";
import {
	createProviderRegistry,
	OpenAICompatibleProvider,
} from "@enhancement/ai-providers";
import { EnhancementBus, MergeQueue } from "@enhancement/bus";
import { createStore, EnhancementStore } from "@enhancement/store";
import type { ContextChunk, RawChunk } from "@enhancement/types";
import { ulid } from "ulidx";

// ============================================================================
// TYPES
// ============================================================================

interface Perspective {
	name: string;
	description: string;
	basePrompt: string;
}

interface Orientation {
	name: string;
	description: string;
	goalPrompt: string;
}

interface TransformationRequest {
	perspective: string;
	orientation: string;
	input: string;
	context?: Record<string, unknown>;
}

interface TransformationResult {
	id: string;
	perspective: string;
	orientation: string;
	input: string;
	output: string;
	tokensUsed?: number;
	durationMs: number;
	timestamp: number;
}

// ============================================================================
// PERSPECTIVE DEFINITIONS
// ============================================================================

const PERSPECTIVES: Perspective[] = [
	{
		name: "developer",
		description: "View content through a software engineering lens",
		basePrompt:
			"You are an experienced software developer. Consider code quality, architecture, maintainability, and best practices.",
	},
	{
		name: "manager",
		description: "View content through a business/leadership lens",
		basePrompt:
			"You are a product manager. Focus on business value, user impact, timelines, resource allocation, and strategic alignment.",
	},
	{
		name: "customer",
		description: "View content through an end-user lens",
		basePrompt:
			"You are an end user of this product/service. Consider usability, clarity, value proposition, and your immediate needs.",
	},
	{
		name: "teacher",
		description: "View content through an educational lens",
		basePrompt:
			"You are an educator. Focus on clarity, learning progression, examples, and how to make this understandable.",
	},
	{
		name: "skeptic",
		description: "View content through a critical analysis lens",
		basePrompt:
			"You are a skeptical analyst. Challenge assumptions, identify weaknesses, consider edge cases, and question claims.",
	},
];

// ============================================================================
// ORIENTATION DEFINITIONS
// ============================================================================

const ORIENTATIONS: Orientation[] = [
	{
		name: "explain",
		description: "Break down and clarify",
		goalPrompt:
			"Your goal is to explain this clearly. Break down complex concepts, define terms, and make it accessible.",
	},
	{
		name: "critique",
		description: "Analyze and identify issues",
		goalPrompt:
			"Your goal is to critique this thoroughly. Identify problems, weaknesses, risks, and areas for improvement.",
	},
	{
		name: "improve",
		description: "Suggest enhancements",
		goalPrompt:
			"Your goal is to suggest concrete improvements. Provide actionable recommendations with reasoning.",
	},
	{
		name: "summarize",
		description: "Distill to essence",
		goalPrompt:
			"Your goal is to summarize concisely. Capture the key points without losing critical nuance.",
	},
	{
		name: "expand",
		description: "Elaborate and develop",
		goalPrompt:
			"Your goal is to expand on this. Add detail, examples, context, and depth to the content.",
	},
	{
		name: "translate",
		description: "Convert to different form",
		goalPrompt:
			"Your goal is to translate this into a different format or style while preserving meaning.",
	},
];

// ============================================================================
// THE TRANSFORMATION ENGINE
// ============================================================================

class PerspectiveOrientedTransformer {
	private fabric: FabricTransformer;
	private bus: EnhancementBus;
	private store: EnhancementStore;
	private perspectives: Map<string, Perspective>;
	private orientations: Map<string, Orientation>;

	constructor(fabric: FabricTransformer, storePath?: string) {
		this.fabric = fabric;
		this.bus = new EnhancementBus({ maxQueueSize: 1000 });
		this.store = new EnhancementStore(
			{ name: "test-store", path: storePath },
			{ vectorEngine: "zvec", vectorDimension: 384 }
		);

		// Initialize perspectives and orientations
		this.perspectives = new Map(PERSPECTIVES.map((p) => [p.name, p]));
		this.orientations = new Map(ORIENTATIONS.map((o) => [o.name, o]));

		// Set up bus event handlers
		this.setupBusHandlers();
	}

	private setupBusHandlers(): void {
		// Listen for transformation requests
		this.bus.subscribe("transform/request", async (chunk: RawChunk) => {
			console.log(`[Bus] Received transformation request: ${chunk.id}`);
		});

		// Listen for completed transformations
		this.bus.subscribe("transform/complete", async (chunk: RawChunk) => {
			console.log(`[Bus] Transformation complete: ${chunk.id}`);
			// Persist to store
			await this.store.store({
				...chunk,
				workspace: "perspective-transformations",
			});
		});
	}

	/**
	 * Core transformation method
	 * Perspective + Orientation + Input → Output
	 */
	async transform(request: TransformationRequest): Promise<TransformationResult> {
		const startTime = Date.now();
		const id = ulid();

		// Validate perspective and orientation
		const perspective = this.perspectives.get(request.perspective);
		const orientation = this.orientations.get(request.orientation);

		if (!perspective) {
			throw new Error(`Unknown perspective: ${request.perspective}`);
		}
		if (!orientation) {
			throw new Error(`Unknown orientation: ${request.orientation}`);
		}

		// Build the composite prompt
		const compositePrompt = this.buildCompositePrompt(
			perspective,
			orientation,
			request.input,
			request.context
		);

		// Publish request event
		this.bus.publish({
			id,
			type: "transform/request",
			contentType: "text/plain",
			data: compositePrompt,
			source: "perspective-transformer",
			sessionId: request.context?.sessionId as string,
			timestamp: Date.now(),
		});

		// Select the appropriate fabric pattern based on orientation
		const patternName = this.selectPatternForOrientation(request.orientation);

		// Execute transformation via Fabric
		const result = await this.fabric.runPattern(patternName, compositePrompt, {
			perspective: request.perspectives,
			orientation: request.orientation,
		});

		const duration = Date.now() - startTime;

		// Create result
		const transformationResult: TransformationResult = {
			id,
			perspective: request.perspective,
			orientation: request.orientation,
			input: request.input,
			output: result.success ? result.output || "" : `Error: ${result.error}`,
			tokensUsed: result.tokensUsed,
			durationMs: duration,
			timestamp: Date.now(),
		};

		// Publish completion event
		this.bus.publish({
			id,
			type: "transform/complete",
			contentType: "application/json",
			data: JSON.stringify(transformationResult),
			source: "perspective-transformer",
			sessionId: request.context?.sessionId as string,
			timestamp: Date.now(),
		});

		return transformationResult;
	}

	/**
	 * Build the composite prompt combining perspective + orientation + input
	 */
	private buildCompositePrompt(
		perspective: Perspective,
		orientation: Orientation,
		input: string,
		context?: Record<string, unknown>
	): string {
		let prompt = `${perspective.basePrompt}\n\n${orientation.goalPrompt}`;

		// Add context if provided
		if (context && Object.keys(context).length > 0) {
			prompt += "\n\nContext:";
			for (const [key, value] of Object.entries(context)) {
				if (key !== "sessionId") {
					prompt += `\n- ${key}: ${value}`;
				}
			}
		}

		prompt += `\n\n---\n\nCONTENT TO TRANSFORM:\n\n${input}`;

		return prompt;
	}

	/**
	 * Map orientation to fabric pattern
	 */
	private selectPatternForOrientation(orientation: string): string {
		const mapping: Record<string, string> = {
			explain: "explain_code", // Repurpose for general explanation
			critique: "review_code", // Repurpose for general critique
			improve: "rewrite_for_clarity",
			summarize: "summarize",
			expand: "expand_brief",
			translate: "markdown_to_html", // Repurpose for format transformation
		};
		return mapping[orientation] || "summarize";
	}

	/**
	 * Get available perspectives
	 */
	getPerspectives(): Perspective[] {
		return Array.from(this.perspectives.values());
	}

	/**
	 * Get available orientations
	 */
	getOrientations(): Orientation[] {
		return Array.from(this.orientations.values());
	}

	/**
	 * Query past transformations
	 */
	async queryHistory(query: string, limit = 10): Promise<ContextChunk[]> {
		return this.store.query(query, undefined, limit);
	}

	/**
	 * Transform with multiple perspectives (parallel)
	 */
	async transformMultiPerspective(
		perspectives: string[],
		orientation: string,
		input: string,
		context?: Record<string, unknown>
	): Promise<TransformationResult[]> {
		const requests = perspectives.map((perspective) =>
			this.transform({
				perspective,
				orientation,
				input,
				context,
			})
		);

		return Promise.all(requests);
	}
}

// ============================================================================
// EXAMPLE USAGE AND TEST CASES
// ============================================================================

async function runTests() {
	console.log("=== Perspective-Oriented Transformation System ===\n");

	// Initialize the system
	const registry = createProviderRegistry();
	const fabric = createFabricTransformer(
		{ available: true, model: "gpt-4", temperature: 0.7 },
		undefined, // No real provider - simulated mode
		undefined
	);

	const transformer = new PerspectiveOrientedTransformer(fabric);

	// Show available options
	console.log("Available Perspectives:");
	transformer.getPerspectives().forEach((p) => {
		console.log(`  - ${p.name}: ${p.description}`);
	});

	console.log("\nAvailable Orientations:");
	transformer.getOrientations().forEach((o) => {
		console.log(`  - ${o.name}: ${o.description}`);
	});

	// Test input
	const testInput = `
We need to implement a new feature that allows users to export their data in CSV format.
The feature should include a button in the settings panel, a backend endpoint to generate
the CSV, and email notification when the export is ready. We estimate this will take
about 3 days to implement and test.
`;

	console.log("\n--- TEST 1: Developer + Critique ---");
	const result1 = await transformer.transform({
		perspective: "developer",
		orientation: "critique",
		input: testInput,
		context: { sessionId: "test-1", feature: "CSV Export" },
	});
	console.log(`Duration: ${result1.durationMs}ms`);
	console.log(`Output preview: ${result1.output.slice(0, 150)}...`);

	console.log("\n--- TEST 2: Manager + Summarize ---");
	const result2 = await transformer.transform({
		perspective: "manager",
		orientation: "summarize",
		input: testInput,
		context: { sessionId: "test-2", feature: "CSV Export" },
	});
	console.log(`Duration: ${result2.durationMs}ms`);
	console.log(`Output preview: ${result2.output.slice(0, 150)}...`);

	console.log("\n--- TEST 3: Customer + Explain ---");
	const result3 = await transformer.transform({
		perspective: "customer",
		orientation: "explain",
		input: testInput,
		context: { sessionId: "test-3", feature: "CSV Export" },
	});
	console.log(`Duration: ${result3.durationMs}ms`);
	console.log(`Output preview: ${result3.output.slice(0, 150)}...`);

	console.log("\n--- TEST 4: Multi-Perspective (parallel) ---");
	const multiResults = await transformer.transformMultiPerspective(
		["developer", "manager", "skeptic"],
		"critique",
		testInput,
		{ sessionId: "test-4", feature: "CSV Export" }
	);
	multiResults.forEach((r) => {
		console.log(`  ${r.perspective}: ${r.durationMs}ms`);
	});

	console.log("\n--- TEST 5: Teacher + Improve ---");
	const codeInput = `
function processData(data) {
  let result = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i].active) {
      result.push(data[i]);
    }
  }
  return result;
}
`;
	const result5 = await transformer.transform({
		perspective: "teacher",
		orientation: "improve",
		input: codeInput,
		context: { sessionId: "test-5", language: "JavaScript" },
	});
	console.log(`Duration: ${result5.durationMs}ms`);
	console.log(`Output preview: ${result5.output.slice(0, 150)}...`);

	console.log("\n=== All Tests Complete ===");
}

// Run if executed directly
if (import.meta.main) {
	runTests().catch(console.error);
}

export {
	PerspectiveOrientedTransformer,
	PERSPECTIVES,
	ORIENTATIONS,
	type Perspective,
	type Orientation,
	type TransformationRequest,
	type TransformationResult,
};
