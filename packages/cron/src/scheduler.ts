import type {
	CronSchedule,
	ScheduledJob,
	CronSchedulerOptions,
	ScheduleJobOptions,
	CronEvent,
	CronEventHandler,
} from "./types.js";
import { ulid } from "ulidx";

interface ParsedCron {
	second?: number;
	minute: number;
	minuteStep?: number;
	hour: number;
	hourStep?: number;
	dayOfMonth: number;
	dayOfMonthStep?: number;
	month: number;
	dayOfWeek: number;
	dayOfWeekStep?: number;
}

function parseCronExpression(expression: string): ParsedCron {
	const parts = expression.trim().split(/\s+/);
	const result: ParsedCron = {
		minute: -1,
		hour: -1,
		dayOfMonth: -1,
		month: -1,
		dayOfWeek: -1,
	};

	if (parts.length < 5) {
		throw new Error(`Invalid cron expression: ${expression}`);
	}

	if (parts.length === 6) {
		result.second = parseCronPart(parts[0], 0, 59);
		result.minute = parseCronPart(parts[1], 0, 59);
		result.minuteStep = parseCronStep(parts[1]);
		result.hour = parseCronPart(parts[2], 0, 23);
		result.hourStep = parseCronStep(parts[2]);
		result.dayOfMonth = parseCronPart(parts[3], 1, 31);
		result.dayOfMonthStep = parseCronStep(parts[3]);
		result.month = parseCronPart(parts[4], 1, 12);
		result.dayOfWeek = parseCronPart(parts[5], 0, 7);
		result.dayOfWeekStep = parseCronStep(parts[5]);
	} else {
		result.minute = parseCronPart(parts[0], 0, 59);
		result.minuteStep = parseCronStep(parts[0]);
		result.hour = parseCronPart(parts[1], 0, 23);
		result.hourStep = parseCronStep(parts[1]);
		result.dayOfMonth = parseCronPart(parts[2], 1, 31);
		result.dayOfMonthStep = parseCronStep(parts[2]);
		result.month = parseCronPart(parts[3], 1, 12);
		result.dayOfWeek = parseCronPart(parts[4], 0, 7);
		result.dayOfWeekStep = parseCronStep(parts[4]);
	}

	return result;
}

function parseCronPart(part: string, min: number, max: number): number {
	if (part === "*") return -1;
	
	if (part.startsWith("*/")) {
		return -1;
	}
	
	const num = parseInt(part, 10);
	if (isNaN(num) || num < min || num > max) {
		throw new Error(`Invalid cron part: ${part} (expected ${min}-${max})`);
	}
	return num;
}

function parseCronStep(part: string): number | undefined {
	if (part.startsWith("*/")) {
		const step = parseInt(part.slice(2), 10);
		if (isNaN(step) || step < 1) {
			throw new Error(`Invalid step value: ${part}`);
		}
		return step;
	}
	return undefined;
}

function matchesCron(date: Date, parsed: ParsedCron): boolean {
	const minute = date.getMinutes();
	const hour = date.getHours();
	const dayOfMonth = date.getDate();
	const month = date.getMonth() + 1;
	const dayOfWeek = date.getDay();
	const second = date.getSeconds();

	if (parsed.second !== undefined && parsed.second !== -1 && second !== parsed.second) {
		return false;
	}
	
	if (parsed.minuteStep) {
		if (minute % parsed.minuteStep !== 0) {
			return false;
		}
	} else if (parsed.minute !== -1 && minute !== parsed.minute) {
		return false;
	}
	
	if (parsed.hourStep) {
		if (hour % parsed.hourStep !== 0) {
			return false;
		}
	} else if (parsed.hour !== -1 && hour !== parsed.hour) {
		return false;
	}
	
	if (parsed.dayOfMonth !== -1 && dayOfMonth !== parsed.dayOfMonth) {
		return false;
	}
	if (parsed.month !== -1 && month !== parsed.month) {
		return false;
	}
	if (parsed.dayOfWeek !== -1 && parsed.dayOfWeek !== 7 && dayOfWeek !== parsed.dayOfWeek) {
		return false;
	}
	if (parsed.dayOfWeek === 7 && dayOfWeek !== 0) {
		return false;
	}

	return true;
}

function getNextRunTime(parsed: ParsedCron, after: Date, timezone?: string): Date {
	const next = new Date(after.getTime());
	next.setSeconds(next.getSeconds() + 1);

	for (let i = 0; i < 366 * 24 * 60 * 60; i++) {
		next.setSeconds(next.getSeconds() + 1);
		if (matchesCron(next, parsed)) {
			next.setSeconds(0);
			next.setMilliseconds(0);
			return next;
		}
	}

	throw new Error("Could not find next run time within a year");
}

export class CronScheduler {
	private schedules: Map<string, CronSchedule> = new Map();
	private jobs: Map<string, ScheduledJob> = new Map();
	private eventHandlers: CronEventHandler[] = [];
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private running = false;
	private options: Required<CronSchedulerOptions>;

	constructor(options: CronSchedulerOptions = {}) {
		this.options = {
			timezone: options.timezone ?? "UTC",
			maxConcurrentRuns: options.maxConcurrentRuns ?? 5,
			defaultContext: options.defaultContext ?? {},
			onJobStart: options.onJobStart ?? (() => {}),
			onJobComplete: options.onJobComplete ?? (() => {}),
			onJobFail: options.onJobFail ?? (() => {}),
		};
	}

	private emit(event: CronEvent): void {
		for (const handler of this.eventHandlers) {
			try {
				handler(event);
			} catch (err) {
				// Silently ignore handler errors
			}
		}
	}

	onEvent(handler: CronEventHandler): void {
		this.eventHandlers.push(handler);
	}

	offEvent(handler: CronEventHandler): void {
		const index = this.eventHandlers.indexOf(handler);
		if (index !== -1) {
			this.eventHandlers.splice(index, 1);
		}
	}

	createSchedule(recipeId: string, options: ScheduleJobOptions): CronSchedule {
		parseCronExpression(options.cronExpression);

		const now = Date.now();
		const schedule: CronSchedule = {
			id: ulid(),
			recipeId,
			cronExpression: options.cronExpression,
			timezone: options.timezone ?? this.options.timezone,
			enabled: options.enabled ?? true,
			context: { ...this.options.defaultContext, ...options.context },
			createdAt: now,
			updatedAt: now,
		};

		const parsed = parseCronExpression(schedule.cronExpression);
		schedule.nextRun = getNextRunTime(parsed, new Date()).getTime();

		this.schedules.set(schedule.id, schedule);
		this.emit({ type: "schedule_created", schedule });

		return schedule;
	}

	getSchedule(scheduleId: string): CronSchedule | undefined {
		return this.schedules.get(scheduleId);
	}

	getAllSchedules(): CronSchedule[] {
		return [...this.schedules.values()];
	}

	getSchedulesForRecipe(recipeId: string): CronSchedule[] {
		return [...this.schedules.values()].filter((s) => s.recipeId === recipeId);
	}

	updateSchedule(scheduleId: string, updates: Partial<ScheduleJobOptions>): CronSchedule | null {
		const schedule = this.schedules.get(scheduleId);
		if (!schedule) return null;

		if (updates.cronExpression) {
			parseCronExpression(updates.cronExpression);
			schedule.cronExpression = updates.cronExpression;
		}
		if (updates.timezone !== undefined) {
			schedule.timezone = updates.timezone;
		}
		if (updates.enabled !== undefined) {
			schedule.enabled = updates.enabled;
		}
		if (updates.context !== undefined) {
			schedule.context = { ...this.options.defaultContext, ...updates.context };
		}

		schedule.updatedAt = Date.now();

		const parsed = parseCronExpression(schedule.cronExpression);
		schedule.nextRun = getNextRunTime(parsed, new Date()).getTime();

		this.emit({ type: "schedule_updated", schedule });
		return schedule;
	}

	deleteSchedule(scheduleId: string): boolean {
		const schedule = this.schedules.get(scheduleId);
		if (!schedule) return false;

		this.schedules.delete(scheduleId);
		this.emit({ type: "schedule_deleted", scheduleId });
		return true;
	}

	enableSchedule(scheduleId: string): boolean {
		const schedule = this.schedules.get(scheduleId);
		if (!schedule) return false;

		schedule.enabled = true;
		schedule.updatedAt = Date.now();
		this.emit({ type: "schedule_updated", schedule });
		return true;
	}

	disableSchedule(scheduleId: string): boolean {
		const schedule = this.schedules.get(scheduleId);
		if (!schedule) return false;

		schedule.enabled = false;
		schedule.updatedAt = Date.now();
		this.emit({ type: "schedule_updated", schedule });
		return true;
	}

	getJob(jobId: string): ScheduledJob | undefined {
		return this.jobs.get(jobId);
	}

	getPendingJobs(): ScheduledJob[] {
		return [...this.jobs.values()].filter((j) => j.status === "pending");
	}

	getRunningJobs(): ScheduledJob[] {
		return [...this.jobs.values()].filter((j) => j.status === "running");
	}

	async executeJob(
		scheduleId: string,
		recipeExecutor: (recipeId: string, context?: Record<string, unknown>) => Promise<string>
	): Promise<ScheduledJob | null> {
		const schedule = this.schedules.get(scheduleId);
		if (!schedule) return null;

		const runningCount = this.getRunningJobs().length;
		if (runningCount >= this.options.maxConcurrentRuns) {
			throw new Error(`Max concurrent runs (${this.options.maxConcurrentRuns}) reached`);
		}

		const job: ScheduledJob = {
			scheduleId,
			recipeId: schedule.recipeId,
			runId: ulid(),
			scheduledFor: schedule.nextRun ?? Date.now(),
			status: "pending",
		};

		this.jobs.set(job.runId, job);
		this.emit({ type: "job_scheduled", job });

		job.startedAt = Date.now();
		job.status = "running";
		this.emit({ type: "job_started", job });
		this.options.onJobStart(job);

		try {
			const result = await recipeExecutor(schedule.recipeId, schedule.context);
			job.completedAt = Date.now();
			job.status = "completed";
			this.emit({ type: "job_completed", job });
			this.options.onJobComplete(job);

			schedule.lastRun = job.startedAt;
			const parsed = parseCronExpression(schedule.cronExpression);
			schedule.nextRun = getNextRunTime(parsed, new Date()).getTime();
			this.emit({ type: "schedule_updated", schedule });

			return job;
		} catch (err) {
			job.completedAt = Date.now();
			job.status = "failed";
			job.error = err instanceof Error ? err.message : String(err);
			this.emit({ type: "job_failed", job, error: job.error });
			this.options.onJobFail(job, err instanceof Error ? err : new Error(String(err)));
			return job;
		}
	}

	cancelJob(jobId: string): boolean {
		const job = this.jobs.get(jobId);
		if (!job) return false;

		if (job.status === "pending" || job.status === "running") {
			job.status = "cancelled";
			job.completedAt = Date.now();
			return true;
		}

		return false;
	}

	start(): void {
		if (this.running) return;

		this.running = true;
		this.intervalId = setInterval(() => {
			this.tick();
		}, 1000);
	}

	stop(): void {
		if (!this.running) return;

		this.running = false;
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	private tick(): void {
		const now = Date.now();

		for (const schedule of this.schedules.values()) {
			if (!schedule.enabled) continue;
			if (schedule.nextRun === undefined) continue;

			if (now >= schedule.nextRun) {
				const job = this.createPendingJob(schedule);
				this.emit({ type: "job_scheduled", job });

				const parsed = parseCronExpression(schedule.cronExpression);
				schedule.nextRun = getNextRunTime(parsed, new Date()).getTime();
				this.emit({ type: "schedule_updated", schedule });
			}
		}
	}

	private createPendingJob(schedule: CronSchedule): ScheduledJob {
		const job: ScheduledJob = {
			scheduleId: schedule.id,
			recipeId: schedule.recipeId,
			runId: ulid(),
			scheduledFor: schedule.nextRun ?? Date.now(),
			status: "pending",
		};

		this.jobs.set(job.runId, job);
		return job;
	}

	getStats(): {
		totalSchedules: number;
		enabledSchedules: number;
		pendingJobs: number;
		runningJobs: number;
		completedJobs: number;
		failedJobs: number;
	} {
		const jobs = [...this.jobs.values()];
		return {
			totalSchedules: this.schedules.size,
			enabledSchedules: [...this.schedules.values()].filter((s) => s.enabled).length,
			pendingJobs: jobs.filter((j) => j.status === "pending").length,
			runningJobs: jobs.filter((j) => j.status === "running").length,
			completedJobs: jobs.filter((j) => j.status === "completed").length,
			failedJobs: jobs.filter((j) => j.status === "failed").length,
		};
	}

	clear(): void {
		this.schedules.clear();
		this.jobs.clear();
	}

	isRunning(): boolean {
		return this.running;
	}
}

export function createCronScheduler(options?: CronSchedulerOptions): CronScheduler {
	return new CronScheduler(options);
}
