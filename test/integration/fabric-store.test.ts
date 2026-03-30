/**
 * Integration Test: Fabric + Store
 *
 * Tests fabric pattern transformations with store persistence.
 */

import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { FabricTransformer, createFabricTransformer } from "@loomai/fabric";
import { EnhancementStore, createStore } from "@loomai/store";
import type { ContextChunk } from "@loomai/types";

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

describe("Fabric + Store Integration", () => {
  let fabric: FabricTransformer;
  let store: EnhancementStore;
  const workspace = "fabric-store-workspace";

  beforeEach(async () => {
    fabric = createFabricTransformer({
      available: true,
      model: "gpt-4",
      temperature: 0.7,
    });

    store = createStore({
      engine: "zvec",
      dbPath: ":memory:",
    });
    await store.init();
  });

  afterEach(async () => {
    await store.close();
  });

  test("should transform and store fabric output", async () => {
    const sourceChunk: ContextChunk = {
      kind: "context",
      id: generateId(),
      source: "document",
      workspace,
      sessionId: "test-session",
      content: "This is a long document that needs to be summarized by the fabric pattern.",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    };

    // Transform using fabric
    const transform = await fabric.transformChunk(sourceChunk, "summarize");
    expect(transform.result.success).toBe(true);

    // Store the transformed output
    for (const chunk of transform.chunks) {
      await store.store({
        ...chunk,
        workspace,
        sessionId: "test-session",
      });
    }

    // Verify stored with fabric metadata
    const stored = await store.query("summarized", { workspace }, 10);

    expect(stored.length).toBeGreaterThan(0);
    expect(stored[0].source).toContain("fabric");
    expect(stored[0].transform).toBe("summarize");
  });

  test("should retrieve from store, transform with fabric, and store result", async () => {
    // Seed store with raw data
    await store.store({
      kind: "context",
      id: generateId(),
      source: "raw-input",
      workspace,
      sessionId: "test-session",
      content: "The quick brown fox jumps over the lazy dog. This sentence contains all letters of the alphabet.",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    });

    // Retrieve
    const retrieved = await store.query("quick brown fox", { workspace }, 1);
    expect(retrieved.length).toBe(1);

    // Transform
    const transform = await fabric.transformChunk(retrieved[0], "extract_wisdom");
    expect(transform.result.success).toBe(true);

    // Store result
    for (const chunk of transform.chunks) {
      await store.store({
        ...chunk,
        workspace,
        sessionId: "test-session",
      });
    }

    // Verify transformation stored
    const results = await store.query("wisdom", { workspace }, 10);

    expect(results.some(r => r.source === "fabric:extract_wisdom")).toBe(true);
  });

  test("should batch transform store contents", async () => {
    // Seed multiple documents
    const documents = [
      "Document one: Introduction to machine learning concepts.",
      "Document two: Deep learning architectures explained.",
      "Document three: Natural language processing techniques.",
    ];

    for (const doc of documents) {
      await store.store({
        kind: "context",
        id: generateId(),
        source: "batch-input",
        workspace,
        sessionId: "test-session",
        content: doc,
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      });
    }

    // Retrieve all
    const allChunks: ContextChunk[] = [];
    let cursor = "";
    do {
      const batch = await store.scan(cursor, { workspace }, 10);
      allChunks.push(...batch.chunks);
      cursor = batch.nextCursor;
      if (batch.chunks.length === 0) break;
    } while (cursor);

    // Batch transform
    const transforms = await fabric.transformChunks(
      allChunks.filter(c => c.source === "batch-input"),
      "key_points",
      { batchSize: 2 }
    );

    // Store all results
    for (const transform of transforms) {
      for (const chunk of transform.chunks) {
        await store.store({
          ...chunk,
          workspace,
          sessionId: "test-session",
        });
      }
    }

    // Verify all transformed
    const results = await store.query("key points", { workspace }, 10);

    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  test("should query by fabric pattern metadata", async () => {
    // Store chunks from different fabric patterns
    const patterns = ["summarize", "extract_wisdom", "analyze_sentiment"];

    for (const pattern of patterns) {
      const sourceChunk: ContextChunk = {
        kind: "context",
        id: generateId(),
        source: "test",
        workspace,
        sessionId: "test-session",
        content: `Test content for ${pattern}`,
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      };

      const transform = await fabric.transformChunk(sourceChunk, pattern);

      for (const chunk of transform.chunks) {
        await store.store({
          ...chunk,
          workspace,
          sessionId: "test-session",
        });
      }
    }

    // Query all fabric outputs
    const allDocs: ContextChunk[] = [];
    let cursor = "";
    do {
      const batch = await store.scan(cursor, { workspace }, 100);
      allDocs.push(...batch.chunks);
      cursor = batch.nextCursor;
      if (batch.chunks.length === 0) break;
    } while (cursor);

    const fabricChunks = allDocs.filter(c => c.source?.startsWith("fabric:"));

    expect(fabricChunks.length).toBeGreaterThanOrEqual(3);

    // Group by pattern
    const byPattern = fabricChunks.reduce((acc, chunk) => {
      const pattern = chunk.transform || "unknown";
      acc[pattern] = (acc[pattern] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    expect(Object.keys(byPattern).length).toBeGreaterThanOrEqual(3);
  });

  test("should handle fabric error without corrupting store", async () => {
    const sourceChunk: ContextChunk = {
      kind: "context",
      id: generateId(),
      source: "test",
      workspace,
      sessionId: "test-session",
      content: "Test content",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    };

    // Try to use nonexistent pattern
    const transform = await fabric.transformChunk(sourceChunk, "nonexistent_pattern");

    // Should fail but not throw
    expect(transform.result.success).toBe(false);
    expect(transform.result.error).toContain("not found");

    // Store should still be healthy
    await store.store({
      kind: "context",
      id: generateId(),
      source: "health-check",
      workspace,
      sessionId: "test-session",
      content: "Store is still working",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    });

    const verify = await store.query("Store is still working", { workspace }, 1);
    expect(verify.length).toBe(1);
  });

  test("should maintain provenance chain through transformations", async () => {
    // Original document
    const original: ContextChunk = {
      kind: "context",
      id: generateId(),
      source: "user-upload",
      workspace,
      sessionId: "test-session",
      content: "Original user content that will be transformed multiple times.",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
      metadata: { originalId: "doc-123" },
    };

    await store.store({ ...original, workspace, sessionId: "test-session" });

    // First transformation: summarize
    const summary = await fabric.transformChunk(original, "summarize");
    const summaryChunk = {
      ...summary.chunks[0],
      metadata: {
        ...summary.chunks[0].metadata,
        provenance: [original.id],
      },
    };
    await store.store({ ...summaryChunk, workspace, sessionId: "test-session" });

    // Second transformation: extract wisdom from summary
    const wisdom = await fabric.transformChunk(summaryChunk, "extract_wisdom");
    const wisdomChunk = {
      ...wisdom.chunks[0],
      metadata: {
        ...wisdom.chunks[0].metadata,
        provenance: [...(summaryChunk.metadata?.provenance || []), summaryChunk.id],
      },
    };
    await store.store({ ...wisdomChunk, workspace, sessionId: "test-session" });

    // Verify provenance chain
    const finalResults = await store.query("wisdom", { workspace }, 10);

    const final = finalResults.find(r => r.source?.includes("extract_wisdom"));
    expect(final).toBeDefined();
    expect(final?.metadata?.provenance).toBeDefined();
    expect(final?.metadata?.provenance?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Fabric + Store Advanced Scenarios", () => {
  test("should implement semantic search with fabric preprocessing", async () => {
    const store = createStore({
      engine: "zvec",
      dbPath: ":memory:",
    });
    await store.init();

    const fabric = createFabricTransformer({ available: true });

    // Preprocess documents with fabric before storing
    const rawDocuments = [
      "The history of artificial intelligence began in the 1950s with foundational work by Turing and others.",
      "Machine learning algorithms improve performance through experience without explicit programming.",
      "Deep neural networks consist of multiple layers that learn hierarchical representations.",
    ];

    for (const doc of rawDocuments) {
      const sourceChunk: ContextChunk = {
        kind: "context",
        id: generateId(),
        source: "raw",
        workspace: "semantic-search-workspace",
        sessionId: "test",
        content: doc,
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      };

      // Extract key points for better semantic representation
      const transform = await fabric.transformChunk(sourceChunk, "key_points");

      // Store both original and key points
      await store.store({
        ...sourceChunk,
        workspace: "semantic-search-workspace",
        sessionId: "test",
      });

      for (const chunk of transform.chunks) {
        await store.store({
          ...chunk,
          workspace: "semantic-search-workspace",
          sessionId: "test",
        });
      }
    }

    // Search for AI-related content
    const results = await store.query("artificial intelligence", {
      workspace: "semantic-search-workspace",
    }, 10);

    // Should find both original and key points
    expect(results.length).toBeGreaterThan(0);

    await store.close();
  });

  test("should handle streaming fabric output to store", async () => {
    const store = createStore({
      engine: "zvec",
      dbPath: ":memory:",
    });
    await store.init();

    const fabric = createFabricTransformer({ available: true });
    let storedCount = 0;

    // Simulate streaming by processing chunks as they arrive
    const processStream = async (chunks: ContextChunk[]) => {
      for (const chunk of chunks) {
        const transform = await fabric.transformChunk(chunk, "summarize");

        if (transform.result.success) {
          for (const outputChunk of transform.chunks) {
            await store.store({
              ...outputChunk,
              workspace: "streaming-workspace",
              sessionId: "stream-session",
            });
            storedCount++;
          }
        }
      }
    };

    // Simulate incoming stream
    const streamChunks: ContextChunk[] = Array.from({ length: 5 }, (_, i) => ({
      kind: "context" as const,
      id: `stream-${i}`,
      source: "stream",
      workspace: "streaming-workspace",
      sessionId: "stream-session",
      content: `Stream chunk ${i}: This is content that needs to be summarized as part of the streaming pipeline test.`,
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
    }));

    await processStream(streamChunks);

    // Verify all chunks processed and stored
    expect(storedCount).toBeGreaterThanOrEqual(5);

    const allDocs: ContextChunk[] = [];
    let cursor = "";
    do {
      const batch = await store.scan(cursor, { workspace: "streaming-workspace" }, 100);
      allDocs.push(...batch.chunks);
      cursor = batch.nextCursor;
      if (batch.chunks.length === 0) break;
    } while (cursor);

    expect(allDocs.length).toBeGreaterThanOrEqual(5);

    await store.close();
  });

  test("should implement document versioning with fabric diffs", async () => {
    const store = createStore({
      engine: "zvec",
      dbPath: ":memory:",
    });
    await store.init();

    const fabric = createFabricTransformer({ available: true });

    // Store original version
    const v1: ContextChunk = {
      kind: "context",
      id: generateId(),
      source: "document",
      workspace: "versioning-workspace",
      sessionId: "test",
      content: "Version 1: Initial draft of the proposal with basic structure.",
      contentType: "text/plain",
      timestamp: Date.now(),
      generation: 1,
      metadata: { version: 1, status: "draft" },
    };

    await store.store({ ...v1, workspace: "versioning-workspace", sessionId: "test" });

    // Transform to create v2
    const v1Transform = await fabric.transformChunk(v1, "improve");
    const v2: ContextChunk = {
      ...v1Transform.chunks[0],
      id: generateId(),
      metadata: {
        ...v1Transform.chunks[0].metadata,
        version: 2,
        status: "improved",
        previousVersion: v1.id,
      },
    };

    await store.store({ ...v2, workspace: "versioning-workspace", sessionId: "test" });

    // Query all versions
    const allDocs: ContextChunk[] = [];
    let cursor = "";
    do {
      const batch = await store.scan(cursor, { workspace: "versioning-workspace" }, 10);
      allDocs.push(...batch.chunks);
      cursor = batch.nextCursor;
      if (batch.chunks.length === 0) break;
    } while (cursor);

    expect(allDocs.length).toBeGreaterThanOrEqual(2);

    // Find versions
    const versions = allDocs.filter(d => d.metadata?.version);
    expect(versions.length).toBeGreaterThanOrEqual(2);

    await store.close();
  });
});
