import {
	PluginLoader,
	createPluginLoader,
	createPluginConfig,
	registerPlugin,
} from "../src/index.js";

async function runDemo() {
	console.log("=== Plugin System Demo ===\n");

	const loader = createPluginLoader();

	console.log("1. Creating plugin loader...");
	console.log(`   Initial plugins: ${loader.getAll().length}`);

	console.log("\n2. Registering a mock plugin...");
	registerPlugin({
		manifest: {
			name: "example-plugin",
			version: "1.0.0",
			description: "An example plugin",
			capabilities: ["tools", "source"],
		},
		factory: async () => ({
			name: "example-plugin",
			version: "1.0.0",
			permissions: ["network"],
			capabilities: {
				tools: {
					tools: () => [
						{
							name: "example-tool",
							description: "An example tool",
							parameters: {},
							execute: async () => ({ success: true, output: "Hello from plugin!" }),
						},
					],
				},
			},
			async init(_config) {
				console.log("   [example-plugin] Initialized");
			},
			async start() {
				console.log("   [example-plugin] Started");
			},
			async stop() {
				console.log("   [example-plugin] Stopped");
			},
		}),
		enabled: true,
	});

	console.log("   Registered plugins:", loader.getAllStatuses().length);

	console.log("\n3. Loading registered plugin...");
	const loadedPlugin = await loader.loadFromRegistration("example-plugin");
	if (loadedPlugin) {
		console.log(`   Loaded: ${loadedPlugin.name} v${loadedPlugin.version}`);

		console.log("\n4. Checking plugin capabilities...");
		const capabilities = loader.getCapabilities(loadedPlugin);
		console.log("   Capabilities:", capabilities.map((c) => c.type).join(", "));

		console.log("\n5. Initializing plugin...");
		const config = createPluginConfig("demo-workspace", {
			defaultModel: "gpt-4",
			dataDir: "~/.enhancement",
		});
		await loader.initAll([loadedPlugin], config);

		console.log("\n6. Starting plugin...");
		await loader.startAll([loadedPlugin]);

		console.log("\n7. Using plugin tools...");
		const tools = (loadedPlugin.capabilities.tools as any)?.tools?.() ?? [];
		for (const tool of tools) {
			console.log(`   Tool: ${tool.name} - ${tool.description}`);
			const result = await tool.execute({});
			console.log(`   Result: ${result.output}`);
		}

		console.log("\n8. Stopping plugin...");
		await loader.stopAll([loadedPlugin]);
	}

	console.log("\n9. Plugin status check...");
	const status = loader.getStatus("example-plugin");
	console.log(`   Status: ${status?.loaded ? "Loaded" : "Not loaded"}`);

	console.log("\n10. All registered plugins:");
	const allStatuses = loader.getAllStatuses();
	for (const s of allStatuses) {
		console.log(`    - ${s.name} (${s.loaded ? "loaded" : "registered"})`);
	}

	console.log("\n=== Demo Complete ===");
}

runDemo().catch(console.error);
