import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	PluginLoader,
	createPluginLoader,
	registerPlugin,
	unregisterPlugin,
	getRegisteredPlugins,
	isPluginRegistered,
	createPluginConfig,
} from "../src/index.js";
import type { Plugin, PluginConfig } from "@enhancement/types";

function createMockPlugin(name: string, version: string = "0.1.0"): Plugin {
	return {
		name,
		version,
		permissions: ["network"],
		capabilities: {
			tools: {
				tools: () => [],
			},
		},
		async init(_config: PluginConfig) {},
		async start() {},
		async stop() {},
	};
}

describe("PluginLoader", () => {
	let loader: PluginLoader;

	beforeEach(() => {
		loader = createPluginLoader();
	});

	afterEach(() => {
		loader.unloadAll();
	});

	describe("basic operations", () => {
		it("should create a loader instance", () => {
			expect(loader).toBeDefined();
			expect(loader.getAll()).toEqual([]);
		});

		it("should get loaded plugins", () => {
			expect(loader.getLoadedPlugins()).toEqual([]);
			expect(loader.isLoaded("test")).toBe(false);
		});

		it("should unload all plugins", () => {
			loader.unloadAll();
			expect(loader.getAll()).toEqual([]);
		});
	});

	describe("plugin initialization", () => {
		it("should initialize plugins with config", async () => {
			const plugin = createMockPlugin("test-plugin");
			const config = createPluginConfig("test-workspace", {});

			const initialized = await loader.initAll([plugin], config);
			expect(initialized.length).toBe(1);
			expect(initialized[0].name).toBe("test-plugin");
		});

		it("should handle init errors gracefully", async () => {
			const failingPlugin: Plugin = {
				...createMockPlugin("failing"),
				init: async () => {
					throw new Error("Init failed");
				},
			};
			const config = createPluginConfig("test-workspace", {});

			const initialized = await loader.initAll([failingPlugin], config);
			expect(initialized.length).toBe(0);
		});

		it("should start all initialized plugins", async () => {
			const plugin = createMockPlugin("startable");
			const config = createPluginConfig("test-workspace", {});

			await loader.initAll([plugin], config);
			await loader.startAll([plugin]);

			expect(plugin.name).toBe("startable");
		});

		it("should stop all plugins", async () => {
			const plugin = createMockPlugin("stoppable");
			const config = createPluginConfig("test-workspace", {});

			await loader.initAll([plugin], config);
			await loader.startAll([plugin]);
			await loader.stopAll([plugin]);
		});
	});

	describe("capability detection", () => {
		it("should detect capabilities", () => {
			const plugin = createMockPlugin("capable");
			const capabilities = loader.getCapabilities(plugin);

			expect(capabilities).toContainEqual({ type: "tools", available: true });
		});

		it("should return empty capabilities for empty plugin", () => {
			const plugin: Plugin = {
				name: "empty",
				version: "0.1.0",
				permissions: [],
				capabilities: {},
				async init() {},
				async start() {},
				async stop() {},
			};
			const capabilities = loader.getCapabilities(plugin);
			expect(capabilities.length).toBe(0);
		});
	});

	describe("plugin status", () => {
		it("should return null for unknown plugin", () => {
			const status = loader.getStatus("unknown");
			expect(status).toBeNull();
		});

		it("should return status for loaded plugin", async () => {
			const plugin = createMockPlugin("status-plugin");
			const config = createPluginConfig("test-workspace", {});

			await loader.initAll([plugin], config);

			const status = loader.getStatus("status-plugin");
			expect(status).not.toBeNull();
			expect(status?.loaded).toBe(true);
			expect(status?.enabled).toBe(true);
			expect(status?.name).toBe("status-plugin");
		});

		it("should return all statuses", async () => {
			const plugin1 = createMockPlugin("plugin-1");
			const plugin2 = createMockPlugin("plugin-2");
			const config = createPluginConfig("test-workspace", {});

			await loader.initAll([plugin1, plugin2], config);

			const statuses = loader.getAllStatuses();
			expect(statuses.length).toBeGreaterThanOrEqual(2);
		});
	});
});

describe("Plugin Registration", () => {
	afterEach(() => {
		unregisterPlugin("test-reg-plugin");
	});

	it("should register and unregister plugins", () => {
		registerPlugin({
			manifest: {
				name: "test-reg-plugin",
				version: "1.0.0",
				capabilities: ["tools"],
			},
			factory: async () => createMockPlugin("test-reg-plugin"),
		});

		expect(isPluginRegistered("test-reg-plugin")).toBe(true);
		expect(getRegisteredPlugins()).toContain("test-reg-plugin");

		unregisterPlugin("test-reg-plugin");
		expect(isPluginRegistered("test-reg-plugin")).toBe(false);
	});

	it("should return false for unregistered plugins", () => {
		expect(isPluginRegistered("definitely-not-registered")).toBe(false);
	});
});

describe("createPluginConfig", () => {
	it("should create a valid plugin config", () => {
		const config = createPluginConfig("workspace-1", { defaultModel: "gpt-4" });

		expect(config.workspace).toBe("workspace-1");
		expect(config.globalConfig.defaultModel).toBe("gpt-4");
		expect(config.pluginSettings).toEqual({});
	});

	it("should include plugin settings", () => {
		const config = createPluginConfig("workspace-1", {}, { customSetting: true });

		expect(config.pluginSettings.customSetting).toBe(true);
	});
});
