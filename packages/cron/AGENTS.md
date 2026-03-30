# @enhancement/cron

Cron scheduler for recurring recipe execution with job tracking and event notifications.

## Purpose

Manages scheduled execution of recipes using cron expressions. Supports timezone-aware scheduling, concurrent run limits, job lifecycle tracking, and event-driven notifications for schedule and job state changes.

## Key Domain Concepts

- **CronScheduler**: Main scheduler managing schedules and job execution.
- **CronSchedule**: A scheduled recipe with cron expression, timezone, and context.
- **ScheduledJob**: An instance of a schedule being executed.
- **CronEvent**: Events emitted for schedule/job lifecycle changes.
- **Job Status**: "pending", "running", "completed", "failed", "cancelled".
- **Cron Expression**: Standard 5-field (min hour day month weekday) or 6-field (with seconds) format.

## Public API

### Scheduler Setup

```typescript
import { CronScheduler, createCronScheduler } from '@enhancement/cron';

const scheduler = createCronScheduler({
  timezone: "America/New_York",
  maxConcurrentRuns: 5,
  defaultContext: { workspace: "default" },
  onJobStart: (job) => console.log("Started:", job.runId),
  onJobComplete: (job) => console.log("Completed:", job.runId),
  onJobFail: (job, error) => console.error("Failed:", error),
});

// Start the scheduler
scheduler.start();

// Stop the scheduler
scheduler.stop();
```

### Schedule Management

```typescript
// Create a schedule
const schedule = scheduler.createSchedule("recipe-123", {
  cronExpression: "0 9 * * 1-5", // 9 AM weekdays
  timezone: "America/New_York",
  enabled: true,
  context: { priority: "high" },
});

// Get schedule
const found = scheduler.getSchedule(schedule.id);

// List all schedules
const allSchedules = scheduler.getAllSchedules();

// List schedules for a recipe
const recipeSchedules = scheduler.getSchedulesForRecipe("recipe-123");

// Update schedule
scheduler.updateSchedule(schedule.id, {
  cronExpression: "0 10 * * 1-5", // Change to 10 AM
});

// Enable/disable
scheduler.enableSchedule(schedule.id);
scheduler.disableSchedule(schedule.id);

// Delete schedule
scheduler.deleteSchedule(schedule.id);
```

### Job Execution

```typescript
// Manual execution
const job = await scheduler.executeJob(schedule.id, async (recipeId, context) => {
  // Execute the recipe
  const result = await runRecipe(recipeId, context);
  return result;
});

// Cancel a job
scheduler.cancelJob(job.runId);

// Query jobs
const pending = scheduler.getPendingJobs();
const running = scheduler.getRunningJobs();
const allJobs = scheduler.getJob(job.runId);
```

### Event Handling

```typescript
// Subscribe to events
scheduler.onEvent((event) => {
  switch (event.type) {
    case "schedule_created":
      console.log("Schedule created:", event.schedule.id);
      break;
    case "job_started":
      console.log("Job started:", event.job.runId);
      break;
    case "job_completed":
      console.log("Job completed:", event.job.runId);
      break;
    case "job_failed":
      console.error("Job failed:", event.error);
      break;
  }
});

// Unsubscribe
scheduler.offEvent(handler);
```

### Statistics

```typescript
const stats = scheduler.getStats();
// {
//   totalSchedules: 10,
//   enabledSchedules: 8,
//   pendingJobs: 2,
//   runningJobs: 1,
//   completedJobs: 45,
//   failedJobs: 2
// }
```

## Cron Expression Format

Standard cron with optional seconds field:

```text
* * * * * *  (second minute hour day month weekday)
| | | | | |
| | | | | +-- Day of week (0-7, 0/7 = Sunday)
| | | | +---- Month (1-12)
| | | +------ Day of month (1-31)
| | +-------- Hour (0-23)
| +---------- Minute (0-59)
+------------ Second (0-59, optional)
```

Examples:

- `0 9 * * 1-5` - 9 AM weekdays (Mon-Fri)
- `*/15 * * * *` - Every 15 minutes
- `0 0 * * 0` - Weekly on Sunday
- `0 */6 * * *` - Every 6 hours

## Design Decisions

1. **Pure Cron (No Natural Language)**: Standard cron expressions only; no "every 5 minutes" sugar.
2. **Timezone Aware**: Each schedule can have its own timezone.
3. **Event-Driven**: All state changes emit typed events for external monitoring.
4. **Job Isolation**: Jobs track their own lifecycle independently of schedules.
5. **Concurrent Limits**: Prevents resource exhaustion with `maxConcurrentRuns`.
6. **ULID IDs**: All schedules and jobs use lexicographically sortable ULIDs.

## Dependencies

- `@enhancement/types`: Core types
- `@enhancement/recipe`: Recipe execution (dependency)
- `@enhancement/bus`: Event integration
- `ulidx`: ULID generation

## Package Structure

```text
packages/cron/
├── src/
│   ├── index.ts          # Public exports
│   ├── types.ts          # CronSchedule, ScheduledJob, CronEvent types
│   └── scheduler.ts      # CronScheduler implementation
└── test/
    └── conformance.test.ts
```
