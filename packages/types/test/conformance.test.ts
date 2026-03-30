import { describe, expect, test } from "bun:test";
import {
	MAX_GENERATION,
	DEFAULT_BUS_CAPACITY,
	DEFAULT_RETENTION_DAYS,
	DATA_DIR,
	PluginError,
	PrivacySchema,
	GlobalConfigSchema,
} from "../src/index.js";
import { z } from "zod";

// Import types to verify they exist
import type {
	RawChunk,
	ContextChunk,
	Suggestion,
	Tool,
	MemoryFilter,
	UserProfile,
	Source,
	Fetch,
	Transform,
	Store,
	Trigger,
	Action,
	ActionContext,
	ActionResult,
	ModelProvider,
	Plugin,
	PluginCapabilities,
	Bus,
	BusHandler,
	Router,
	Loop,
	Session,
	SessionType,
	SessionStatus,
	GlobalConfig,
	PrivacyConfig,
	PluginConfig,
	WorkspaceConfig,
	Engine,
	EngineEvent,
	CredentialProvider,
	CredentialEntry,
	CredentialType,
	CredentialMetadata,
	CredentialAccessLogEntry,
	ToggleState,
	PipelineOverrides,
	NodeType,
	MergeStrategy,
	SplitStrategy,
	GraphNode,
	GraphEdge,
	DeferStrategy,
	DeferType,
	TriggerNode,
	ActionNode,
	Recipe,
	RecipeStep,
	StepKind,
	RecipeRun,
	StepRun,
	RunStatus,
	StepRunStatus,
	RecipeInput,
	RecipeOutput,
} from "../src/index.js";

describe("@enhancement/types conformance", () => {
	test("exports all constants with correct values", () => {
		expect(MAX_GENERATION).toBe(5);
		expect(DEFAULT_BUS_CAPACITY).toBe(100);
		expect(DEFAULT_RETENTION_DAYS).toBe(30);
		expect(DATA_DIR).toBe("~/.enhancement");
	});

	test("PluginError can be instantiated", () => {
		const error = new PluginError(
			"Test error",
			"test-plugin",
			"init",
			true,
			{ extra: "info" }
		);

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(PluginError);
		expect(error.name).toBe("PluginError");
		expect(error.message).toBe("Test error");
		expect(error.plugin).toBe("test-plugin");
		expect(error.operation).toBe("init");
		expect(error.recoverable).toBe(true);
		expect(error.context).toEqual({ extra: "info" });
	});

	test("PrivacySchema validates correctly", () => {
		const valid = PrivacySchema.parse({
			telemetry: true,
			retentionDays: 60,
		});
		expect(valid.telemetry).toBe(true);
		expect(valid.retentionDays).toBe(60);

		// Test defaults
		const defaults = PrivacySchema.parse({});
		expect(defaults.telemetry).toBe(false);
		expect(defaults.retentionDays).toBe(DEFAULT_RETENTION_DAYS);
	});

	test("GlobalConfigSchema validates correctly", () => {
		const valid = GlobalConfigSchema.parse({
			apiKeys: { openai: "sk-test" },
			defaultModel: "gpt-4",
			dataDir: "/custom/path",
			privacy: { telemetry: true },
			activeWorkspace: "my-workspace",
		});

		expect(valid.apiKeys).toEqual({ openai: "sk-test" });
		expect(valid.defaultModel).toBe("gpt-4");
		expect(valid.dataDir).toBe("/custom/path");
		expect(valid.privacy.telemetry).toBe(true);
		expect(valid.activeWorkspace).toBe("my-workspace");

		// Test defaults
		const defaults = GlobalConfigSchema.parse({});
		expect(defaults.apiKeys).toEqual({});
		expect(defaults.defaultModel).toBe("");
		expect(defaults.dataDir).toBe(DATA_DIR);
	});

	test("type exports are valid (compilation check)", () => {
		// This test verifies all types can be imported
		// If it compiles, the types are correctly exported
		const _rawChunk: RawChunk = {
			kind: "raw",
			source: "test",
			workspace: "ws",
			sessionId: "s1",
			contentType: "text",
			data: "test data",
			timestamp: Date.now(),
			generation: 0,
		};

		const _contextChunk: ContextChunk = {
			kind: "context",
			id: "c1",
			source: "test",
			workspace: "ws",
			sessionId: "s1",
			content: "test content",
			contentType: "text",
			timestamp: Date.now(),
			generation: 0,
		};

		// Just verify they were created
		expect(_rawChunk.kind).toBe("raw");
		expect(_contextChunk.kind).toBe("context");
	});

	test("SessionType union is valid", () => {
		const sessionTypes: SessionType[] = [
			"passive_watch",
			"meeting_capture",
			"document_drafting",
			"research",
			"custom",
		];
		expect(sessionTypes).toHaveLength(5);
	});

	test("SessionStatus union is valid", () => {
		const sessionStatuses: SessionStatus[] = [
			"created",
			"active",
			"paused",
			"completed",
			"archived",
		];
		expect(sessionStatuses).toHaveLength(5);
	});

	test("MergeStrategy union is valid", () => {
		const strategies: MergeStrategy[] = [
			"zip",
			"concat",
			"interleave",
			"latest",
			"wait-all",
		];
		expect(strategies).toHaveLength(5);
	});

	test("SplitStrategy union is valid", () => {
		const strategies: SplitStrategy[] = [
			"broadcast",
			"round-robin",
			"content-based",
			"load-balance",
		];
		expect(strategies).toHaveLength(4);
	});

	test("DeferType union is valid", () => {
		const types: DeferType[] = ["queue", "delay", "condition"];
		expect(types).toHaveLength(3);
	});

	test("RunStatus union is valid", () => {
		const statuses: RunStatus[] = [
			"pending",
			"running",
			"paused",
			"completed",
			"failed",
			"cancelled",
		];
		expect(statuses).toHaveLength(6);
	});

	test("StepRunStatus union is valid", () => {
		const statuses: StepRunStatus[] = [
			"pending",
			"running",
			"completed",
			"failed",
			"skipped",
			"cancelled",
		];
		expect(statuses).toHaveLength(6);
	});

	test("CredentialType union is valid", () => {
		const types: CredentialType[] = [
			"api_key",
			"oauth_token",
			"password",
			"token",
			"certificate",
		];
		expect(types).toHaveLength(5);
	});
});
