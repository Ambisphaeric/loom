import type { ModelPurpose } from "@enhancement/types";

export interface DiscoveredService {
	name: string;
	type: "llm" | "stt" | "embedding";
	url: string;
	port: number;
	version?: string;
	models?: string[];
	status: "running" | "stopped" | "error";
	error?: string;
}

export interface SystemInfo {
	platform: "darwin" | "linux" | "windows";
	arch: string;
	cpus: number;
	memory: number;
	screenpipeAvailable: boolean;
	ollamaInstalled: boolean;
	lmStudioInstalled: boolean;
}

export interface InstallerResult {
	success: boolean;
	message: string;
	installedPath?: string;
}

export interface DiscoveryOptions {
	timeout?: number;
	includeModels?: boolean;
}

export interface DiscoveryResult {
	services: DiscoveredService[];
	systemInfo: SystemInfo;
	timestamp: number;
}

export interface LLMDetectionResult {
	detected: boolean;
	provider?: string;
	models?: string[];
	url?: string;
}

export interface STTDetectionResult {
	detected: boolean;
	provider?: string;
	model?: string;
}
