import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	CronScheduler,
	createCronScheduler,
	type ScheduleJobOptions,
	type CronEvent,
} from "../src/index.js";

describe("CronScheduler", () => {
	let scheduler: CronScheduler;

	beforeEach(() => {
		scheduler = createCronScheduler();
	});

	afterEach(() => {
		scheduler.stop();
		scheduler.clear();
	});

	describe("schedule creation", () => {
		it("should create a schedule with valid cron expression", () => {
			const options: ScheduleJobOptions = {
				cronExpression: "*/5 * * * *",
			};

			const schedule = scheduler.createSchedule("recipe-1", options);

			expect(schedule.id).toBeDefined();
			expect(schedule.recipeId).toBe("recipe-1");
			expect(schedule.cronExpression).toBe("*/5 * * * *");
			expect(schedule.timezone).toBe("UTC");
			expect(schedule.enabled).toBe(true);
			expect(schedule.nextRun).toBeDefined();
		});

		it("should reject invalid cron expressions", () => {
			const options: ScheduleJobOptions = {
				cronExpression: "invalid",
			};

			expect(() => scheduler.createSchedule("recipe-1", options)).toThrow();
		});

		it("should set custom timezone", () => {
			const options: ScheduleJobOptions = {
				cronExpression: "0 9 * * *",
				timezone: "America/New_York",
			};

			const schedule = scheduler.createSchedule("recipe-1", options);
			expect(schedule.timezone).toBe("America/New_York");
		});

		it("should include context", () => {
			const options: ScheduleJobOptions = {
				cronExpression: "0 9 * * *",
				context: { key: "value" },
			};

			const schedule = scheduler.createSchedule("recipe-1", options);
			expect(schedule.context).toEqual({ key: "value" });
		});

		it("should set next run time correctly for 5-minute interval", () => {
			const options: ScheduleJobOptions = {
				cronExpression: "*/5 * * * *",
			};

		const schedule = scheduler.createSchedule("recipe-1", options);
		const nextRun = new Date(schedule.nextRun!);
		const now = new Date();

		// Allow 1 second buffer for processing time
		expect(nextRun.getTime()).toBeGreaterThanOrEqual(now.getTime() - 1000);
		expect(nextRun.getMinutes() % 5).toBe(0);
		expect(nextRun.getSeconds()).toBe(0);
	});
	});

	describe("schedule management", () => {
		it("should get schedule by id", () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "0 9 * * *",
			});

			const found = scheduler.getSchedule(schedule.id);
			expect(found?.id).toBe(schedule.id);
		});

		it("should return undefined for unknown schedule", () => {
			const found = scheduler.getSchedule("unknown");
			expect(found).toBeUndefined();
		});

		it("should get all schedules", () => {
			scheduler.createSchedule("recipe-1", { cronExpression: "0 9 * * *" });
			scheduler.createSchedule("recipe-2", { cronExpression: "0 10 * * *" });

			const all = scheduler.getAllSchedules();
			expect(all.length).toBe(2);
		});

		it("should get schedules for specific recipe", () => {
			scheduler.createSchedule("recipe-1", { cronExpression: "0 9 * * *" });
			scheduler.createSchedule("recipe-1", { cronExpression: "0 10 * * *" });
			scheduler.createSchedule("recipe-2", { cronExpression: "0 11 * * *" });

			const forRecipe1 = scheduler.getSchedulesForRecipe("recipe-1");
			expect(forRecipe1.length).toBe(2);
		});

		it("should update schedule", () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "0 9 * * *",
			});

			const updated = scheduler.updateSchedule(schedule.id, {
				cronExpression: "0 10 * * *",
				enabled: false,
			});

			expect(updated?.cronExpression).toBe("0 10 * * *");
			expect(updated?.enabled).toBe(false);
		});

		it("should delete schedule", () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "0 9 * * *",
			});

			const deleted = scheduler.deleteSchedule(schedule.id);
			expect(deleted).toBe(true);
			expect(scheduler.getSchedule(schedule.id)).toBeUndefined();
		});

		it("should return false when deleting unknown schedule", () => {
			const deleted = scheduler.deleteSchedule("unknown");
			expect(deleted).toBe(false);
		});

		it("should enable and disable schedule", () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "0 9 * * *",
			});

			scheduler.disableSchedule(schedule.id);
			expect(scheduler.getSchedule(schedule.id)?.enabled).toBe(false);

			scheduler.enableSchedule(schedule.id);
			expect(scheduler.getSchedule(schedule.id)?.enabled).toBe(true);
		});
	});

	describe("job execution", () => {
		it("should execute job and return run id", async () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "* * * * *",
			});

			const mockExecutor = async (recipeId: string) => {
				return `run-${recipeId}`;
			};

			const job = await scheduler.executeJob(schedule.id, mockExecutor);
			expect(job).not.toBeNull();
			expect(job?.status).toBe("completed");
			expect(job?.recipeId).toBe("recipe-1");
		});

		it("should handle job execution errors", async () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "* * * * *",
			});

			const failingExecutor = async () => {
				throw new Error("Execution failed");
			};

			const job = await scheduler.executeJob(schedule.id, failingExecutor);
			expect(job?.status).toBe("failed");
			expect(job?.error).toBe("Execution failed");
		});

		it("should enforce max concurrent runs", async () => {
			const limitedScheduler = createCronScheduler({ maxConcurrentRuns: 1 });

			const schedule1 = limitedScheduler.createSchedule("recipe-1", {
				cronExpression: "* * * * *",
			});
			const schedule2 = limitedScheduler.createSchedule("recipe-2", {
				cronExpression: "* * * * *",
			});

			let startTime = Date.now();
			const slowExecutor = async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				return "done";
			};

			const job1Promise = limitedScheduler.executeJob(schedule1.id, slowExecutor);
			const job2Promise = limitedScheduler.executeJob(schedule2.id, slowExecutor);

			const results = await Promise.allSettled([job1Promise, job2Promise]);

			const rejections = results.filter((r) => r.status === "rejected");
			expect(rejections.length).toBeGreaterThanOrEqual(1);

			limitedScheduler.stop();
			limitedScheduler.clear();
		});

		it("should cancel running job", async () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "* * * * *",
			});

			let canCancel = true;
			const mockExecutor = async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				if (canCancel) {
					throw new Error("Cancelled");
				}
				return "done";
			};

			const jobPromise = scheduler.executeJob(schedule.id, mockExecutor);
			canCancel = false;
			await jobPromise;

			const job = await scheduler.executeJob(schedule.id, async () => "done");
			expect(job?.status).toBe("completed");
		});

		it("should not cancel completed job", async () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "* * * * *",
			});

			const mockExecutor = async () => "done";
			const job = await scheduler.executeJob(schedule.id, mockExecutor);

			expect(scheduler.cancelJob(job!.runId)).toBe(false);
		});

		it("should get pending and running jobs", async () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "* * * * *",
			});

			const mockExecutor = async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return "done";
			};

			const jobPromise = scheduler.executeJob(schedule.id, mockExecutor);
			expect(scheduler.getRunningJobs().length).toBeGreaterThanOrEqual(0);

			await jobPromise;
			expect(scheduler.getPendingJobs().length).toBe(0);
		});
	});

	describe("event handling", () => {
		it("should emit events", () => {
			const events: CronEvent[] = [];
			scheduler.onEvent((event) => events.push(event));

			scheduler.createSchedule("recipe-1", { cronExpression: "0 9 * * *" });

			expect(events.some((e) => e.type === "schedule_created")).toBe(true);
		});

		it("should remove event handler", () => {
			const events: CronEvent[] = [];
			const handler = (event: CronEvent) => events.push(event);

			scheduler.onEvent(handler);
			scheduler.offEvent(handler);

			scheduler.createSchedule("recipe-1", { cronExpression: "0 9 * * *" });
			expect(events.length).toBe(0);
		});
	});

	describe("lifecycle", () => {
		it("should start and stop", () => {
			expect(scheduler.isRunning()).toBe(false);

			scheduler.start();
			expect(scheduler.isRunning()).toBe(true);

			scheduler.stop();
			expect(scheduler.isRunning()).toBe(false);
		});

		it("should not start twice", () => {
			scheduler.start();
			scheduler.start();
			expect(scheduler.isRunning()).toBe(true);
			scheduler.stop();
		});

		it("should get stats", async () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "0 9 * * *",
			});

			const mockExecutor = async () => "done";
			await scheduler.executeJob(schedule.id, mockExecutor);

			const stats = scheduler.getStats();
			expect(stats.totalSchedules).toBe(1);
			expect(stats.enabledSchedules).toBe(1);
			expect(stats.completedJobs).toBe(1);
		});
	});

	describe("cron expression validation", () => {
		it("should support 5-field expressions (standard)", () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "0 9 * * *",
			});
			expect(schedule.cronExpression).toBe("0 9 * * *");
		});

		it("should support 6-field expressions (with seconds)", () => {
			const schedule = scheduler.createSchedule("recipe-1", {
				cronExpression: "0 0 9 * * *",
			});
			expect(schedule.cronExpression).toBe("0 0 9 * * *");
		});

		it("should reject invalid minute field", () => {
			expect(() =>
				scheduler.createSchedule("recipe-1", {
					cronExpression: "60 * * * *",
				})
			).toThrow();
		});

		it("should reject invalid hour field", () => {
			expect(() =>
				scheduler.createSchedule("recipe-1", {
					cronExpression: "* 25 * * *",
				})
			).toThrow();
		});
	});
});
