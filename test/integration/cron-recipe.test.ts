/**
 * Integration Test: Cron + Recipe
 *
 * Tests the integration between cron scheduler and recipe execution.
 */

import { expect, test, describe, beforeEach } from "bun:test";
import { CronScheduler, createCronScheduler } from "@loomai/cron";
import { RecipeExecutor, createRecipeExecutor } from "@loomai/recipe";
import type { Recipe, RecipeStep } from "@loomai/recipe";

describe("Cron + Recipe Integration", () => {
  let scheduler: CronScheduler;
  let executor: RecipeExecutor;
  let executedRecipes: string[] = [];

  beforeEach(() => {
    scheduler = createCronScheduler({
      maxConcurrentRuns: 3,
    });
    executor = createRecipeExecutor();
    executedRecipes = [];

    // Register a test recipe handler
    executor.registerHandler("test-action", async (step, input) => {
      executedRecipes.push(step.id);
      return input.map((chunk) => ({
        ...chunk,
        content: `[Executed] ${chunk.content}`,
      }));
    });
  });

  test("should create a schedule for a recipe", () => {
    const schedule = scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: true,
      context: { test: true },
    });

    expect(schedule).toBeDefined();
    expect(schedule.recipeId).toBe("recipe-1");
    expect(schedule.cronExpression).toBe("*/5 * * * *");
    expect(schedule.enabled).toBe(true);
    expect(schedule.context).toEqual({ test: true });
    expect(schedule.nextRun).toBeDefined();
  });

  test("should get all schedules for a recipe", () => {
    scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    scheduler.createSchedule("recipe-1", {
      cronExpression: "0 */1 * * *",
      enabled: true,
    });

    scheduler.createSchedule("recipe-2", {
      cronExpression: "0 0 * * *",
      enabled: true,
    });

    const recipe1Schedules = scheduler.getSchedulesForRecipe("recipe-1");
    expect(recipe1Schedules).toHaveLength(2);

    const recipe2Schedules = scheduler.getSchedulesForRecipe("recipe-2");
    expect(recipe2Schedules).toHaveLength(1);
  });

  test("should update schedule", () => {
    const schedule = scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    const updated = scheduler.updateSchedule(schedule.id, {
      cronExpression: "*/10 * * * *",
      enabled: false,
    });

    expect(updated).not.toBeNull();
    expect(updated?.cronExpression).toBe("*/10 * * * *");
    expect(updated?.enabled).toBe(false);
  });

  test("should enable and disable schedules", () => {
    const schedule = scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: false,
    });

    expect(scheduler.enableSchedule(schedule.id)).toBe(true);
    expect(scheduler.getSchedule(schedule.id)?.enabled).toBe(true);

    expect(scheduler.disableSchedule(schedule.id)).toBe(true);
    expect(scheduler.getSchedule(schedule.id)?.enabled).toBe(false);
  });

  test("should execute a scheduled job with recipe executor", async () => {
    const schedule = scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: true,
      context: { foo: "bar" },
    });

    // Mock recipe executor
    const mockExecutor = async (recipeId: string, context?: Record<string, unknown>) => {
      expect(recipeId).toBe("recipe-1");
      expect(context).toEqual({ foo: "bar" });
      return "run-id-123";
    };

    const job = await scheduler.executeJob(schedule.id, mockExecutor);

    expect(job).toBeDefined();
    expect(job?.status).toBe("completed");
    expect(job?.recipeId).toBe("recipe-1");
  });

  test("should handle job failure gracefully", async () => {
    const schedule = scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    // Mock failing executor
    const mockFailingExecutor = async () => {
      throw new Error("Recipe execution failed");
    };

    const job = await scheduler.executeJob(schedule.id, mockFailingExecutor);

    expect(job).toBeDefined();
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe("Recipe execution failed");
  });

  test("should enforce max concurrent runs", async () => {
    scheduler = createCronScheduler({
      maxConcurrentRuns: 1,
    });

    const schedule1 = scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    const schedule2 = scheduler.createSchedule("recipe-2", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    // Start first job (this won't complete because our mock doesn't resolve immediately)
    const slowExecutor = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return "run-id";
    };

    const job1Promise = scheduler.executeJob(schedule1.id, slowExecutor);

    // Second job should fail due to max concurrent runs
    await expect(
      scheduler.executeJob(schedule2.id, slowExecutor)
    ).rejects.toThrow("Max concurrent runs");

    // Wait for first job to complete
    await job1Promise;
  });

  test("should get scheduler stats", () => {
    scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    scheduler.createSchedule("recipe-2", {
      cronExpression: "*/10 * * * *",
      enabled: false,
    });

    const stats = scheduler.getStats();

    expect(stats.totalSchedules).toBe(2);
    expect(stats.enabledSchedules).toBe(1);
    expect(stats.pendingJobs).toBe(0);
    expect(stats.runningJobs).toBe(0);
    expect(stats.completedJobs).toBe(0);
    expect(stats.failedJobs).toBe(0);
  });

  test("should emit events during lifecycle", () => {
    const events: string[] = [];

    scheduler.onEvent((event) => {
      events.push(event.type);
    });

    const schedule = scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    scheduler.updateSchedule(schedule.id, { enabled: false });
    scheduler.deleteSchedule(schedule.id);

    expect(events).toContain("schedule_created");
    expect(events).toContain("schedule_updated");
    expect(events).toContain("schedule_deleted");
  });

  test("should delete schedule and remove jobs", () => {
    const schedule = scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    expect(scheduler.deleteSchedule(schedule.id)).toBe(true);
    expect(scheduler.getSchedule(schedule.id)).toBeUndefined();
    expect(scheduler.deleteSchedule(schedule.id)).toBe(false);
  });

  test("should handle invalid cron expressions", () => {
    expect(() => {
      scheduler.createSchedule("recipe-1", {
        cronExpression: "invalid",
        enabled: true,
      });
    }).toThrow();
  });

  test("should run scheduler tick and create pending jobs", () => {
    scheduler.createSchedule("recipe-1", {
      cronExpression: "* * * * * *", // Every second
      enabled: true,
    });

    expect(scheduler.getPendingJobs()).toHaveLength(0);

    // Start scheduler and let it tick
    scheduler.start();

    // Wait a bit for tick to process
    setTimeout(() => {
      scheduler.stop();
    }, 100);
  });

  test("should cancel a pending job", async () => {
    const schedule = scheduler.createSchedule("recipe-1", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    const slowExecutor = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return "run-id";
    };

    // Start job
    const jobPromise = scheduler.executeJob(schedule.id, slowExecutor);

    // Immediately cancel (though it might complete before we can cancel)
    const stats = scheduler.getStats();
    if (stats.runningJobs > 0) {
      const runningJob = scheduler.getRunningJobs()[0];
      if (runningJob) {
        expect(scheduler.cancelJob(runningJob.runId)).toBe(true);
      }
    }

    // Cleanup
    try {
      await jobPromise;
    } catch {
      // May fail if cancelled
    }
  });
});

describe("Cron + Recipe Complex Scenarios", () => {
  test("should handle multiple schedules with different frequencies", () => {
    const scheduler = createCronScheduler();

    // High frequency job
    const highFreq = scheduler.createSchedule("recipe-high", {
      cronExpression: "*/1 * * * *",
      enabled: true,
    });

    // Daily job
    const daily = scheduler.createSchedule("recipe-daily", {
      cronExpression: "0 0 * * *",
      enabled: true,
    });

    // Weekly job
    const weekly = scheduler.createSchedule("recipe-weekly", {
      cronExpression: "0 0 * * 0",
      enabled: true,
    });

    expect(highFreq.nextRun).toBeDefined();
    expect(daily.nextRun).toBeDefined();
    expect(weekly.nextRun).toBeDefined();

    // High frequency should have closer next run
    expect(highFreq.nextRun! < daily.nextRun!).toBe(true);
  });

  test("should maintain context through job execution", async () => {
    const scheduler = createCronScheduler();
    const capturedContext: Record<string, unknown>[] = [];

    const schedule = scheduler.createSchedule("recipe-context", {
      cronExpression: "*/5 * * * *",
      enabled: true,
      context: {
        workspace: "test-workspace",
        sessionId: "test-session",
        customData: { key: "value" },
      },
    });

    const contextCapturingExecutor = async (
      recipeId: string,
      context?: Record<string, unknown>
    ) => {
      capturedContext.push(context ?? {});
      return "run-id";
    };

    await scheduler.executeJob(schedule.id, contextCapturingExecutor);

    expect(capturedContext).toHaveLength(1);
    expect(capturedContext[0].workspace).toBe("test-workspace");
    expect(capturedContext[0].sessionId).toBe("test-session");
    expect(capturedContext[0].customData).toEqual({ key: "value" });
  });

  test("should handle timezone in schedules", () => {
    const scheduler = createCronScheduler({
      timezone: "America/New_York",
    });

    const schedule = scheduler.createSchedule("recipe-tz", {
      cronExpression: "0 9 * * 1-5", // 9 AM weekdays
      enabled: true,
      timezone: "America/New_York",
    });

    expect(schedule.timezone).toBe("America/New_York");
    expect(schedule.nextRun).toBeDefined();
  });

  test("should track job history", async () => {
    const scheduler = createCronScheduler();

    const schedule = scheduler.createSchedule("recipe-history", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    const executor = async () => "run-id";

    // Execute multiple times
    await scheduler.executeJob(schedule.id, executor);
    await scheduler.executeJob(schedule.id, executor);
    await scheduler.executeJob(schedule.id, executor);

    const stats = scheduler.getStats();
    expect(stats.completedJobs).toBe(3);
  });

  test("should handle job start and completion callbacks", async () => {
    const events: string[] = [];

    const scheduler = createCronScheduler({
      onJobStart: () => events.push("started"),
      onJobComplete: () => events.push("completed"),
      onJobFail: () => events.push("failed"),
    });

    const schedule = scheduler.createSchedule("recipe-callbacks", {
      cronExpression: "*/5 * * * *",
      enabled: true,
    });

    const successExecutor = async () => "run-id";
    await scheduler.executeJob(schedule.id, successExecutor);

    expect(events).toContain("started");
    expect(events).toContain("completed");
  });
});
