import { describe, expect, test } from "bun:test";
import {
	PluginRegistry,
	UnknownStepKindError,
	DuplicateHandlerError,
	type StepHandler,
} from "../src/plugin-registry.js";
import type { RecipeStep, StepExecutionContext, ContextChunk } from "../src/types.js";

describe("PluginRegistry", () => {
	const mockHandler: StepHandler = async () => [];
	const mockStep: RecipeStep = {
		id: "test-step",
		kind: "gather",
		instruction: "test",
	};
	const mockContext: StepExecutionContext = {
		workspace: "test-ws",
		sessionId: "test-session",
		bus: {} as any,
		store: {} as any,
		aiProvider: {} as any,
		fabric: {} as any,
		variables: {},
		metadata: {},
	};

	test("should register and retrieve handler", () => {
		const registry = new PluginRegistry();
		registry.register("gather", mockHandler);
		expect(registry.has("gather")).toBe(true);
		expect(registry.get("gather")).toBe(mockHandler);
	});

	test("should throw DuplicateHandlerError for duplicate registration", () => {
		const registry = new PluginRegistry();
		registry.register("gather", mockHandler);
		expect(() => registry.register("gather", mockHandler)).toThrow(
			DuplicateHandlerError
		);
	});

	test("should throw UnknownStepKindError for unregistered kind", () => {
		const registry = new PluginRegistry();
		expect(() => registry.get("custom")).toThrow(UnknownStepKindError);
	});

	test("should allow override for extending built-ins", () => {
		const registry = new PluginRegistry();
		const customHandler: StepHandler = async () => [
			{
				kind: "context",
				id: "custom",
				workspace: "test",
				sessionId: "test",
				contentType: "text",
				content: "custom",
				timestamp: Date.now(),
				generation: 0,
			},
		];

		registry.register("gather", mockHandler);
		registry.override("gather", customHandler);
		expect(registry.get("gather")).toBe(customHandler);
	});

	test("should list registered handlers", () => {
		const registry = new PluginRegistry();
		registry.register("gather", mockHandler);
		registry.register("custom1", mockHandler);
		registry.register("custom2", mockHandler);

		const list = registry.list();
		expect(list).toContain("gather");
		expect(list).toContain("custom1");
		expect(list).toContain("custom2");
		expect(list.length).toBe(3);
	});

	test("should identify built-in kinds", () => {
		const registry = new PluginRegistry();
		expect(registry.isBuiltIn("gather")).toBe(true);
		expect(registry.isBuiltIn("synthesize")).toBe(true);
		expect(registry.isBuiltIn("custom")).toBe(false);
	});

	test("handler should be callable", async () => {
		const registry = new PluginRegistry();
		const mockResult: ContextChunk[] = [
			{
				kind: "context",
				id: "result",
				workspace: "test",
				sessionId: "test",
				contentType: "text",
				content: "result",
				timestamp: Date.now(),
				generation: 0,
			},
		];

		const handler: StepHandler = async () => mockResult;
		registry.register("test", handler);

		const retrieved = registry.get("test");
		const result = await retrieved(mockStep, [], mockContext);
		expect(result).toEqual(mockResult);
	});
});
