import { describe, it, expect, beforeEach } from "bun:test";
import {
	FabricTransformer,
	createFabricTransformer,
	getDefaultPatterns,
	getPatternsByCategory,
	type FabricPattern,
	type FabricOptions,
} from "../src/index.js";
import type { ContextChunk } from "@enhancement/types";

function makeChunk(overrides: Partial<ContextChunk> = {}): ContextChunk {
	return {
		kind: "context",
		id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		source: "test",
		workspace: "test-ws",
		sessionId: "test-session",
		content: "This is a test document with some sample content for fabric patterns.",
		contentType: "text",
		timestamp: Date.now(),
		generation: 0,
		...overrides,
	};
}

describe("FabricTransformer", () => {
	let transformer: FabricTransformer;

	beforeEach(() => {
		const options: FabricOptions = {
			available: false,
			model: "gpt-4",
			temperature: 0.7,
		};
		transformer = createFabricTransformer(options);
	});

	describe("pattern management", () => {
		it("should create transformer with default patterns", () => {
			const patterns = transformer.getAllPatterns();
			expect(patterns.length).toBeGreaterThan(0);
		});

		it("should get pattern by name", () => {
			const pattern = transformer.getPattern("summarize");
			expect(pattern).toBeDefined();
			expect(pattern?.name).toBe("summarize");
		});

		it("should return undefined for unknown pattern", () => {
			const pattern = transformer.getPattern("unknown-pattern");
			expect(pattern).toBeUndefined();
		});

		it("should list pattern names", () => {
			const names = transformer.listPatternNames();
			expect(names).toContain("summarize");
			expect(names).toContain("extract_wisdom");
			expect(names).toContain("key_points");
		});

		it("should register custom pattern", () => {
			const customPattern: FabricPattern = {
				name: "custom_pattern",
				description: "A custom pattern",
				prompt: "Process {{input}} with custom logic",
				category: "custom",
			};

			transformer.registerPattern(customPattern);
			const retrieved = transformer.getPattern("custom_pattern");
			expect(retrieved).toBeDefined();
			expect(retrieved?.description).toBe("A custom pattern");
		});

		it("should unregister pattern", () => {
			transformer.registerPattern({
				name: "temp_pattern",
				description: "Temporary",
				prompt: "{{input}}",
				category: "custom",
			});

			expect(transformer.getPattern("temp_pattern")).toBeDefined();
			const removed = transformer.unregisterPattern("temp_pattern");
			expect(removed).toBe(true);
			expect(transformer.getPattern("temp_pattern")).toBeUndefined();
		});

		it("should get patterns by category", () => {
			const summarizePatterns = transformer.getPatternsByCategory("summarize");
			expect(summarizePatterns.length).toBeGreaterThan(0);
			expect(summarizePatterns.every((p) => p.category === "summarize")).toBe(true);
		});
	});

	describe("pattern execution", () => {
		it("should run pattern and return simulated result when unavailable", async () => {
			const result = await transformer.runPattern("summarize", "Test content");

			expect(result.success).toBe(true);
			expect(result.pattern).toBe("summarize");
			expect(result.output).toContain("Simulated");
		});

		it("should return error for unknown pattern", async () => {
			const result = await transformer.runPattern("nonexistent", "Test content");

			expect(result.success).toBe(false);
			expect(result.error).toContain("not found");
		});

		it("should return error when fabric unavailable", async () => {
			const result = await transformer.runPattern("summarize", "Test content");

			expect(result.success).toBe(true);
			expect(result.output).toBeDefined();
		});

		it("should handle variables in prompt", async () => {
			const result = await transformer.runPattern("summarize", "Test content", {
				author: "Test Author",
			});

			expect(result.success).toBe(true);
		});
	});

	describe("chunk transformation", () => {
		it("should transform single chunk", async () => {
			const chunk = makeChunk();
			const result = await transformer.transformChunk(chunk, "summarize");

			expect(result.result.success).toBe(true);
			expect(result.chunks.length).toBe(1);
			expect(result.chunks[0].id).toBe(`fabric-${chunk.id}`);
			expect(result.chunks[0].source).toBe("fabric:summarize");
			expect(result.chunks[0].transform).toBe("summarize");
		});

		it("should preserve chunk metadata", async () => {
			const chunk = makeChunk({ metadata: { custom: "value" } });
			const result = await transformer.transformChunk(chunk, "summarize");

			expect(result.chunks[0].metadata?.custom).toBe("value");
			expect(result.chunks[0].metadata?.fabricPattern).toBe("summarize");
		});

		it("should transform multiple chunks", async () => {
			const chunks = [
				makeChunk({ content: "First chunk" }),
				makeChunk({ content: "Second chunk" }),
				makeChunk({ content: "Third chunk" }),
			];

			const results = await transformer.transformChunks(chunks, "summarize");

			expect(results.length).toBe(3);
			expect(results.every((r) => r.result.success)).toBe(true);
			expect(results.every((r) => r.chunks.length === 1)).toBe(true);
		});

		it("should handle batch transformation", async () => {
			const chunks = Array.from({ length: 10 }, (_, i) =>
				makeChunk({ content: `Chunk ${i}` })
			);

			const results = await transformer.transformChunks(chunks, "summarize", {
				batchSize: 3,
			});

			expect(results.length).toBe(10);
		});
	});

	describe("availability", () => {
		it("should report unavailable by default", () => {
			expect(transformer.isAvailable()).toBe(false);
		});

		it("should update options", () => {
			transformer.updateOptions({ available: true });
			expect(transformer.isAvailable()).toBe(true);
		});
	});
});

describe("Default patterns", () => {
	it("should have default patterns", () => {
		const patterns = getDefaultPatterns();
		expect(patterns.length).toBeGreaterThan(0);
	});

	it("should have summarize patterns", () => {
		const patterns = getPatternsByCategory("summarize");
		expect(patterns.length).toBeGreaterThan(0);
		expect(patterns.some((p) => p.name === "summarize")).toBe(true);
	});

	it("should have extract patterns", () => {
		const patterns = getPatternsByCategory("extract");
		expect(patterns.length).toBeGreaterThan(0);
	});

	it("should have analyze patterns", () => {
		const patterns = getPatternsByCategory("analyze");
		expect(patterns.length).toBeGreaterThan(0);
	});

	it("should have convert patterns", () => {
		const patterns = getPatternsByCategory("convert");
		expect(patterns.length).toBeGreaterThan(0);
	});

	it("should have improve patterns", () => {
		const patterns = getPatternsByCategory("improve");
		expect(patterns.length).toBeGreaterThan(0);
	});
});

describe("createFabricTransformer", () => {
	it("should create transformer with options", () => {
		const transformer = createFabricTransformer({
			available: true,
			model: "gpt-4",
		});

		expect(transformer).toBeDefined();
		expect(transformer.isAvailable()).toBe(true);
	});

	it("should create transformer with custom patterns", () => {
		const transformer = createFabricTransformer(
			{ available: false },
			undefined,
			undefined
		);

		transformer.registerPattern({
			name: "my_pattern",
			description: "My custom pattern",
			prompt: "Process {{input}}",
			category: "custom",
		});

		expect(transformer.getPattern("my_pattern")).toBeDefined();
	});
});
