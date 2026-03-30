import {
	CronScheduler,
	createCronScheduler,
	type ScheduleJobOptions,
	type CronEvent,
} from "../src/index.js";

async function basicDemo(): Promise<void> {
	console.log("=== Cron Scheduler Basic Demo ===\n");

	const scheduler = createCronScheduler({
		timezone: "America/New_York",
		maxConcurrentRuns: 3,
		onJobStart: (job) => {
			console.log(`[EVENT] Job started: ${job.runId}`);
		},
		onJobComplete: (job) => {
			console.log(`[EVENT] Job completed: ${job.runId}`);
		},
		onJobFail: (job, error) => {
			console.log(`[EVENT] Job failed: ${job.runId} - ${error.message}`);
		},
	});

	scheduler.onEvent((event: CronEvent) => {
		console.log(`[EVENT] ${event.type}`);
	});

	const schedule: ScheduleJobOptions = {
		cronExpression: "*/5 * * * *",
		timezone: "UTC",
		context: { source: "demo" },
	};

	const created = scheduler.createSchedule("daily-suggestions", schedule);
	console.log(`\nCreated schedule: ${created.id}`);
	console.log(`  Recipe: ${created.recipeId}`);
	console.log(`  Cron: ${created.cronExpression}`);
	console.log(`  Next run: ${new Date(created.nextRun!).toISOString()}`);

	const allSchedules = scheduler.getAllSchedules();
	console.log(`\nTotal schedules: ${allSchedules.length}`);

	scheduler.start();
	console.log(`\nScheduler running: ${scheduler.isRunning()}`);

	console.log("\nSimulating job execution...");
	const mockExecutor = async (recipeId: string, context?: Record<string, unknown>) => {
		console.log(`  Executing recipe: ${recipeId}`);
		console.log(`  Context: ${JSON.stringify(context)}`);
		await new Promise((resolve) => setTimeout(resolve, 100));
		return `run-${Date.now()}`;
	};

	const job = await scheduler.executeJob(created.id, mockExecutor);
	if (job) {
		console.log(`\nJob result:`);
		console.log(`  Run ID: ${job.runId}`);
		console.log(`  Status: ${job.status}`);
	}

	const stats = scheduler.getStats();
	console.log(`\nScheduler stats:`, stats);

	scheduler.stop();
	console.log(`\nScheduler stopped: ${!scheduler.isRunning()}`);

	console.log("\n=== Demo Complete ===");
}

basicDemo().catch(console.error);
