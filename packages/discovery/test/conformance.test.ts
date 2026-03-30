import { describe, it, expect, beforeEach } from "bun:test";
import {
	DiscoveryService,
	detectLLM,
	detectSTT,
	probePort,
	createDiscoveryService,
} from "../src/index.js";

describe("Discovery Service", () => {
	let discovery: DiscoveryService;

	beforeEach(() => {
		discovery = createDiscoveryService({ timeout: 100 });
	});

	describe("detectLLM", () => {
		it("should return not detected for unknown provider", async () => {
			const result = await detectLLM("unknown-provider", { timeout: 100 });
			expect(result.detected).toBe(false);
		});

		it("should detect or not detect local Ollama", async () => {
			const result = await detectLLM("ollama", { timeout: 100 });
			expect(typeof result.detected).toBe("boolean");
		});
	});

	describe("detectSTT", () => {
		it("should return not detected for unknown provider", async () => {
			const result = await detectSTT("unknown-provider", { timeout: 100 });
			expect(result.detected).toBe(false);
		});
	});

	describe("probePort", () => {
		it("should return false for unreachable port", async () => {
			const result = await probePort(99999);
			expect(result).toBe(false);
		});
	});

	describe("DiscoveryService", () => {
		it("should create discovery service", () => {
			expect(discovery).toBeDefined();
		});

		it("should discover services", async () => {
			const result = await discovery.discover();
			expect(result).toBeDefined();
			expect(result.services).toBeDefined();
			expect(result.systemInfo).toBeDefined();
			expect(result.timestamp).toBeGreaterThan(0);
		});

		it("should cache discovery results", async () => {
			const first = await discovery.discover();
			const second = await discovery.discover();
			expect(second.timestamp).toBe(first.timestamp);
		});

		it("should force refresh when requested", async () => {
			const first = await discovery.discover();
			const second = await discovery.discover(true);
			expect(second.timestamp).toBeGreaterThanOrEqual(first.timestamp);
		});

		it("should get running services", () => {
			const running = discovery.getRunningServices();
			expect(Array.isArray(running)).toBe(true);
		});

		it("should get services by type", () => {
			const llmServices = discovery.getServicesByType("llm");
			const sttServices = discovery.getServicesByType("stt");
			expect(Array.isArray(llmServices)).toBe(true);
			expect(Array.isArray(sttServices)).toBe(true);
		});

		it("should get cached services", async () => {
			await discovery.discover();
			const cached = discovery.getCachedServices();
			expect(Array.isArray(cached)).toBe(true);
		});
	});
});
