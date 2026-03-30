import { describe, it, expect, beforeEach } from "bun:test";
import {
	RecipeExecutor,
	createRecipeExecutor,
	createMergeNode,
	createSplitNode,
	createConditionalNode,
	createComputationGraph,
	type Recipe,
	type RecipeStep,
} from "../src/index.js";
import type { ContextChunk } from "@enhancement/types";

function makeChunk(overrides: Partial<ContextChunk> = {}): ContextChunk {
	return {
		kind: "context",
		id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		source: "test",
		workspace: "test-ws",
		sessionId: "test-session",
		content: "Test content",
		contentType: "text",
		timestamp: Date.now(),
		generation: 0,
		...overrides,
	};
}

function makeRecipe(steps: RecipeStep[]): Recipe {
	return {
		id: "test-recipe",
		workspace: "test-ws",
		name: "Test Recipe",
		mode: "batch",
		schemaVersion: 1,
		audiences: [],
		steps,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
}

describe("RecipeExecutor", () => {
	let executor: RecipeExecutor;

	beforeEach(() => {
		executor = createRecipeExecutor({ verbose: false });
	});

	describe("basic execution", () => {
		it("should create executor", () => {
			expect(executor).toBeDefined();
		});

		it("should run empty recipe", async () => {
			const recipe = makeRecipe([]);
			const run = await executor.runRecipe(recipe);

			expect(run.status).toBe("completed");
			expect(run.steps).toEqual([]);
		});

		it("should run single step recipe", async () => {
			const recipe = makeRecipe([
				{ id: "step1", kind: "gather", name: "Gather", config: { query: "test" } },
			]);

			const run = await executor.runRecipe(recipe, [makeChunk({ content: "test" })]);
			expect(run.status).toBe("completed");
			expect(run.steps[0].status).toBe("completed");
		});

		it("should run multi-step recipe", async () => {
			const recipe = makeRecipe([
				{ id: "step1", kind: "gather", name: "Gather", config: {} },
				{ id: "step2", kind: "extract", name: "Extract", config: { pattern: "test" } },
				{ id: "step3", kind: "synthesize", name: "Synthesize", config: { prompt: "Summarize" } },
			]);

			const run = await executor.runRecipe(recipe, [
				makeChunk({ content: "This is a test content" }),
			]);

			expect(run.status).toBe("completed");
			expect(run.steps.length).toBe(3);
			expect(run.steps.every((s) => s.status === "completed")).toBe(true);
		});

		it("should track step dependencies", async () => {
			const recipe = makeRecipe([
				{ id: "step1", kind: "gather", name: "Gather", config: {} },
				{ id: "step2", kind: "extract", name: "Extract", config: {}, dependsOn: ["step1"] },
			]);

			const run = await executor.runRecipe(recipe, [makeChunk({ content: "test" })]);
			expect(run.status).toBe("completed");
		});
	});

	describe("step handlers", () => {
		it("should handle gather step", async () => {
			const recipe = makeRecipe([
				{ id: "gather", kind: "gather", name: "Gather", config: { query: "test", limit: 5 } },
			]);

			const chunks = [makeChunk({ content: "test1" }), makeChunk({ content: "test2" })];
			const run = await executor.runRecipe(recipe, chunks);

			expect(run.steps[0].status).toBe("completed");
			expect(run.steps[0].output?.length).toBeLessThanOrEqual(5);
		});

		it("should handle capture step", async () => {
			const recipe = makeRecipe([
				{ id: "capture", kind: "capture", name: "Capture", config: { captureType: "screenshot" } },
			]);

			const run = await executor.runRecipe(recipe, [makeChunk({ content: "frame" })]);

			expect(run.steps[0].status).toBe("completed");
			expect(run.steps[0].output?.length).toBeGreaterThanOrEqual(1);
		});

		it("should handle transcribe step", async () => {
			const recipe = makeRecipe([
				{ id: "transcribe", kind: "transcribe", name: "Transcribe", config: {} },
			]);

			const run = await executor.runRecipe(recipe, [
				makeChunk({ content: "Audio content", contentType: "audio" }),
			]);

			expect(run.steps[0].status).toBe("completed");
			expect(run.steps[0].output?.[0].contentType).toBe("text");
		});

		it("should handle synthesize step", async () => {
			const recipe = makeRecipe([
				{ id: "synthesize", kind: "synthesize", name: "Synthesize", config: { prompt: "Summarize" } },
			]);

			const run = await executor.runRecipe(recipe, [
				makeChunk({ content: "First piece of content" }),
				makeChunk({ content: "Second piece of content" }),
			]);

			expect(run.steps[0].status).toBe("completed");
			expect(run.steps[0].output?.length).toBe(1);
		});

		it("should handle create step", async () => {
			const recipe = makeRecipe([
				{ id: "create", kind: "create", name: "Create", config: { outputType: "document" } },
			]);

			const run = await executor.runRecipe(recipe, [makeChunk({ content: "input" })]);

			expect(run.steps[0].status).toBe("completed");
			expect(run.steps[0].output?.[0].contentType).toBe("document");
		});

		it("should handle orient step", async () => {
			const recipe = makeRecipe([
				{ id: "orient", kind: "orient", name: "Orient", config: { orientation: "chronological" } },
			]);

			const run = await executor.runRecipe(recipe, [
				makeChunk({ timestamp: 1000 }),
				makeChunk({ timestamp: 2000 }),
			]);

			expect(run.steps[0].status).toBe("completed");
		});

		it("should handle split step", async () => {
			const recipe = makeRecipe([
				{ id: "split", kind: "split", name: "Split", config: { splitBy: "word" } },
			]);

			const run = await executor.runRecipe(recipe, [
				makeChunk({ content: "word1 word2 word3" }),
			]);

			expect(run.steps[0].status).toBe("completed");
			expect(run.steps[0].output?.length).toBe(3);
		});

		it("should handle conditional step", async () => {
			const recipe = makeRecipe([
				{ id: "cond", kind: "conditional", name: "Conditional", config: { condition: "has_content" } },
			]);

			const run = await executor.runRecipe(recipe, [makeChunk({ content: "test" })]);

			expect(run.steps[0].status).toBe("completed");
		});
	});

	describe("progress callbacks", () => {
		it("should emit step_started events", async () => {
			const events: any[] = [];
			const recipe = makeRecipe([
				{ id: "step1", kind: "gather", name: "Gather", config: {} },
			]);

			await executor.runRecipe(recipe, [], (event) => events.push(event));

			expect(events.some((e) => e.type === "step_started")).toBe(true);
			expect(events.some((e) => e.type === "step_completed")).toBe(true);
			expect(events.some((e) => e.type === "run_completed")).toBe(true);
		});
	});

	describe("error handling", () => {
		it("should handle missing handler gracefully", async () => {
			executor.registerHandler("unknown" as any, async () => {
				throw new Error("Handler failed");
			});

			const recipe = makeRecipe([
				{ id: "unknown", kind: "unknown" as any, name: "Unknown", config: {} },
			]);

			const run = await executor.runRecipe(recipe);
			expect(run.steps[0].status).toBe("failed");
		});
	});
});

describe("ComputationGraph", () => {
	describe("MergeNode", () => {
		it("should create merge node", () => {
			const node = createMergeNode("merge1", "concat", ["in1", "in2"], "out");
			expect(node.id).toBe("merge1");
			expect(node.strategy).toBe("concat");
		});

		it("should perform zip merge", async () => {
			const node = createMergeNode("merge1", "zip", ["in1", "in2"], "out");
			const inputs: any[] = [
				[makeChunk({ content: "a1" }), makeChunk({ content: "a2" })],
				[makeChunk({ content: "b1" }), makeChunk({ content: "b2" })],
			];

			const result = await node.merge(inputs);
			expect(result.length).toBe(4);
		});

		it("should perform concat merge", async () => {
			const node = createMergeNode("merge1", "concat", ["in1", "in2"], "out");
			const inputs: any[] = [
				[makeChunk({ content: "a1" }), makeChunk({ content: "a2" })],
				[makeChunk({ content: "b1" })],
			];

			const result = await node.merge(inputs);
			expect(result.length).toBe(3);
		});

		it("should perform interleave merge", async () => {
			const node = createMergeNode("merge1", "interleave", ["in1", "in2"], "out");
			const inputs: any[] = [
				[makeChunk({ content: "a1" }), makeChunk({ content: "a2" })],
				[makeChunk({ content: "b1" })],
			];

			const result = await node.merge(inputs);
			expect(result.length).toBe(3);
			expect(result[0].content).toBe("a1");
			expect(result[1].content).toBe("b1");
		});

		it("should perform latest merge", async () => {
			const node = createMergeNode("merge1", "latest", ["in1", "in2"], "out");
			const inputs: any[] = [
				[makeChunk({ content: "a1", timestamp: 1000 })],
				[makeChunk({ content: "b1", timestamp: 2000 })],
			];

			const result = await node.merge(inputs);
			expect(result.length).toBe(2);
		});

		it("should perform wait-all merge", async () => {
			const node = createMergeNode("merge1", "wait-all", ["in1", "in2"], "out");

			const inputs: any[] = [
				[makeChunk({ content: "a1" })],
				[makeChunk({ content: "b1" })],
			];

			const result = await node.merge(inputs);
			expect(result.length).toBe(2);
		});

		it("should return empty for wait-all with missing data", async () => {
			const node = createMergeNode("merge1", "wait-all", ["in1", "in2"], "out");

			const inputs: any[] = [[makeChunk({ content: "a1" })], []];

			const result = await node.merge(inputs);
			expect(result.length).toBe(0);
		});
	});

	describe("SplitNode", () => {
		it("should create split node", () => {
			const node = createSplitNode("split1", ["branch1", "branch2"]);
			expect(node.id).toBe("split1");
			expect(node.branches).toEqual(["branch1", "branch2"]);
		});

		it("should split input to branches", () => {
			const node = createSplitNode("split1", ["branch1", "branch2"]);
			const input = [makeChunk({ content: "test" })];

			const result = node.split(input);
			expect(result.get("branch1")?.length).toBe(1);
			expect(result.get("branch2")?.length).toBe(1);
		});
	});

	describe("ConditionalNode", () => {
		it("should create conditional node", () => {
			const node = createConditionalNode("cond1", "has_content");
			expect(node.id).toBe("cond1");
			expect(node.condition).toBe("has_content");
		});

		it("should evaluate condition", () => {
			const node = createConditionalNode("cond1", "has_content");

			const contextTrue = new Map([["has_content", true]]);
			const contextFalse = new Map([["has_content", false]]);

			expect(node.evaluate(contextTrue)).toBe(true);
			expect(node.evaluate(contextFalse)).toBe(false);
		});

		it("should use custom condition function", () => {
			const node = createConditionalNode("cond1", "custom", (ctx) => {
				return ctx.get("value") === 42;
			});

			const context = new Map([["value", 42]]);
			expect(node.evaluate(context)).toBe(true);
		});
	});

	describe("ComputationGraphImpl", () => {
		it("should create empty graph", () => {
			const graph = createComputationGraph();
			expect(graph.nodes.size).toBe(0);
			expect(graph.edges.size).toBe(0);
		});

		it("should add nodes", () => {
			const graph = createComputationGraph();
			graph.addNode({ id: "n1", type: "test", inputs: [], outputs: [] });

			expect(graph.nodes.size).toBe(1);
			expect(graph.getNode("n1")).toBeDefined();
		});

		it("should add edges", () => {
			const graph = createComputationGraph();
			graph.addEdge("n1", "n2");

			expect(graph.getOutgoingEdges("n1")).toContain("n2");
		});

		it("should perform topological sort", () => {
			const graph = createComputationGraph();
			graph.addNode({ id: "n1", type: "test", inputs: [], outputs: ["n2"] });
			graph.addNode({ id: "n2", type: "test", inputs: ["n1"], outputs: [] });
			graph.addEdge("n1", "n2");

			const sorted = graph.topologicalSort();
			expect(sorted.indexOf("n1")).toBeLessThan(sorted.indexOf("n2"));
		});

		it("should detect cycles", () => {
			const graph = createComputationGraph();
			graph.addNode({ id: "n1", type: "test", inputs: ["n2"], outputs: ["n2"] });
			graph.addNode({ id: "n2", type: "test", inputs: ["n1"], outputs: ["n1"] });
			graph.addEdge("n1", "n2");
			graph.addEdge("n2", "n1");

			expect(graph.hasCycle()).toBe(true);
		});

		it("should return false for cycle detection on DAG", () => {
			const graph = createComputationGraph();
			graph.addNode({ id: "n1", type: "test", inputs: [], outputs: ["n2"] });
			graph.addNode({ id: "n2", type: "test", inputs: ["n1"], outputs: [] });
			graph.addEdge("n1", "n2");

			expect(graph.hasCycle()).toBe(false);
		});
	});
});
