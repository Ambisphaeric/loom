import type { Plugin, PluginConfig, PluginCapabilities } from "@enhancement/types";

export interface LoadedPlugin {
	plugin: Plugin;
	path: string;
}

export interface PluginManifest {
	name: string;
	version: string;
	description?: string;
	capabilities: (keyof PluginCapabilities)[];
	dependencies?: string[];
}

export interface PluginRegistration {
	manifest: PluginManifest;
	factory: () => Promise<Plugin>;
	enabled?: boolean;
}

export interface PluginLoaderOptions {
	autoDiscover?: boolean;
	pluginsDir?: string;
}

export type CapabilityType = "source" | "fetch" | "transform" | "store" | "tools" | "credential" | "trigger" | "action" | "modelProvider";

export interface CapabilityInfo {
	type: CapabilityType;
	available: boolean;
}

export interface PluginStatus {
	name: string;
	loaded: boolean;
	enabled: boolean;
	capabilities: CapabilityInfo[];
	error?: string;
}
