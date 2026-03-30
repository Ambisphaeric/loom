import type { Plugin, PluginConfig } from "@enhancement/types";
import type { 
	LoadedPlugin, 
	PluginRegistration, 
	PluginLoaderOptions,
	CapabilityType,
	PluginStatus,
	CapabilityInfo
} from "./types.js";

const registeredPlugins = new Map<string, PluginRegistration>();

export class PluginLoader {
	private loaded = new Map<string, LoadedPlugin>();
	private options: PluginLoaderOptions;

	constructor(options: PluginLoaderOptions = {}) {
		this.options = {
			autoDiscover: options.autoDiscover ?? true,
			pluginsDir: options.pluginsDir,
		};
	}

	async discover(pluginPaths: string[]): Promise<string[]> {
		return pluginPaths.filter(async (path) => {
			try {
				await import(path);
				return true;
			} catch {
				return false;
			}
		});
	}

	async load(pluginPath: string): Promise<Plugin> {
		const mod = await import(pluginPath);
		const plugin: Plugin = mod.default ?? mod;

		this.validate(plugin, pluginPath);
		this.loaded.set(plugin.name, { plugin, path: pluginPath });
		return plugin;
	}

	async loadFromRegistration(name: string): Promise<Plugin | null> {
		const registration = registeredPlugins.get(name);
		if (!registration) {
			return null;
		}

		try {
			const plugin = await registration.factory();
			this.validate(plugin, `registration:${name}`);
			this.loaded.set(plugin.name, { plugin, path: `registration:${name}` });
			return plugin;
		} catch (err) {
			console.error(`[PluginLoader] Failed to load ${name}:`, err);
			return null;
		}
	}

	async initAll(plugins: Plugin[], config: PluginConfig): Promise<Plugin[]> {
		const initialized: Plugin[] = [];

		for (const plugin of plugins) {
			try {
				await plugin.init(config);
				// Add to loaded if not already there
				if (!this.loaded.has(plugin.name)) {
					this.loaded.set(plugin.name, { plugin, path: `inline:${plugin.name}` });
				}
				initialized.push(plugin);
			} catch (err) {
				console.error(
					`[PluginLoader] Failed to init ${plugin.name}:`,
					err instanceof Error ? err.message : err
				);
			}
		}

		return initialized;
	}

	async startAll(plugins: Plugin[]): Promise<void> {
		for (const plugin of plugins) {
			try {
				await plugin.start();
			} catch (err) {
				console.error(
					`[PluginLoader] Failed to start ${plugin.name}:`,
					err instanceof Error ? err.message : err
				);
			}
		}
	}

	async stopAll(plugins: Plugin[]): Promise<void> {
		for (const plugin of plugins) {
			try {
				await plugin.stop();
			} catch (err) {
				console.error(
					`[PluginLoader] Failed to stop ${plugin.name}:`,
					err instanceof Error ? err.message : err
				);
			}
		}
	}

	get(name: string): LoadedPlugin | undefined {
		return this.loaded.get(name);
	}

	getAll(): LoadedPlugin[] {
		return [...this.loaded.values()];
	}

	getLoadedPlugins(): Plugin[] {
		return [...this.loaded.values()].map((lp) => lp.plugin);
	}

	isLoaded(name: string): boolean {
		return this.loaded.has(name);
	}

	unload(name: string): boolean {
		return this.loaded.delete(name);
	}

	unloadAll(): void {
		this.loaded.clear();
	}

	private validate(plugin: Plugin, path: string): void {
		if (!plugin.name || typeof plugin.name !== "string") {
			throw new Error(`Plugin at ${path} missing 'name'`);
		}
		if (!plugin.version || typeof plugin.version !== "string") {
			throw new Error(`Plugin "${plugin.name}" missing 'version'`);
		}
		if (!plugin.capabilities || typeof plugin.capabilities !== "object") {
			throw new Error(`Plugin "${plugin.name}" missing 'capabilities'`);
		}
		if (typeof plugin.init !== "function") {
			throw new Error(`Plugin "${plugin.name}" missing 'init' method`);
		}
		if (typeof plugin.start !== "function") {
			throw new Error(`Plugin "${plugin.name}" missing 'start' method`);
		}
		if (typeof plugin.stop !== "function") {
			throw new Error(`Plugin "${plugin.name}" missing 'stop' method`);
		}
	}

	getCapabilities(plugin: Plugin): CapabilityInfo[] {
		const caps = plugin.capabilities;
		const capabilityTypes: CapabilityType[] = [
			"source",
			"fetch",
			"transform",
			"store",
			"tools",
			"credential",
			"trigger",
			"action",
			"modelProvider",
		];

		return capabilityTypes
			.filter((type) => type in caps && caps[type as keyof typeof caps] !== undefined)
			.map((type) => ({
				type,
				available: caps[type as keyof typeof caps] !== undefined,
			}));
	}

	getStatus(name: string): PluginStatus | null {
		const loaded = this.loaded.get(name);
		if (!loaded) {
			const registration = registeredPlugins.get(name);
			if (!registration) {
				return null;
			}
			return {
				name,
				loaded: false,
				enabled: registration.enabled ?? false,
				capabilities: [],
			};
		}

		return {
			name: loaded.plugin.name,
			loaded: true,
			enabled: true,
			capabilities: this.getCapabilities(loaded.plugin),
		};
	}

	getAllStatuses(): PluginStatus[] {
		const statuses: PluginStatus[] = [];

		for (const [name] of this.loaded) {
			const status = this.getStatus(name);
			if (status) {
				statuses.push(status);
			}
		}

		for (const [name, registration] of registeredPlugins) {
			if (!this.loaded.has(name)) {
				statuses.push({
					name,
					loaded: false,
					enabled: registration.enabled ?? false,
					capabilities: [],
				});
			}
		}

		return statuses;
	}
}

export function registerPlugin(registration: PluginRegistration): void {
	registeredPlugins.set(registration.manifest.name, registration);
}

export function unregisterPlugin(name: string): boolean {
	return registeredPlugins.delete(name);
}

export function getRegisteredPlugins(): string[] {
	return [...registeredPlugins.keys()];
}

export function isPluginRegistered(name: string): boolean {
	return registeredPlugins.has(name);
}

export function createPluginLoader(options?: PluginLoaderOptions): PluginLoader {
	return new PluginLoader(options);
}

export function createPluginConfig(
	workspace: string,
	globalConfig: Record<string, unknown>,
	pluginSettings?: Record<string, unknown>
): PluginConfig {
	return {
		workspace,
		globalConfig: globalConfig as any,
		pluginSettings: pluginSettings ?? {},
	};
}
