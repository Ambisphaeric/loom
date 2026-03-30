import {
	RecipeExecutor,
	createRecipeExecutor,
	createComputationGraph,
	type Recipe,
} from "../src/index.js";

async function runDemo() {
	console.log("=== Recipe Execution Engine Demo ===\n");

	const executor = createRecipeExecutor({ verbose: true });

	console.log("1. Creating a simple recipe...");
	const recipe: Recipe = {
		id: "demo-recipe",
		workspace: "demo-workspace",
		name: "Content Processing Pipeline",
		mode: "batch",
		schemaVersion: 1,
		audiences: [],
		steps: [
			{
				id: "gather",
				kind: "gather",
				name: "Gather Content",
				config: { query: "documents", limit: 10 },
			},
			{
				id: "extract",
				kind: "extract",
				name: "Extract Key Points",
				config: { pattern: "important" },
			},
			{
				id: "synthesize",
				kind: "synthesize",
				name: "Create Summary",
				config: { prompt: "Create a concise summary of the following content:" },
			},
		],
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
	console.log(`   Recipe: ${recipe.name}`);
	console.log(`   Steps: ${recipe.steps.length}`);

	console.log("\n2. Simulating input chunks...");
	const inputChunks = [
		{
			kind: "context" as const,
			id: "chunk-1",
			source: "screenpipe",
			workspace: "demo-workspace",
			sessionId: "demo-session",
			content: "Meeting notes: Important decisions were made about the project roadmap",
			contentType: "text",
			timestamp: Date.now(),
			generation: 0,
		},
		{
			kind: "context" as const,
			id: "chunk-2",
			source: "screenpipe",
			workspace: "demo-workspace",
			sessionId: "demo-session",
			content: "Email summary: The client requested some important changes",
			contentType: "text",
			timestamp: Date.now(),
			generation: 0,
		},
		{
			kind: "context" as const,
			id: "chunk-3",
			source: "document",
			workspace: "demo-workspace",
			sessionId: "demo-session",
			content: "Notes from standup: Team discussed sprint goals and blockers",
			contentType: "text",
			timestamp: Date.now(),
			generation: 0,
		},
	];
	console.log(`   Input chunks: ${inputChunks.length}`);

	console.log("\n3. Executing recipe with progress tracking...");
	const events: any[] = [];

	const run = await executor.runRecipe(recipe, inputChunks, (event) => {
		events.push(event);
		switch (event.type) {
			case "step_started":
				console.log(`   📦 Step started: ${event.stepId}`);
				break;
			case "step_progress":
				console.log(`   ⏳ Progress: ${event.preview.slice(0, 50)}...`);
				break;
			case "step_completed":
				console.log(`   ✅ Step completed: ${event.stepId} (${event.outputLength} outputs)`);
				break;
			case "step_failed":
				console.log(`   ❌ Step failed: ${event.stepId} - ${event.error}`);
				break;
			case "run_completed":
				console.log(`   🏁 Run completed: ${event.status} (${event.durationMs}ms)`);
				break;
		}
	});

	console.log("\n4. Recipe execution summary:");
	console.log(`   Status: ${run.status}`);
	console.log(`   Duration: ${run.completedAt && run.createdAt ? run.completedAt - run.createdAt : 0}ms`);
	console.log(`   Steps executed: ${run.steps.filter((s) => s.status !== "skipped").length}`);

	for (const step of run.steps) {
		const icon = step.status === "completed" ? "✅" : step.status === "failed" ? "❌" : "⏭️";
		console.log(`   ${icon} ${step.stepId}: ${step.status}${step.durationMs ? ` (${step.durationMs}ms)` : ""}`);
	}

	console.log("\n5. Using ComputationGraph...");
	const graph = createComputationGraph();

	graph.addNode({ id: "input", type: "source", inputs: [], outputs: ["process1"] });
	graph.addNode({ id: "process1", type: "transform", inputs: ["input"], outputs: ["merge1"] });
	graph.addNode({ id: "process2", type: "transform", inputs: ["input"], outputs: ["merge1"] });
	graph.addNode({ id: "merge1", type: "merge", inputs: ["process1", "process2"], outputs: ["output"] });
	graph.addNode({ id: "output", type: "sink", inputs: ["merge1"], outputs: [] });

	graph.addEdge("input", "process1");
	graph.addEdge("input", "process2");
	graph.addEdge("process1", "merge1");
	graph.addEdge("process2", "merge1");
	graph.addEdge("merge1", "output");

	console.log(`   Nodes: ${graph.nodes.size}`);
	console.log(`   Edges: ${graph.edges.size}`);
	console.log(`   Has cycle: ${graph.hasCycle()}`);
	console.log(`   Topological order: ${graph.topologicalSort().join(" → ")}`);

	console.log("\n6. Event summary:");
	const eventCounts = events.reduce((acc, e) => {
		acc[e.type] = (acc[e.type] || 0) + 1;
		return acc;
	}, {} as Record<string, number>);
	console.log(`   Total events: ${events.length}`);
	for (const [type, count] of Object.entries(eventCounts)) {
		console.log(`   ${type}: ${count}`);
	}

	console.log("\n=== Demo Complete ===");
}

runDemo().catch(console.error);
