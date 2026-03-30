/**
 * Integration Test: Store + Recipe
 *
 * Tests the integration between vector store and recipe execution.
 */

import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { EnhancementStore, createStore, createSessionStore } from "@enhancement/store";
import { RecipeExecutor, createRecipeExecutor } from "@enhancement/recipe";
import type { Recipe, ContextChunk } from "@enhancement/recipe";

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

describe("Store + Recipe Integration", () => {
  let store: EnhancementStore;
  let executor: RecipeExecutor;
  const workspace = "test-workspace";

  beforeEach(async () => {
    store = createStore({
      engine: "zvec",
      dbPath: ":memory:",
    });
    await store.init();

    executor = createRecipeExecutor();

    // Register store-aware handlers
    executor.registerHandler("store_query", async (step, _input, context) => {
      const query = step.config.query as string;
      const results = await store.query(query, {
        workspace: context.workspace,
      }, (step.config.limit as number) || 10);
      return results;
    });

    executor.registerHandler("store_save", async (_step, input, context) => {
      for (const chunk of input) {
        await store.store({
          ...chunk,
          workspace: context.workspace,
          sessionId: context.sessionId,
        });
      }
      return input;
    });

    executor.registerHandler("store_forget", async (step, _input, context) => {
      await store.forget({
        workspace: context.workspace,
        ...(step.config.filter as Record<string, unknown> || {}),
      });
      return [];
    });
  });

  afterEach(async () => {
    await store.close();
  });

  test("should query store in recipe step", async () => {
    // Pre-populate store
    await store.store({
      kind: "context",
      id: generateId(),
      source: "test",
      workspace,
      sessionId: "session-1",
      content: "Machine learning is a subset of artificial intelligence",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    });

    const recipe: Recipe = {
      id: "query-recipe",
      workspace,
      name: "Query Store Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "query-step",
          kind: "store_query",
          label: "Query ML Content",
          config: { query: "machine learning", limit: 5 },
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const run = await executor.runRecipe(recipe, []);

    expect(run.steps[0].status).toBe("completed");
    expect(run.outputChunks?.length).toBeGreaterThan(0);
    // Case-insensitive check
    expect(run.outputChunks![0].content.toLowerCase()).toContain("machine learning");
  });

  test("should save recipe output to store", async () => {
    const recipe: Recipe = {
      id: "save-recipe",
      workspace,
      name: "Save to Store Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "create-step",
          kind: "create",
          label: "Create Content",
          config: { outputType: "document" },
          trigger: { type: "manual" },
          enabled: true,
        },
        {
          id: "save-step",
          kind: "store_save",
          label: "Save to Store",
          config: {},
          trigger: { type: "auto" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const run = await executor.runRecipe(recipe, []);

    expect(run.steps[0].status).toBe("completed");
    expect(run.steps[1].status).toBe("completed");

    // Verify stored in database
    const stored = await store.query("Created", { workspace }, 10);
    expect(stored.length).toBeGreaterThan(0);
  });

  test("should chain query -> process -> save", async () => {
    // Pre-populate with source data
    await store.store({
      kind: "context",
      id: generateId(),
      source: "raw-data",
      workspace,
      sessionId: "session-1",
      content: "Raw sensor data: temperature=72.5, humidity=45%",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    });

    executor.registerHandler("process", async (_step, input) => {
      return input.map(chunk => ({
        ...chunk,
        id: `processed-${chunk.id}`,
        content: `PROCESSED: ${chunk.content}`,
        metadata: { ...chunk.metadata, processed: true },
      }));
    });

    const recipe: Recipe = {
      id: "pipeline-recipe",
      workspace,
      name: "Data Pipeline",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "fetch",
          kind: "store_query",
          label: "Fetch Raw Data",
          config: { query: "sensor data", limit: 10 },
          trigger: { type: "manual" },
          enabled: true,
        },
        {
          id: "transform",
          kind: "process",
          label: "Process Data",
          config: {},
          trigger: { type: "auto" },
          enabled: true,
        },
        {
          id: "persist",
          kind: "store_save",
          label: "Save Processed",
          config: {},
          trigger: { type: "auto" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const run = await executor.runRecipe(recipe, []);

    expect(run.steps.every(s => s.status === "completed")).toBe(true);

    // Verify processed data stored
    const processed = await store.query("PROCESSED", { workspace }, 10);
    expect(processed.length).toBeGreaterThan(0);
    expect(processed[0].metadata?.processed).toBe(true);
  });

  test("should handle store query with no results", async () => {
    const recipe: Recipe = {
      id: "empty-query-recipe",
      workspace,
      name: "Empty Query Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "query",
          kind: "store_query",
          label: "Query Nonexistent",
          config: { query: "xyz123nonexistent", limit: 5 },
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const run = await executor.runRecipe(recipe, []);

    expect(run.steps[0].status).toBe("completed");
    expect(run.outputChunks).toHaveLength(0);
  });

  test("should forget data via recipe step", async () => {
    // Store then forget
    await store.store({
      kind: "context",
      id: generateId(),
      source: "temp",
      workspace,
      sessionId: "session-1",
      content: "Temporary data to delete",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    });

    const recipe: Recipe = {
      id: "cleanup-recipe",
      workspace,
      name: "Cleanup Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "cleanup",
          kind: "store_forget",
          label: "Cleanup Old Data",
          config: { filter: { source: "temp" } },
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const run = await executor.runRecipe(recipe, []);

    expect(run.steps[0].status).toBe("completed");

    // Verify deleted
    const results = await store.query("Temporary data", { workspace }, 10);
    expect(results).toHaveLength(0);
  });

  test("should use session store isolation in recipe", async () => {
    const sessionId = generateId();

    executor.registerHandler("session_save", async (_step, input) => {
      for (const chunk of input) {
        await store.store(chunk);
      }
      return input;
    });

    // Store in specific session
    const chunk: ContextChunk = {
      kind: "context",
      id: generateId(),
      source: "session-test",
      workspace,
      sessionId,
      content: "Session-specific content",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    };

    const recipe: Recipe = {
      id: "session-recipe",
      workspace,
      name: "Session Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "save",
          kind: "session_save",
          label: "Save to Session",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const run = await executor.runRecipe(recipe, [chunk]);

    expect(run.steps[0].status).toBe("completed");

    // Query by session should find it
    const sessionResults = await store.query("Session-specific content", { workspace, sessionId }, 10);
    expect(sessionResults.length).toBeGreaterThan(0);
  });
});

describe("Store + Recipe Advanced Scenarios", () => {
  test("should implement RAG pipeline: retrieve -> augment -> generate", async () => {
    const store = createStore({
      engine: "zvec",
      dbPath: ":memory:",
    });
    await store.init();

    // Seed knowledge base
    const knowledgeBase = [
      "The capital of France is Paris.",
      "Paris is known for the Eiffel Tower.",
      "France is in Western Europe.",
    ];

    for (const fact of knowledgeBase) {
      await store.store({
        kind: "context",
        id: generateId(),
        source: "knowledge-base",
        workspace: "rag-workspace",
        sessionId: "rag-session",
        content: fact,
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      });
    }

    const executor = createRecipeExecutor();

    // RAG: Retrieve
    executor.registerHandler("rag_retrieve", async (_step, input) => {
      const query = input[0]?.content || "";
      const docs = await store.query(query, {
        workspace: "rag-workspace",
      }, 3);
      return docs;
    });

    // RAG: Augment (combine query with context)
    executor.registerHandler("rag_augment", async (_step, input) => {
      const query = input.find(c => c.source === "user-query")?.content || "";
      const context = input
        .filter(c => c.source === "knowledge-base")
        .map(c => c.content)
        .join("\n");

      const augmented: ContextChunk = {
        kind: "context",
        id: generateId(),
        source: "rag-augmented",
        workspace: "rag-workspace",
        sessionId: "rag-session",
        content: `Query: ${query}\n\nContext:\n${context}`,
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      };
      return [augmented];
    });

    // RAG: Generate (simulated)
    executor.registerHandler("rag_generate", async (_step, input) => {
      const augmented = input[0];
      const response: ContextChunk = {
        ...augmented,
        id: generateId(),
        source: "rag-response",
        content: `Based on the context provided: ${augmented.content.slice(0, 100)}...`,
      };
      return [response];
    });

    const recipe: Recipe = {
      id: "rag-pipeline",
      workspace: "rag-workspace",
      name: "RAG Pipeline",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "retrieve",
          kind: "rag_retrieve",
          label: "Retrieve Documents",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
        {
          id: "augment",
          kind: "rag_augment",
          label: "Augment Query",
          config: {},
          trigger: { type: "auto" },
          enabled: true,
        },
        {
          id: "generate",
          kind: "rag_generate",
          label: "Generate Response",
          config: {},
          trigger: { type: "auto" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const userQuery: ContextChunk = {
      kind: "context",
      id: generateId(),
      source: "user-query",
      workspace: "rag-workspace",
      sessionId: "rag-session",
      content: "What is Paris known for?",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    };

    const run = await executor.runRecipe(recipe, [userQuery]);

    expect(run.steps.every(s => s.status === "completed")).toBe(true);
    expect(run.outputChunks?.length).toBe(1);
    expect(run.outputChunks![0].source).toBe("rag-response");

    await store.close();
  });

  test("should handle store errors gracefully in recipe", async () => {
    const store = createStore({
      engine: "zvec",
      dbPath: ":memory:",
    });
    await store.init();

    const executor = createRecipeExecutor();

    executor.registerHandler("failing_store_op", async () => {
      throw new Error("Database connection lost");
    });

    const recipe: Recipe = {
      id: "error-recipe",
      workspace: "error-workspace",
      name: "Error Handling Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "fail-step",
          kind: "failing_store_op",
          label: "Failing Operation",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const run = await executor.runRecipe(recipe, []);

    expect(run.steps[0].status).toBe("failed");
    expect(run.steps[0].error).toContain("Database connection lost");
    expect(run.status).toBe("failed");

    await store.close();
  });

  test("should batch process large datasets from store", async () => {
    const store = createStore({
      engine: "zvec",
      dbPath: ":memory:",
    });
    await store.init();

    // Seed with many chunks
    for (let i = 0; i < 50; i++) {
      await store.store({
        kind: "context",
        id: `batch-${i}`,
        source: "batch-source",
        workspace: "batch-workspace",
        sessionId: "batch-session",
        content: `Document ${i} content here`,
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      });
    }

    const executor = createRecipeExecutor();
    let processedCount = 0;

    executor.registerHandler("batch_process", async (_step, input) => {
      processedCount += input.length;
      return input.map(chunk => ({
        ...chunk,
        content: `PROCESSED: ${chunk.content}`,
      }));
    });

    // Scan all chunks
    const allChunks: ContextChunk[] = [];
    let cursor = "";
    do {
      const batch = await store.scan(cursor, { workspace: "batch-workspace" }, 100);
      allChunks.push(...batch.chunks);
      cursor = batch.nextCursor;
      if (batch.chunks.length === 0) break;
    } while (cursor && allChunks.length < 50);

    expect(allChunks.length).toBe(50);

    const recipe: Recipe = {
      id: "batch-recipe",
      workspace: "batch-workspace",
      name: "Batch Process Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "process-all",
          kind: "batch_process",
          label: "Process All Documents",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const run = await executor.runRecipe(recipe, allChunks);

    expect(run.steps[0].status).toBe("completed");
    expect(processedCount).toBe(50);
    expect(run.outputChunks).toHaveLength(50);

    await store.close();
  });
});
