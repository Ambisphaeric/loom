import {
	EnhancementProviderRegistry,
	OpenAICompatibleProvider,
	createProviderRegistry,
} from "../src/index.js";

console.log("=== AI Providers Demo ===\n");

async function demoProviderRegistry() {
	console.log("--- Demo 1: Provider Registry ---\n");

	const registry = createProviderRegistry();

	console.log("Registering OpenAI-compatible provider...");
	const openaiProvider = new OpenAICompatibleProvider(
		"https://api.openai.com/v1",
		process.env.OPENAI_API_KEY
	);
	registry.register(openaiProvider);
	console.log(`  Registered: ${openaiProvider.name}\n`);

	console.log("Available providers:");
	for (const provider of registry.list()) {
		console.log(`  - ${provider.name} (${provider.type})`);
	}
	console.log();

	console.log("Default provider:");
	const defaultProvider = registry.getDefault();
	console.log(`  ${defaultProvider?.name}\n`);

	console.log("Resolving model 'gpt-4':");
	const resolution = registry.resolveModel("gpt-4");
	if (resolution) {
		console.log(`  Provider: ${resolution.provider.name}`);
		console.log(`  Model: ${resolution.model.id}`);
		console.log(`  Endpoint: ${resolution.endpoint.baseUrl}`);
	} else {
		console.log("  Not found");
	}
	console.log();
}

async function demoLocalProvider() {
	console.log("--- Demo 2: Local Provider (Ollama) ---\n");

	const registry = createProviderRegistry();

	const ollamaProvider = new OpenAICompatibleProvider("http://localhost:11434/v1");
	(ollamaProvider as any).name = "ollama";
	(ollamaProvider as any).type = "local";
	registry.register(ollamaProvider);

	console.log("Testing Ollama connection...");
	const connected = await ollamaProvider.testConnection(ollamaProvider.getDefaultEndpoint());
	console.log(`  Connected: ${connected}\n`);

	console.log("Available providers:");
	for (const provider of registry.list()) {
		console.log(`  - ${provider.name} (${provider.type})`);
	}
}

await demoProviderRegistry();
await demoLocalProvider();

console.log("\n=== AI Providers Demo Complete ===");
