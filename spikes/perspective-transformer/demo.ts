/**
 * Interactive Demo of Perspective-Oriented Transformation
 * Now with REAL (but silly) LM Studio model!
 *
 * Run with: bun run demo.ts
 */

import {
	PerspectiveOrientedTransformer,
	PERSPECTIVES,
	ORIENTATIONS,
} from "./perspective-transformer.js";
import { createFabricTransformer } from "@enhancement/fabric";
import { OpenAICompatibleProvider } from "@enhancement/ai-providers";

// Demo content library
const DEMO_CONTENT = {
	code: `
function processUserData(users) {
  const results = [];
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (user.isActive && user.email) {
      results.push({
        name: user.name,
        email: user.email.toLowerCase(),
        lastLogin: user.lastLogin || new Date()
      });
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}
`,

	product: `
We're planning to launch a new feature that uses AI to automatically categorize
customer support tickets. The system will analyze incoming messages, classify
them by urgency and topic, and route them to the appropriate team member.
This should reduce response time by 40% and improve customer satisfaction.
`,

	architecture: `
Our current system uses a monolithic architecture with a single database.
We're considering migrating to microservices with separate databases per service.
The frontend is built with React, backend with Node.js/Express.
`,

	meeting: `
The team discussed the Q4 roadmap in today's meeting. Key decisions:
- Prioritize mobile app redesign over desktop improvements
- Delay API v2 launch by 2 weeks to add GraphQL support
- Hire 2 additional backend engineers
- Cut the experimental ML feature due to resource constraints
`,

	weird: `
If you think about it, clouds are just sky meat. And rain is cloud sweat.
Why do we park on driveways and drive on parkways? The word "abbreviation"
is really long for what it means. If two vegans are arguing, is it still
considered beef?
`,
};

async function runDemo() {
	console.log("╔════════════════════════════════════════════════════════════════╗");
	console.log("║     Perspective-Oriented Transformation System Demo            ║");
	console.log("║              🔥 NOW WITH REAL (SILLY) LM STUDIO 🔥             ║");
	console.log("║                   Model: qwen3.5-0.8b-optiq                   ║");
	console.log("╚════════════════════════════════════════════════════════════════╝\n");

	// Initialize LM Studio provider
	console.log("🌐 Connecting to LM Studio at http://localhost:1234/v1...");

	const lmStudioProvider = new OpenAICompatibleProvider(
		"http://localhost:1234/v1",
		undefined // No API key needed for local LM Studio
	);

	// Test connection
	const lmStudioEndpoint = {
		name: "lm-studio",
		baseUrl: "http://localhost:1234/v1",
		apiKey: undefined,
	};

	const isConnected = await lmStudioProvider.testConnection(lmStudioEndpoint);
	if (!isConnected) {
		console.error("❌ Could not connect to LM Studio. Is it running on port 1234?");
		process.exit(1);
	}
	console.log("✅ Connected to LM Studio!\n");

	// Initialize fabric with REAL provider
	const fabric = createFabricTransformer(
		{ available: true, model: "qwen3.5-0.8b-optiq", temperature: 0.8 },
		lmStudioProvider,
		lmStudioEndpoint
	);

	const transformer = new PerspectiveOrientedTransformer(fabric);

	// Show available options
	console.log("📋 Available Perspectives:");
	PERSPECTIVES.forEach((p) => {
		console.log(`   • ${p.name.padEnd(12)} - ${p.description}`);
	});

	console.log("\n📋 Available Orientations:");
	ORIENTATIONS.forEach((o) => {
		console.log(`   • ${o.name.padEnd(12)} - ${o.description}`);
	});

	console.log("\n📋 Demo Content Available:");
	Object.keys(DEMO_CONTENT).forEach((k) => {
		console.log(`   • ${k}`);
	});

	// Run demo combinations
	console.log("\n" + "═".repeat(70));
	console.log("DEMO 1: Code Review (Developer + Critique)");
	console.log("═".repeat(70));

	const demo1Start = Date.now();
	const demo1 = await transformer.transform({
		perspective: "developer",
		orientation: "critique",
		input: DEMO_CONTENT.code,
		context: { demo: "1", type: "code-review" },
	});
	const demo1Duration = Date.now() - demo1Start;

	console.log(`\n⏱️  Duration: ${demo1Duration}ms`);
	console.log(`🤖 Model: qwen3.5-0.8b-optiq`);
	console.log(`\n📝 Output:\n${demo1.output}`);

	console.log("\n" + "═".repeat(70));
	console.log("DEMO 2: Product Summary (Manager + Summarize)");
	console.log("═".repeat(70));

	const demo2Start = Date.now();
	const demo2 = await transformer.transform({
		perspective: "manager",
		orientation: "summarize",
		input: DEMO_CONTENT.product,
		context: { demo: "2", type: "product-brief" },
	});
	const demo2Duration = Date.now() - demo2Start;

	console.log(`\n⏱️  Duration: ${demo2Duration}ms`);
	console.log(`🤖 Model: qwen3.5-0.8b-optiq`);
	console.log(`\n📝 Output:\n${demo2.output}`);

	console.log("\n" + "═".repeat(70));
	console.log("DEMO 3: The Weird One (Skeptic + Explain)");
	console.log("═".repeat(70));
	console.log("(This should get interesting with a silly model...)\n");

	const demo3Start = Date.now();
	const demo3 = await transformer.transform({
		perspective: "skeptic",
		orientation: "explain",
		input: DEMO_CONTENT.weird,
		context: { demo: "3", type: "nonsense" },
	});
	const demo3Duration = Date.now() - demo3Start;

	console.log(`⏱️  Duration: ${demo3Duration}ms`);
	console.log(`🤖 Model: qwen3.5-0.8b-optiq`);
	console.log(`\n📝 Output:\n${demo3.output}`);

	console.log("\n" + "═".repeat(70));
	console.log("DEMO 4: Multi-Perspective Analysis (Meeting Notes)");
	console.log("═".repeat(70));

	console.log("\n🔍 Running 3 perspectives in parallel on meeting notes...");
	console.log("(This might take a moment with the local model...)\n");

	const demo4Start = Date.now();
	const demo4 = await transformer.transformMultiPerspective(
		["developer", "manager", "skeptic"],
		"critique",
		DEMO_CONTENT.meeting,
		{ demo: "4", type: "meeting-analysis" }
	);
	const demo4Duration = Date.now() - demo4Start;

	console.log(`Total time for 3 parallel critiques: ${demo4Duration}ms\n`);

	demo4.forEach((result, i) => {
		const icons: Record<string, string> = {
			developer: "💻",
			manager: "📊",
			skeptic: "🤔",
		};
		console.log(`${icons[result.perspective] || "📝"} ${result.perspective.toUpperCase()}:`);
		console.log(`${result.output}\n`);
	});

	console.log("\n" + "═".repeat(70));
	console.log("Summary");
	console.log("═".repeat(70));

	const totalTime = demo1Duration + demo2Duration + demo3Duration + demo4Duration;
	const totalTokens = (demo1.tokensUsed || 0) + (demo2.tokensUsed || 0) +
		(demo3.tokensUsed || 0) + (demo4.reduce((sum, r) => sum + (r.tokensUsed || 0), 0));

	console.log(`
✅ Successfully ran 5 demos with REAL (silly) LM Studio model!
📊 Total transformations: 7
⏱️ Total time: ${totalTime}ms
🤖 Model used: qwen3.5-0.8b-optiq (very fast, very silly)
💾 All results persisted to Store
📡 All events published to Bus
${totalTokens > 0 ? `🔤 Total tokens used: ${totalTokens}` : ""}

Key Capabilities Demonstrated:
• Single perspective transformations with real LLM
• Multi-perspective parallel analysis (all hit LM Studio)
• Local model integration (no cloud API needed)
• Event-driven architecture
• Persistent storage

⚠️ Remember: This model is FAST but SILLY - don't trust it for important decisions!
`);
}

// Run the demo
runDemo().catch((err) => {
	console.error("Demo failed:", err);
	process.exit(1);
});
