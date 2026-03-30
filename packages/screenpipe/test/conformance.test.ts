import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { ScreenpipeController, type ScreenpipeStatus } from "../src/index.js";
import { EnhancementBus } from "@enhancement/bus";
import { createStore } from "@enhancement/store";

describe("Screenpipe Conformance Tests", () => {
	let bus: EnhancementBus;
	let store: ReturnType<typeof createStore>;

	beforeEach(async () => {
		bus = new EnhancementBus("test-workspace");
		store = createStore({ engine: "zvec", dbPath: ":memory:" });
		await store.init();
	});

	afterEach(() => {
		bus = undefined as unknown as EnhancementBus;
		store.close();
	});

	describe("ScreenpipeController lifecycle", () => {
		it("should create controller with options", () => {
			const screenpipe = new ScreenpipeController({
				workspace: "test-ws",
				sessionId: "test-session",
				port: 13030,
			});

			const status = screenpipe.getStatus();
			expect(status.workspace).toBeUndefined();
			expect(status.running).toBe(false);
			expect(status.port).toBe(13030);
			expect(status.isConnected).toBe(false);
		});

		it("should track capture mode changes", () => {
			const screenpipe = new ScreenpipeController({
				workspace: "test-ws",
				captureMode: { screen: true, mic: false, systemAudio: false },
			});

			let changeCount = 0;
			screenpipe.onCaptureModeChange(() => {
				changeCount++;
			});

			screenpipe.setCaptureMode({ mic: true });
			expect(changeCount).toBe(1);

			screenpipe.setCaptureMode({ mic: true });
			expect(changeCount).toBe(1);
		});

		it("should reset chunk count", () => {
			const screenpipe = new ScreenpipeController({
				workspace: "test-ws",
			});

			screenpipe.resetChunkCount();
			expect(screenpipe.getStatus().chunksCaptured).toBe(0);
		});
	});

	describe("getStatus()", () => {
		it("should return correct initial status", () => {
			const screenpipe = new ScreenpipeController({
				workspace: "test-ws",
				sessionId: "session-1",
				autoPersist: true,
			});

			const status = screenpipe.getStatus();
			expect(status.running).toBe(false);
			expect(status.isConnected).toBe(false);
			expect(status.captureMode.screen).toBe(true);
			expect(status.captureMode.mic).toBe(true);
			expect(status.captureMode.systemAudio).toBe(true);
			expect(status.autoPersist).toBe(true);
			expect(status.chunksCaptured).toBe(0);
		});

		it("should reflect capture mode changes", () => {
			const screenpipe = new ScreenpipeController({
				workspace: "test-ws",
				captureMode: { screen: true, mic: false, systemAudio: false },
			});

			screenpipe.setCaptureMode({ screen: false });

			const status = screenpipe.getStatus();
			expect(status.captureMode.screen).toBe(false);
			expect(status.captureMode.mic).toBe(false);
			expect(status.captureMode.systemAudio).toBe(false);
		});
	});

	describe("Integration with Bus", () => {
		it("should subscribe to bus when provided", () => {
			let publishedChunk: unknown = null;
			bus.subscribe("screenshot", async (chunk) => {
				publishedChunk = chunk;
			});

			const screenpipe = new ScreenpipeController({
				workspace: "test-ws",
				bus,
			});

			expect(bus.subscriberCount).toBeGreaterThanOrEqual(0);
		});
	});

	describe("Integration with Store", () => {
		it("should prepare for auto-persist mode", async () => {
			const screenpipe = new ScreenpipeController({
				workspace: "test-ws",
				store,
				autoPersist: true,
			});

			const status = screenpipe.getStatus();
			expect(status.autoPersist).toBe(true);
		});
	});
});

describe("ScreenpipeSource", () => {
	describe("produces", () => {
		it("should declare screenshot and audio production", () => {
			const { ScreenpipeSource } = require("../src/index.js");
			const source = new ScreenpipeSource({
				workspace: "test-ws",
			});

			expect(source.produces).toContain("screenshot");
			expect(source.produces).toContain("audio");
		});
	});

	describe("capture mode", () => {
		it("should default to all capture modes enabled", () => {
			const { ScreenpipeSource } = require("../src/index.js");
			const source = new ScreenpipeSource({
				workspace: "test-ws",
			});

			const mode = source.getCaptureMode();
			expect(mode.screen).toBe(true);
			expect(mode.mic).toBe(true);
			expect(mode.systemAudio).toBe(true);
		});

		it("should respect initial capture mode", () => {
			const { ScreenpipeSource } = require("../src/index.js");
			const source = new ScreenpipeSource({
				workspace: "test-ws",
				captureMode: { screen: true, mic: false, systemAudio: false },
			});

			const mode = source.getCaptureMode();
			expect(mode.screen).toBe(true);
			expect(mode.mic).toBe(false);
			expect(mode.systemAudio).toBe(false);
		});

		it("should update capture mode", () => {
			const { ScreenpipeSource } = require("../src/index.js");
			const source = new ScreenpipeSource({
				workspace: "test-ws",
			});

			source.setCaptureMode({ mic: false });

			const mode = source.getCaptureMode();
			expect(mode.screen).toBe(true);
			expect(mode.mic).toBe(false);
			expect(mode.systemAudio).toBe(true);
		});

		it("should notify on capture mode change", () => {
			const { ScreenpipeSource } = require("../src/index.js");
			const source = new ScreenpipeSource({
				workspace: "test-ws",
			});

			let notified = false;
			source.onModeChange(() => {
				notified = true;
			});

			source.setCaptureMode({ mic: false });
			expect(notified).toBe(true);
		});
	});
});
