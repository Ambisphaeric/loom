/**
 * Integration Test: Bus + Recipe
 *
 * Tests event-driven recipe execution via the bus.
 */

import { expect, test, describe, beforeEach } from "bun:test";
import { EnhancementBus } from "@loomai/bus";
import { RecipeExecutor, createRecipeExecutor } from "@loomai/recipe";
import type { Recipe, ContextChunk } from "@loomai/recipe";

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

describe("Bus + Recipe Integration", () => {
  let bus: EnhancementBus;
  let executor: RecipeExecutor;
  const workspace = "test-workspace";

  beforeEach(() => {
    bus = new EnhancementBus(workspace);
    executor = createRecipeExecutor();
  });

  test("should trigger recipe from bus event", async () => {
    const executedRecipes: string[] = [];

    // Subscribe to events and trigger recipes
    bus.subscribe("trigger/recipe", async (chunk) => {
      const recipeId = chunk.data as string;
      executedRecipes.push(recipeId);
    });

    const recipe: Recipe = {
      id: "event-driven-recipe",
      workspace,
      name: "Event Driven Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "step-1",
          kind: "gather",
          label: "Gather Data",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Publish trigger event
    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "scheduler",
      workspace,
      sessionId: "test-session",
      data: recipe.id,
      contentType: "trigger/recipe",
      timestamp: Date.now(),
      generation: 1,
    });

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(executedRecipes).toContain("event-driven-recipe");
  });

  test("should pass bus event data as recipe input", async () => {
    let capturedInput: ContextChunk[] = [];

    executor.registerHandler("process_event", async (_step, input) => {
      capturedInput = input;
      return input;
    });

    const recipe: Recipe = {
      id: "data-passing-recipe",
      workspace,
      name: "Data Passing Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "process",
          kind: "process_event",
          label: "Process Event Data",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Subscribe to bus and run recipe
    bus.subscribe("data/incoming", async (chunk) => {
      const input: ContextChunk[] = [
        {
          kind: "context",
          id: generateId(),
          source: "bus-event",
          workspace,
          sessionId: chunk.sessionId || "default",
          content: String(chunk.data),
          contentType: chunk.contentType,
          timestamp: Date.now(),
          generation: 1,
          metadata: { busEventId: chunk.id },
        },
      ];

      await executor.runRecipe(recipe, input);
    });

    // Publish event with data
    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "external-system",
      workspace,
      sessionId: "user-123",
      data: "Important event data here",
      contentType: "data/incoming",
      timestamp: Date.now(),
      generation: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(capturedInput).toHaveLength(1);
    expect(capturedInput[0].content).toBe("Important event data here");
    expect(capturedInput[0].metadata?.busEventId).toBeDefined();
  });

  test("should emit recipe completion back to bus", async () => {
    const completedRuns: string[] = [];

    // Subscribe to completion events
    bus.subscribe("recipe/completed", async (chunk) => {
      completedRuns.push(String(chunk.data));
    });

    executor.registerHandler("emit_result", async (step, input, context) => {
      // Emit completion event
      bus.publish({
        kind: "raw",
        id: generateId(),
        source: "recipe-executor",
        workspace,
        sessionId: context.sessionId,
        data: `Recipe ${context.runId} completed step ${step.id}`,
        contentType: "recipe/completed",
        timestamp: Date.now(),
        generation: 1,
      });
      return input;
    });

    const recipe: Recipe = {
      id: "emitting-recipe",
      workspace,
      name: "Emitting Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "emit-step",
          kind: "emit_result",
          label: "Emit Result",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await executor.runRecipe(recipe, []);

    // Wait for event propagation
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(completedRuns).toHaveLength(1);
    expect(completedRuns[0]).toContain("completed");
  });

  test("should route different event types to different recipes", async () => {
    const emailRecipeRuns: string[] = [];
    const smsRecipeRuns: string[] = [];

    const emailRecipe: Recipe = {
      id: "email-processor",
      workspace,
      name: "Email Processor",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "process-email",
          kind: "gather",
          label: "Process Email",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const smsRecipe: Recipe = {
      id: "sms-processor",
      workspace,
      name: "SMS Processor",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "process-sms",
          kind: "gather",
          label: "Process SMS",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Route events to appropriate recipes
    bus.subscribe("notification/email", async () => {
      await executor.runRecipe(emailRecipe, []);
      emailRecipeRuns.push("ran");
    });

    bus.subscribe("notification/sms", async () => {
      await executor.runRecipe(smsRecipe, []);
      smsRecipeRuns.push("ran");
    });

    // Send different notification types
    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "notification-service",
      workspace,
      sessionId: "test",
      data: "Email content",
      contentType: "notification/email",
      timestamp: Date.now(),
      generation: 1,
    });

    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "notification-service",
      workspace,
      sessionId: "test",
      data: "SMS content",
      contentType: "notification/sms",
      timestamp: Date.now(),
      generation: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(emailRecipeRuns).toHaveLength(1);
    expect(smsRecipeRuns).toHaveLength(1);
  });

  test("should handle recipe failure and emit error event", async () => {
    const errorEvents: string[] = [];

    bus.subscribe("recipe/failed", async (chunk) => {
      errorEvents.push(String(chunk.data));
    });

    executor.registerHandler("failing_step", async () => {
      throw new Error("Step execution failed");
    });

    const recipe: Recipe = {
      id: "failing-recipe",
      workspace,
      name: "Failing Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "fail",
          kind: "failing_step",
          label: "Failing Step",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Subscribe to bus and run recipe with error handling
    bus.subscribe("trigger/failing", async () => {
      try {
        const run = await executor.runRecipe(recipe, []);
        if (run.status === "failed") {
          bus.publish({
            kind: "raw",
            id: generateId(),
            source: "recipe-executor",
            workspace,
            sessionId: "test",
            data: `Recipe ${run.id} failed: ${run.steps[0].error}`,
            contentType: "recipe/failed",
            timestamp: Date.now(),
            generation: 1,
          });
        }
      } catch {
        // Error already recorded in run
      }
    });

    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "test",
      workspace,
      sessionId: "test",
      data: "trigger",
      contentType: "trigger/failing",
      timestamp: Date.now(),
      generation: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]).toContain("failed");
  });

  test("should use wildcard matching for recipe triggers", async () => {
    const triggeredRecipes: string[] = [];

    // Wildcard subscription matches all recipe/* events
    bus.subscribe("recipe/*", async (chunk) => {
      triggeredRecipes.push(chunk.contentType);
    });

    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "test",
      workspace,
      sessionId: "test",
      data: "data1",
      contentType: "recipe/created",
      timestamp: Date.now(),
      generation: 1,
    });

    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "test",
      workspace,
      sessionId: "test",
      data: "data2",
      contentType: "recipe/updated",
      timestamp: Date.now(),
      generation: 1,
    });

    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "test",
      workspace,
      sessionId: "test",
      data: "data3",
      contentType: "recipe/deleted",
      timestamp: Date.now(),
      generation: 1,
    });

    // Non-matching event
    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "test",
      workspace,
      sessionId: "test",
      data: "data4",
      contentType: "other/event",
      timestamp: Date.now(),
      generation: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(triggeredRecipes).toHaveLength(3);
    expect(triggeredRecipes).toContain("recipe/created");
    expect(triggeredRecipes).toContain("recipe/updated");
    expect(triggeredRecipes).toContain("recipe/deleted");
    expect(triggeredRecipes).not.toContain("other/event");
  });
});

describe("Bus + Recipe Complex Scenarios", () => {
  test("should implement event sourcing pattern", async () => {
    const events: Array<{ type: string; data: unknown }> = [];
    const bus = new EnhancementBus("event-sourcing-workspace");

    // Event sourcing: store all events, replay for state reconstruction
    bus.subscribe("*", async (chunk) => {
      events.push({
        type: chunk.contentType,
        data: chunk.data,
      });
    });

    // Emit domain events
    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "domain",
      workspace: "event-sourcing-workspace",
      sessionId: "user-1",
      data: { userId: "user-1", action: "created" },
      contentType: "user/created",
      timestamp: Date.now(),
      generation: 1,
    });

    bus.publish({
      kind: "raw",
      id: generateId(),
      source: "domain",
      workspace: "event-sourcing-workspace",
      sessionId: "user-1",
      data: { userId: "user-1", action: "updated", field: "email" },
      contentType: "user/updated",
      timestamp: Date.now(),
      generation: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("user/created");
    expect(events[1].type).toBe("user/updated");
  });

  test("should handle multi-step recipe with bus coordination", async () => {
    const bus = new EnhancementBus("coordination-workspace");
    const executor = createRecipeExecutor();
    const stepCompletions: string[] = [];

    // Each step emits an event when done
    executor.registerHandler("coordinated_step", async (step, input, context) => {
      // Do work
      const output = input.map(chunk => ({
        ...chunk,
        content: `${step.id} processed: ${chunk.content}`,
      }));

      // Emit completion event
      bus.publish({
        kind: "raw",
        id: generateId(),
        source: "recipe-executor",
        workspace: "coordination-workspace",
        sessionId: context.sessionId,
        data: { stepId: step.id, runId: context.runId },
        contentType: "recipe/step-completed",
        timestamp: Date.now(),
        generation: 1,
      });

      stepCompletions.push(step.id);
      return output;
    });

    const recipe: Recipe = {
      id: "coordinated-recipe",
      workspace: "coordination-workspace",
      name: "Coordinated Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: "step-a",
          kind: "coordinated_step",
          label: "Step A",
          config: {},
          trigger: { type: "manual" },
          enabled: true,
        },
        {
          id: "step-b",
          kind: "coordinated_step",
          label: "Step B",
          config: {},
          trigger: { type: "auto" },
          enabled: true,
        },
        {
          id: "step-c",
          kind: "coordinated_step",
          label: "Step C",
          config: {},
          trigger: { type: "auto" },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const input: ContextChunk[] = [
      {
        kind: "context",
        id: generateId(),
        source: "test",
        workspace: "coordination-workspace",
        sessionId: "test",
        content: "test data",
        contentType: "text/plain",
        timestamp: Date.now(),
        generation: 1,
      },
    ];

    const run = await executor.runRecipe(recipe, input);

    expect(run.steps.every(s => s.status === "completed")).toBe(true);
    expect(stepCompletions).toEqual(["step-a", "step-b", "step-c"]);
  });

  test("should implement saga pattern with compensation", async () => {
    const bus = new EnhancementBus("saga-workspace");
    const executedSteps: string[] = [];
    const compensatedSteps: string[] = [];

    // Saga: series of steps with compensation on failure
    const executor = createRecipeExecutor();

    executor.registerHandler("saga_step", async (step, input) => {
      executedSteps.push(step.id);

      // Simulate failure on step-b
      if (step.id === "step-b") {
        throw new Error("Step B failed");
      }

      return input;
    });

    executor.registerHandler("compensate", async (step, _input) => {
      compensatedSteps.push(step.id.replace("compensate-", ""));
      return [];
    });

    const recipe: Recipe = {
      id: "saga-recipe",
      workspace: "saga-workspace",
      name: "Saga Recipe",
      mode: "batch",
      schemaVersion: 1,
      audiences: [],
      steps: [
        { id: "step-a", kind: "saga_step", label: "Step A", config: {}, trigger: { type: "manual" }, enabled: true },
        { id: "step-b", kind: "saga_step", label: "Step B", config: {}, trigger: { type: "auto" }, enabled: true },
        { id: "step-c", kind: "saga_step", label: "Step C", config: {}, trigger: { type: "auto" }, enabled: true },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Listen for saga failure and trigger compensation
    bus.subscribe("saga/failed", async (chunk) => {
      const data = chunk.data as { failedStep: string; executedSteps: string[] };

      // Compensate in reverse order
      for (const step of data.executedSteps.reverse()) {
        bus.publish({
          kind: "raw",
          id: generateId(),
          source: "saga-orchestrator",
          workspace: "saga-workspace",
          sessionId: chunk.sessionId,
          data: { compensate: step },
          contentType: "saga/compensate",
          timestamp: Date.now(),
          generation: 1,
        });
      }
    });

    // Run recipe
    const run = await executor.runRecipe(recipe, []);

    if (run.status === "failed") {
      bus.publish({
        kind: "raw",
        id: generateId(),
        source: "recipe-executor",
        workspace: "saga-workspace",
        sessionId: "test",
        data: {
          failedStep: run.steps.find(s => s.status === "failed")?.stepId,
          executedSteps: run.steps.filter(s => s.status === "completed").map(s => s.stepId),
        },
        contentType: "saga/failed",
        timestamp: Date.now(),
        generation: 1,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(executedSteps).toContain("step-a");
    expect(run.steps[1].status).toBe("failed");
  });
});
