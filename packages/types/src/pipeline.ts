// ============================================================================
// Enhancement — Pipeline Control Types
// ============================================================================

// --- Pipeline Toggle State ---

export type ToggleState = {
	enabled: boolean;
	lastChanged: number;
};

export interface SourceToggle extends ToggleState {
	sourceId: string;
}

export interface TransformToggle extends ToggleState {
	transformId: string;
}

// --- Pipeline Overrides ---

export interface PipelineOverrides {
	sourcesEnabled: Record<string, boolean>;
	transformsEnabled: Record<string, boolean>;
}

// --- Graph Types ---

// Extended node types for automation/trigger/action support
export type NodeType =
	| "source"
	| "transform"
	| "merge"
	| "split"
	| "conditional"
	| "recipe"
	| "trigger" // NEW: Declarative entry points
	| "action" // NEW: Side-effect producers
	| "sink"; // NEW: Output destinations

export type MergeStrategy =
	| "zip" // Pair chunk 0 from A with chunk 0 from B
	| "concat" // All chunks from A, then all from B
	| "interleave" // Alternate A, B, A, B...
	| "latest" // Most recent chunk from each source
	| "wait-all"; // Wait for all sources to have data

export type SplitStrategy =
	| "broadcast" // Send to ALL branches
	| "round-robin" // Rotate: chunk 1 → A, chunk 2 → B, etc.
	| "content-based" // Route based on content analysis
	| "load-balance"; // Send to branch with fewest pending chunks

export interface SplitBranch {
	id: string;
	condition?: string; // predicate for conditional routing
	filter?: {
		contentTypes: string[]; // only route these content types
	};
	priority: number; // evaluation order (lower = first)
}

export interface GraphNode {
	id: string;
	type: NodeType;
	config: Record<string, unknown>;
	enabled: boolean;
	inputs: string[];
	outputs: string[];
}

// NEW: Deferred execution strategy for "act later" functionality
export type DeferType = "queue" | "delay" | "condition";

export interface DeferStrategy {
	type: DeferType;
	delayMs?: number; // For "delay" type: milliseconds to wait
	condition?: string; // For "condition" type: condition name (e.g., "user-confirm")
	queueName?: string; // For "queue" type: named queue
	priority?: number; // Queue priority (lower = higher priority)
}

export interface GraphEdge {
	id: string;
	source: string;
	target: string;
	contentType: string;
	// NEW: Deferred execution strategy - enables "[act later]" functionality
	deferStrategy?: DeferStrategy;
}

// NEW: Trigger node configuration for automation entry points
export interface TriggerNode extends GraphNode {
	type: "trigger";
	triggerType: "schedule" | "webhook" | "event" | "condition";
	config: {
		// Schedule triggers
		cron?: string; // Cron expression e.g., "0 9 * * 1-5" for weekdays at 9am
		timezone?: string; // e.g., "America/New_York"
		// Webhook triggers
		webhookPath?: string; // e.g., "/webhooks/my-trigger"
		webhookMethod?: "GET" | "POST" | "PUT" | "DELETE";
		webhookSecret?: string; // For validating webhook authenticity
		// Event triggers
		eventFilter?: string; // e.g., "screen.changed" or "memory.added"
		// Condition triggers
		conditionExpression?: string; // e.g., "memory.query('urgent').length > 0"
	};
}

// NEW: Action/Sink node configuration for side effects
export interface ActionNode extends GraphNode {
	type: "action" | "sink";
	capability: string; // Plugin name providing the action (e.g., "email", "slack")
	credentialRef?: string; // "service/account" reference for credentials
	config: {
		template?: string; // Action template/pattern to use
		recipients?: string[]; // For email/notification actions
		format?: string; // Output format
		metadata?: Record<string, unknown>; // Action-specific config
	};
	// NEW: Defer configuration for this specific action
	deferConfig?: {
		enabled: boolean;
		defaultStrategy?: DeferStrategy;
	};
}

// --- Recipe Graph Integration ---

export type RecipeNodeType =
	| "recipe_step"
	| "recipe_merge"
	| "recipe_conditional"
	| "recipe_loop"
	| "recipe_output";

export interface RecipeGraphNode {
	id: string;
	type: RecipeNodeType;
	stepId?: string;
	config: Record<string, unknown>;
	inputs: string[];
	outputs: string[];
	condition?: string;
	loopConfig?: {
		maxIterations: number;
		breakCondition: string;
	};
}

// --- Pipeline Status ---

export interface PipelineStatus {
	workspace: string;
	sessionId?: string;
	sources: Record<string, ToggleState>;
	transforms: Record<string, ToggleState>;
	overridesActive: boolean;
}
