/**
 * Integration Test: Fabric + Recipe
 *
 * Tests the integration between fabric patterns and recipe execution.
 */

import { expect, test, describe, beforeEach } from "bun:test";
import {
  FabricTransformer,
  createFabricTransformer,
  getDefaultPatterns,
  getPatternsByCategory,
} from "@enhancement/fabric";
import { RecipeExecutor, createRecipeExecutor } from "@enhancement/recipe";
import type { Recipe, RecipeStep, ContextChunk } from "@enhancement/recipe";

describe("Fabric + Recipe Integration", () => {
  let fabric: FabricTransformer;
  let executor: RecipeExecutor;

  beforeEach(() => {
    fabric = createFabricTransformer({
      available: true,
      model: "gpt-4",
      temperature: 0.7,
    });

    executor = createRecipeExecutor();
  });

  test("should create fabric transformer with patterns", () => {
    expect(fabric).toBeDefined();

    const patterns = fabric.getAllPatterns();
    expect(patterns.length).toBeGreaterThan(0);

    const names = fabric.listPatternNames();
    expect(names).toContain("summarize");
    expect(names).toContain("extract_wisdom");
    expect(names).toContain("key_points");
  });

  test("should get patterns by category", () => {
    const summarizePatterns = fabric.getPatternsByCategory("summarize");
    expect(summarizePatterns.length).toBeGreaterThan(0);

    const extractPatterns = fabric.getPatternsByCategory("extract");
    expect(extractPatterns.length).toBeGreaterThan(0);

    const analyzePatterns = fabric.getPatternsByCategory("analyze");
    expect(analyzePatterns.length).toBeGreaterThan(0);
  });

  test("should get default patterns", () => {
    const patterns = getDefaultPatterns();
    expect(patterns.length).toBeGreaterThan(0);

    const patternNames = patterns.map((p) => p.name);
    expect(patternNames).toContain("summarize");
    expect(patternNames).toContain("key_points");
    expect(patternNames).toContain("analyze_sentiment");
  });

  test("should run a fabric pattern", async () => {
    const result = await fabric.runPattern("summarize", "This is a long text that needs to be summarized. It contains multiple sentences and ideas.");

    expect(result.success).toBe(true);
    expect(result.pattern).toBe("summarize");
    expect(result.output).toBeDefined();
  });

  test("should handle unknown pattern", async () => {
    const result = await fabric.runPattern("unknown_pattern", "Some text");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  test("should handle unavailable fabric", async () => {
    const unavailableFabric = createFabricTransformer({
      available: false,
    });

    const result = await unavailableFabric.runPattern("summarize", "Text");

    expect(result.success).toBe(true);
    expect(result.output).toContain("Simulated");
  });

  test("should transform a chunk with fabric pattern", async () => {
    const chunk: ContextChunk = {
      kind: "context",
      id: "chunk-1",
      source: "document",
      workspace: "test-workspace",
      sessionId: "test-session",
      content: "This is a long document with many details that need summarization.",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    };

    const result = await fabric.transformChunk(chunk, "summarize");

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].id).toBe("fabric-chunk-1");
    expect(result.chunks[0].source).toBe("fabric:summarize");
    expect(result.chunks[0].transform).toBe("summarize");
    expect(result.result.success).toBe(true);
  });

  test("should transform multiple chunks", async () => {
    const chunks: ContextChunk[] = [
      {
        kind: "context",
        id: "chunk-1",
        source: "doc1",
        workspace: "test-workspace",
        sessionId: "test-session",
        content: "First document content.",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
      {
        kind: "context",
        id: "chunk-2",
        source: "doc2",
        workspace: "test-workspace",
        sessionId: "test-session",
        content: "Second document content.",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
      {
        kind: "context",
        id: "chunk-3",
        source: "doc3",
        workspace: "test-workspace",
        sessionId: "test-session",
        content: "Third document content.",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
    ];

    const results = await fabric.transformChunks(chunks, "summarize", {
      batchSize: 2,
    });

    expect(results).toHaveLength(3);
    expect(results[0].chunks[0].source).toBe("fabric:summarize");
    expect(results[1].chunks[0].source).toBe("fabric:summarize");
    expect(results[2].chunks[0].source).toBe("fabric:summarize");
  });

  test("should register custom pattern", () => {
    fabric.registerPattern({
      name: "custom_extract",
      description: "Extract custom information",
      prompt: "Extract key dates from:\n\n{{input}}",
      category: "extract",
    });

    const pattern = fabric.getPattern("custom_extract");
    expect(pattern).toBeDefined();
    expect(pattern?.name).toBe("custom_extract");
    expect(pattern?.category).toBe("extract");
  });

  test("should unregister pattern", () => {
    const unregistered = fabric.unregisterPattern("summarize");
    expect(unregistered).toBe(true);

    const pattern = fabric.getPattern("summarize");
    expect(pattern).toBeUndefined();

    // Unregistering again should return false
    expect(fabric.unregisterPattern("summarize")).toBe(false);
  });

  test("should run pattern with variables", async () => {
    fabric.registerPattern({
      name: "template_test",
      description: "Test template variables",
      prompt: "Process {{input}} with param1={{param1}} and param2={{param2}}",
      category: "custom",
    });

    const result = await fabric.runPattern(
      "template_test",
      "my input text",
      {
        param1: "value1",
        param2: "value2",
      }
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("param1=value1");
    expect(result.output).toContain("param2=value2");
    expect(result.output).toContain("my input text");
  });

  test("should integrate fabric as recipe handler", async () => {
    const recipe: Recipe = {
      id: "fabric-recipe",
      workspace: "test-workspace",
      name: "Fabric Transform Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "step-1",
          kind: "fabric_summarize",
          label: "Summarize Content",
          description: "Summarize the input content",
          config: { pattern: "summarize" },
          trigger: { type: "manual" },
          enabled: true,
        } as RecipeStep,
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Register fabric handler
    executor.registerHandler("fabric_summarize", async (step, input) => {
      const results: ContextChunk[] = [];

      for (const chunk of input) {
        const transform = await fabric.transformChunk(
          chunk as ContextChunk,
          step.config.pattern as string
        );
        results.push(...transform.chunks);
      }

      return results;
    });

    const input: ContextChunk[] = [
      {
        kind: "context",
        id: "input-1",
        source: "document",
        workspace: "test-workspace",
        sessionId: "test-session",
        content: "This is a long document that needs to be summarized by the fabric pattern.",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
    ];

    const run = await executor.runRecipe(recipe, input);

    expect(run).toBeDefined();
    expect(run.recipeId).toBe("fabric-recipe");
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0].status).toBe("completed");
  });

  test("should chain multiple fabric patterns in recipe", async () => {
    const recipe: Recipe = {
      id: "fabric-chain-recipe",
      workspace: "test-workspace",
      name: "Chained Fabric Patterns",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "step-1",
          kind: "fabric_summarize",
          label: "Summarize",
          description: "Summarize content",
          config: { pattern: "summarize" },
          trigger: { type: "manual" },
          enabled: true,
        },
        {
          id: "step-2",
          kind: "fabric_extract",
          label: "Extract Wisdom",
          description: "Extract wisdom from summary",
          config: { pattern: "extract_wisdom" },
          trigger: { type: "auto" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Register handlers
    executor.registerHandler("fabric_summarize", async (_step, input) => {
      return await Promise.all(
        input.map(async (chunk) => {
          const result = await fabric.transformChunk(
            chunk as ContextChunk,
            "summarize"
          );
          return result.chunks[0];
        })
      );
    });

    executor.registerHandler("fabric_extract", async (_step, input) => {
      return await Promise.all(
        input.map(async (chunk) => {
          const result = await fabric.transformChunk(
            chunk as ContextChunk,
            "extract_wisdom"
          );
          return result.chunks[0];
        })
      );
    });

    const input: ContextChunk[] = [
      {
        kind: "context",
        id: "input-1",
        source: "document",
        workspace: "test-workspace",
        sessionId: "test-session",
        content: "This document contains deep insights and wisdom that should be extracted.",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
    ];

    const run = await executor.runRecipe(recipe, input);

    expect(run.steps).toHaveLength(2);
    expect(run.steps[0].status).toBe("completed");
    expect(run.steps[1].status).toBe("completed");
  });

  test("should handle fabric error in recipe", async () => {
    const recipe: Recipe = {
      id: "fabric-error-recipe",
      workspace: "test-workspace",
      name: "Fabric Error Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "step-1",
          kind: "fabric_unknown",
          label: "Unknown Pattern",
          description: "This pattern doesn't exist",
          config: { pattern: "nonexistent_pattern" },
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Register handler that uses nonexistent pattern
    executor.registerHandler("fabric_unknown", async (step, input) => {
      const results: ContextChunk[] = [];

      for (const chunk of input) {
        const transform = await fabric.transformChunk(
          chunk as ContextChunk,
          step.config.pattern as string
        );

        if (!transform.result.success) {
          throw new Error(transform.result.error);
        }

        results.push(...transform.chunks);
      }

      return results;
    });

    const input: ContextChunk[] = [
      {
        kind: "context",
        id: "input-1",
        source: "document",
        workspace: "test-workspace",
        sessionId: "test-session",
        content: "Test content",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
    ];

    const run = await executor.runRecipe(recipe, input);
    expect(run.steps[0].status).toBe("failed");
    expect(run.steps[0].error).toContain("not found");
  });

  test("should update fabric options", () => {
    expect(fabric.isAvailable()).toBe(true);

    fabric.updateOptions({
      available: false,
      model: "gpt-3.5-turbo",
      temperature: 0.5,
    });

    expect(fabric.isAvailable()).toBe(false);
  });

  test("should handle different fabric categories", async () => {
    const testContent = "This is a test document for processing.";

    // Test each category has at least one pattern
    const categories = ["summarize", "extract", "analyze", "write", "review", "convert", "improve"] as const;

    for (const category of categories) {
      const patterns = fabric.getPatternsByCategory(category);
      if (patterns.length > 0) {
        const result = await fabric.runPattern(patterns[0].name, testContent);
        expect(result.success).toBe(true);
      }
    }
  });
});

describe("Fabric + Recipe Advanced Integration", () => {
  test("should use fabric in computation graph", async () => {
    const { createComputationGraph, createMergeNode } = await import(
      "@enhancement/recipe"
    );

    const fabric1 = createFabricTransformer({
      available: true,
      model: "gpt-4",
    });

    const graph = createComputationGraph();

    // Create a node that uses fabric
    graph.addNode({
      id: "fabric-node",
      kind: "transform",
      execute: async (chunks) => {
        const results: ContextChunk[] = [];
        for (const chunk of chunks) {
          const result = await fabric1.transformChunk(chunk, "summarize");
          results.push(...result.chunks);
        }
        return results;
      },
    });

    const input: ContextChunk[] = [
      {
        kind: "context",
        id: "input-1",
        source: "doc",
        workspace: "test",
        sessionId: "test",
        content: "Long content to summarize.",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
    ];

    const result = await graph.execute("fabric-node", input);
    expect(result).toHaveLength(1);
    expect(result[0].transform).toBe("summarize");
  });

  test("should batch process with fabric in recipe", async () => {
    const fabric = createFabricTransformer({
      available: true,
      model: "gpt-4",
    });

    const executor = createRecipeExecutor();

    executor.registerHandler("fabric_batch", async (_step, input) => {
      const results = await fabric.transformChunks(
        input as ContextChunk[],
        "key_points",
        { batchSize: 2 }
      );
      return results.flatMap((r) => r.chunks);
    });

    const recipe: Recipe = {
      id: "batch-recipe",
      workspace: "test",
      name: "Batch Fabric Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "step-1",
          kind: "fabric_batch",
          label: "Batch Key Points",
          description: "Extract key points from all documents",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const input: ContextChunk[] = Array.from({ length: 5 }, (_, i) => ({
      kind: "context" as const,
      id: `input-${i}`,
      source: "batch-doc",
      workspace: "test",
      sessionId: "test",
      content: `Document ${i} content with key points to extract.`,
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    }));

    const run = await executor.runRecipe(recipe, input);

    expect(run.steps[0].status).toBe("completed");
    expect(run.outputChunks).toHaveLength(5);
  });

  test("should handle fabric metadata in chunks", async () => {
    const fabric = createFabricTransformer({
      available: true,
      model: "gpt-4",
    });

    const chunk: ContextChunk = {
      kind: "context",
      id: "input-1",
      source: "document",
      workspace: "test-workspace",
      sessionId: "test-session",
      content: "Content for analysis.",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    };

    const result = await fabric.transformChunk(chunk, "analyze_sentiment");

    expect(result.chunks[0].metadata).toBeDefined();
    expect(result.chunks[0].metadata?.fabricPattern).toBe("analyze_sentiment");
    expect(result.chunks[0].metadata?.fabricResult).toBe(true);
  });

  test("should skip disabled fabric steps in recipe", async () => {
    const executor = createRecipeExecutor();

    executor.registerHandler("fabric_step", async () => {
      throw new Error("Should not be called");
    });

    const recipe: Recipe = {
      id: "disabled-recipe",
      workspace: "test",
      name: "Disabled Fabric Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "step-1",
          kind: "identity",
          label: "Pass Through",
          description: "Pass through",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
        {
          id: "step-2",
          kind: "fabric_step",
          label: "Disabled Step",
          description: "This step is disabled",
          config: {},
          trigger: { type: "auto" },
          enabled: false,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    executor.registerHandler("identity", async (_step, input) => input);

    const input: ContextChunk[] = [
      {
        kind: "context",
        id: "input-1",
        source: "test",
        workspace: "test",
        sessionId: "test",
        content: "Test",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
    ];

    const run = await executor.runRecipe(recipe, input);

    expect(run.steps).toHaveLength(2);
    expect(run.steps[0].status).toBe("completed");
    expect(run.steps[1].status).toBe("skipped");
  });

  test("should preserve chunk metadata through fabric transform", async () => {
    const fabric = createFabricTransformer({
      available: true,
    });

    const chunk: ContextChunk = {
      kind: "context",
      id: "input-1",
      source: "important-document",
      workspace: "test-workspace",
      sessionId: "test-session",
      content: "Important content to summarize.",
      contentType: "text/plain",
      timestamp: 1234567890,
      generation: 2,
      metadata: {
        originalKey: "originalValue",
        priority: "high",
      },
    };

    const result = await fabric.transformChunk(chunk, "summarize");

    expect(result.chunks[0].source).toBe("fabric:summarize");
    expect(result.chunks[0].metadata?.originalKey).toBe("originalValue");
    expect(result.chunks[0].metadata?.priority).toBe("high");
    expect(result.chunks[0].metadata?.fabricPattern).toBe("summarize");
  });

  test("should support conditional fabric steps", async () => {
    const executor = createRecipeExecutor();
    const fabric = createFabricTransformer({ available: true });

    let conditionalExecuted = false;

    executor.registerHandler("fabric_conditional", async (step, input) => {
      // Only run if content is long enough
      if (step.config.minLength && input[0].content.length < step.config.minLength) {
        conditionalExecuted = false;
        return input;
      }

      conditionalExecuted = true;
      const result = await fabric.transformChunk(
        input[0] as ContextChunk,
        step.config.pattern as string
      );
      return result.chunks;
    });

    executor.registerHandler("identity", async (_step, input) => input);

    const recipe: Recipe = {
      id: "conditional-recipe",
      workspace: "test",
      name: "Conditional Fabric Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "step-1",
          kind: "fabric_conditional",
          label: "Conditional Summarize",
          description: "Summarize only if content is long",
          config: { pattern: "summarize", minLength: 50 },
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Short content - should skip
    const shortInput: ContextChunk[] = [
      {
        kind: "context",
        id: "short",
        source: "test",
        workspace: "test",
        sessionId: "test",
        content: "Short.",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
    ];

    await executor.runRecipe(recipe, shortInput);
    expect(conditionalExecuted).toBe(false);

    // Long content - should execute
    const longInput: ContextChunk[] = [
      {
        kind: "context",
        id: "long",
        source: "test",
        workspace: "test",
        sessionId: "test",
        content: "This is a much longer piece of content that should trigger the conditional fabric step execution.",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
    ];

    await executor.runRecipe(recipe, longInput);
    expect(conditionalExecuted).toBe(true);
  });
});
