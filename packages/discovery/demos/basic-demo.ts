import {
	DiscoveryService,
	detectLLM,
	getSystemInfo,
	createDiscoveryService,
} from "../src/index.js";

console.log("=== Discovery Demo ===\n");

async function demoSystemInfo() {
	console.log("--- Demo 1: System Information ---\n");

	const info = await getSystemInfo();
	console.log("System Info:");
	console.log(`  Platform: ${info.platform}`);
	console.log(`  Architecture: ${info.arch}`);
	console.log(`  CPUs: ${info.cpus}`);
	console.log(`  Memory: ${Math.round(info.memory / (1024 * 1024 * 1024))} GB`);
	console.log(`  Screenpipe Available: ${info.screenpipeAvailable}`);
	console.log(`  Ollama Installed: ${info.ollamaInstalled}`);
	console.log(`  LM Studio Installed: ${info.lmStudioInstalled}`);
	console.log();
}

async function demoLLMDetection() {
	console.log("--- Demo 2: LLM Detection ---\n");

	console.log("Detecting Ollama...");
	const ollamaResult = await detectLLM("ollama", { timeout: 500 });
	console.log(`  Detected: ${ollamaResult.detected}`);
	if (ollamaResult.detected) {
		console.log(`  Provider: ${ollamaResult.provider}`);
		console.log(`  URL: ${ollamaResult.url}`);
		console.log(`  Models: ${ollamaResult.models?.join(", ")}`);
	}
	console.log();

	console.log("Detecting LM Studio...");
	const lmStudioResult = await detectLLM("lm-studio", { timeout: 500 });
	console.log(`  Detected: ${lmStudioResult.detected}`);
	console.log();
}

async function demoDiscoveryService() {
	console.log("--- Demo 3: Discovery Service ---\n");

	const discovery = createDiscoveryService({ timeout: 500 });

	console.log("Running discovery...");
	const result = await discovery.discover();

	console.log(`Found ${result.services.length} services:`);
	for (const service of result.services) {
		console.log(`  - ${service.name} (${service.type}) at ${service.url}`);
		if (service.models && service.models.length > 0) {
			console.log(`    Models: ${service.models.slice(0, 3).join(", ")}...`);
		}
	}
	console.log();

	console.log("Getting running services only...");
	const running = discovery.getRunningServices();
	console.log(`  ${running.length} services running`);
	console.log();

	console.log("Getting LLM services only...");
	const llms = discovery.getServicesByType("llm");
	console.log(`  ${llms.length} LLM services`);
}

await demoSystemInfo();
await demoLLMDetection();
await demoDiscoveryService();

console.log("\n=== Discovery Demo Complete ===");
