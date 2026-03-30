import { EnhancementBus } from "@enhancement/bus";
import { createStore } from "@enhancement/store";
import { ScreenpipeController, createScreenpipe } from "../src/index.js";
import type { RawChunk, ContextChunk } from "@enhancement/types";

console.log("=== Screenpipe Demo ===\n");

async function demoBasicLifecycle() {
	console.log("--- Demo 1: Basic Lifecycle ---\n");

	const screenpipe = new ScreenpipeController({
		workspace: "demo-workspace",
		sessionId: "demo-session",
	});

	console.log("Initial status:");
	console.log(`  Running: ${screenpipe.getStatus().running}`);
	console.log(`  Port: ${screenpipe.getStatus().port}`);
	console.log(`  Capture mode:`, screenpipe.getStatus().captureMode);

	console.log("\nUpdating capture mode...");
	screenpipe.setCaptureMode({ mic: false, systemAudio: false });
	console.log(`  New capture mode:`, screenpipe.getStatus().captureMode);

	console.log("\nSubscribing to mode changes...");
	const unsubscribe = screenpipe.onCaptureModeChange(() => {
		console.log("  [Callback] Capture mode changed!");
	});

	screenpipe.setCaptureMode({ screen: false });
	screenpipe.setCaptureMode({ screen: true });

	unsubscribe();
	screenpipe.setCaptureMode({ mic: true });

	console.log("\n✓ Basic lifecycle demo complete\n");
}

async function demoBusIntegration() {
	console.log("--- Demo 2: Bus Integration ---\n");

	const bus = new EnhancementBus("demo-workspace");
	const screenpipe = createScreenpipe({
		workspace: "demo-workspace",
		sessionId: "bus-demo-session",
		bus,
	});

	let publishedChunks: RawChunk[] = [];
	bus.subscribe("screenshot", async (chunk: RawChunk) => {
		publishedChunks.push(chunk);
		console.log(`  [Bus] Received screenshot chunk: ${chunk.contentType}`);
	});

	bus.subscribe("audio", async (chunk: RawChunk) => {
		publishedChunks.push(chunk);
		console.log(`  [Bus] Received audio chunk: ${chunk.contentType}`);
	});

	console.log("Simulating chunk publication...");
	const mockChunk: RawChunk = {
		kind: "raw",
		source: "screenpipe",
		workspace: "demo-workspace",
		sessionId: "bus-demo-session",
		contentType: "screenshot",
		data: Buffer.from("fake-screenshot-data"),
		timestamp: Date.now(),
		generation: 0,
		metadata: { windowTitle: "VS Code" },
	};

	bus.publish(mockChunk);

	await new Promise((r) => setTimeout(r, 100));

	console.log(`\nTotal chunks published to bus: ${publishedChunks.length}`);

	console.log("\n✓ Bus integration demo complete\n");
}

async function demoStoreIntegration() {
	console.log("--- Demo 3: Store Integration (Auto-Persist) ---\n");

	const store = createStore({ engine: "zvec", dbPath: ":memory:" });
	await store.init();

	const screenpipe = createScreenpipe({
		workspace: "demo-workspace",
		sessionId: "store-demo-session",
		store,
		autoPersist: true,
	});

	console.log("Store configured for auto-persist");
	console.log(`  Auto-persist enabled: ${screenpipe.getStatus().autoPersist}`);

	console.log("\nStoring a sample chunk directly...");
	const sampleChunk: ContextChunk = {
		kind: "context",
		id: `demo-${Date.now()}`,
		source: "screenpipe",
		workspace: "demo-workspace",
		sessionId: "store-demo-session",
		content: "User is coding a React component with useState hook",
		contentType: "screenshot",
		timestamp: Date.now(),
		generation: 0,
		metadata: { windowTitle: "VS Code", appName: "Code" },
	};

	await store.store(sampleChunk);
	console.log(`  Stored chunk: ${sampleChunk.id}`);

	console.log("\nQuerying store for 'React'...");
	const results = await store.query("React", {});
	console.log(`  Found ${results.length} results:`);
	for (const result of results) {
		console.log(`    - ${result.contentType}: ${result.content.slice(0, 50)}...`);
	}

	store.close();
	console.log("\n✓ Store integration demo complete\n");
}

async function demoCanonicalWiring() {
	console.log("--- Demo 4: Canonical Wiring (Screenpipe -> Bus -> Store -> Suggestion) ---\n");

	const store = createStore({ engine: "zvec", dbPath: ":memory:" });
	await store.init();

	const bus = new EnhancementBus("canonical-demo");

	const screenpipe = createScreenpipe({
		workspace: "canonical-demo",
		sessionId: "canonical-session",
		bus,
		store,
		autoPersist: true,
	});

	let chunksViaBus = 0;
	bus.subscribe("screenshot", async (chunk: RawChunk) => {
		chunksViaBus++;
		console.log(`  [Bus] Captured screenshot from ${chunk.metadata?.windowTitle ?? "unknown"}`);
	});

	console.log("Step 1: Simulating screen capture pipeline");
	const mockScreenshot: RawChunk = {
		kind: "raw",
		source: "screenpipe",
		workspace: "canonical-demo",
		sessionId: "canonical-session",
		contentType: "screenshot",
		data: Buffer.from("screenshot-data-base64"),
		timestamp: Date.now(),
		generation: 0,
		metadata: { windowTitle: "Browser - Documentation" },
	};

	bus.publish(mockScreenshot);

	console.log("\nStep 2: Attaching static document");
	const docChunk: ContextChunk = {
		kind: "context",
		id: `doc-${Date.now()}`,
		source: "document",
		workspace: "canonical-demo",
		sessionId: "canonical-session",
		content: "React useState hook: const [state, setState] = useState(initialValue). Returns a stateful value and a function to update it.",
		contentType: "document",
		timestamp: Date.now() - 5000,
		generation: 0,
		metadata: { source: "react-docs" },
	};
	await store.store(docChunk);

	console.log("\nStep 3: Querying for context");
	const queryResults = await store.query("useState hook", {});
	console.log(`  Found ${queryResults.length} relevant chunks`);
	for (const result of queryResults) {
		console.log(`    [${result.source}] ${result.content.slice(0, 60)}...`);
	}

	console.log("\nStep 4: Generating simple suggestion");
	if (queryResults.length > 0) {
		const topMatch = queryResults[0];
		console.log(`  Based on: "${topMatch.content.slice(0, 50)}..."`);
		console.log(`  Suggestion: Consider using useState to manage component state`);
	}

	console.log(`\n  Chunks captured via bus: ${chunksViaBus}`);
	console.log(`  Store chunks: ${(await store.scan("", {})).chunks.length}`);

	store.close();
	console.log("\n✓ Canonical wiring demo complete\n");
}

await demoBasicLifecycle();
await demoBusIntegration();
await demoStoreIntegration();
await demoCanonicalWiring();

console.log("=== All Screenpipe Demos Complete ===");
console.log("\nNote: Actual screenpipe recording requires screenpipe daemon running.");
console.log("These demos show the API and integration patterns.");
