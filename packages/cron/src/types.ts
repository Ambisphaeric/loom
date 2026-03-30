export interface CronSchedule {
	id: string;
	recipeId: string;
	cronExpression: string;
	timezone: string;
	enabled: boolean;
	context?: Record<string, unknown>;
	lastRun?: number;
	nextRun?: number;
	createdAt: number;
	updatedAt: number;
}

export interface ScheduledJob {
	scheduleId: string;
	recipeId: string;
	runId: string;
	scheduledFor: number;
	startedAt?: number;
	completedAt?: number;
	status: "pending" | "running" | "completed" | "failed" | "cancelled";
	error?: string;
}

export interface CronSchedulerOptions {
	timezone?: string;
	maxConcurrentRuns?: number;
	defaultContext?: Record<string, unknown>;
	onJobStart?: (job: ScheduledJob) => void;
	onJobComplete?: (job: ScheduledJob) => void;
	onJobFail?: (job: ScheduledJob, error: Error) => void;
}

export interface ScheduleJobOptions {
	cronExpression: string;
	timezone?: string;
	enabled?: boolean;
	context?: Record<string, unknown>;
}

export type CronEvent =
	| { type: "schedule_created"; schedule: CronSchedule }
	| { type: "schedule_updated"; schedule: CronSchedule }
	| { type: "schedule_deleted"; scheduleId: string }
	| { type: "job_scheduled"; job: ScheduledJob }
	| { type: "job_started"; job: ScheduledJob }
	| { type: "job_completed"; job: ScheduledJob }
	| { type: "job_failed"; job: ScheduledJob; error: string };

export interface CronEventHandler {
	(event: CronEvent): void;
}
