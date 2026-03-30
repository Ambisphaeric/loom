import {
	FabricTransformer,
	createFabricTransformer,
	getDefaultPatterns,
	getPatternsByCategory,
} from "../src/index.js";

async function runDemo() {
	console.log("=== Fabric Pattern Integration Demo ===\n");

	console.log("1. Creating Fabric transformer...");
	const transformer = createFabricTransformer({
		available: true,
		model: "gpt-4",
		temperature: 0.7,
	});
	console.log(`   Available: ${transformer.isAvailable()}`);

	console.log("\n2. Default patterns:");
	const patterns = getDefaultPatterns();
	console.log(`   Total patterns: ${patterns.length}`);

	const categories = [...new Set(patterns.map((p) => p.category))];
	console.log("   Categories:", categories.join(", "));

	console.log("\n3. Pattern details:");
	const summarizePatterns = getPatternsByCategory("summarize");
	for (const pattern of summarizePatterns) {
		console.log(`   [${pattern.category}] ${pattern.name}: ${pattern.description}`);
	}

	console.log("\n4. Running pattern on sample text...");
	const sampleText = `
The quarterly report shows significant growth in user engagement.
Key metrics:
- Daily active users increased by 45%
- Retention rate improved to 78%
- New feature adoption at 62%

Action items:
- Schedule follow-up meeting with product team
- Review analytics dashboard for detailed insights
- Prepare presentation for stakeholder review
	`.trim();

	const summarizeResult = await transformer.runPattern("summarize", sampleText);
	console.log("\n   Pattern: summarize");
	console.log(`   Success: ${summarizeResult.success}`);
	if (summarizeResult.success && summarizeResult.output) {
		console.log(`   Output:\n${summarizeResult.output.slice(0, 200)}...`);
	}

	console.log("\n5. Running extract_wisdom pattern...");
	const wisdomResult = await transformer.runPattern("extract_wisdom", sampleText);
	console.log("\n   Pattern: extract_wisdom");
	console.log(`   Success: ${wisdomResult.success}`);
	if (wisdomResult.success && wisdomResult.output) {
		console.log(`   Output:\n${wisdomResult.output.slice(0, 200)}...`);
	}

	console.log("\n6. Transforming chunks...");
	const chunks = [
		{
			kind: "context" as const,
			id: "chunk-1",
			source: "document",
			workspace: "demo",
			sessionId: "demo",
			content: "The product roadmap includes three major milestones.",
			contentType: "text",
			timestamp: Date.now(),
			generation: 0,
		},
		{
			kind: "context" as const,
			id: "chunk-2",
			source: "document",
			workspace: "demo",
			sessionId: "demo",
			content: "User feedback indicates demand for better mobile experience.",
			contentType: "text",
			timestamp: Date.now(),
			generation: 0,
		},
	];

	const transformResults = await transformer.transformChunks(chunks, "key_points");
	console.log(`   Transformed ${transformResults.length} chunks`);

	for (const result of transformResults) {
		console.log(`   - ${result.chunks[0].source}: ${result.result.success ? "OK" : "FAILED"}`);
	}

	console.log("\n7. Custom pattern registration...");
	transformer.registerPattern({
		name: "action_items",
		description: "Extract action items from text",
		prompt:
			"Extract all action items and tasks from the following text, formatted as a bullet list:\n\n{{input}}",
		category: "extract",
	});

	const customResult = await transformer.runPattern("action_items", sampleText);
	console.log(`   Custom pattern: ${customResult.success ? "SUCCESS" : "FAILED"}`);

	console.log("\n8. Pattern categories breakdown:");
	for (const category of categories) {
		const categoryPatterns = getPatternsByCategory(category as any);
		console.log(`   ${category}: ${categoryPatterns.length} patterns`);
	}

	console.log("\n=== Demo Complete ===");
}

runDemo().catch(console.error);
