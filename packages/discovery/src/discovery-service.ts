import type {
	DiscoveryResult,
	DiscoveryOptions,
	DiscoveredService,
	SystemInfo,
} from "./types.js";
import {
	detectAllServices,
	detectLLM,
	detectSTT,
} from "./detection.js";
import { getSystemInfo, installService } from "./system.js";

export class DiscoveryService {
	private options: DiscoveryOptions;
	private cachedServices: DiscoveredService[] = [];
	private lastDiscovery: number = 0;
	private cacheTimeout: number = 30000;

	constructor(options: DiscoveryOptions = {}) {
		this.options = {
			timeout: 500,
			includeModels: true,
			...options,
		};
	}

	async discover(forceRefresh: boolean = false): Promise<DiscoveryResult> {
		const now = Date.now();

		if (!forceRefresh && now - this.lastDiscovery < this.cacheTimeout && this.cachedServices.length > 0) {
			return {
				services: this.cachedServices,
				systemInfo: await getSystemInfo(),
				timestamp: this.lastDiscovery,
			};
		}

		const services = await detectAllServices(this.options);
		const systemInfo = await getSystemInfo();

		this.cachedServices = services;
		this.lastDiscovery = now;

		return {
			services,
			systemInfo,
			timestamp: now,
		};
	}

	async detectLLM(provider: string): Promise<ReturnType<typeof detectLLM>> {
		return detectLLM(provider, this.options);
	}

	async detectSTT(provider: string): Promise<ReturnType<typeof detectSTT>> {
		return detectSTT(provider, this.options);
	}

	async install(service: "ollama" | "lm-studio" | "screenpipe"): Promise<{
		success: boolean;
		message: string;
	}> {
		const result = await installService(service);
		if (result.success) {
			await this.discover(true);
		}
		return result;
	}

	getCachedServices(): DiscoveredService[] {
		return [...this.cachedServices];
	}

	getRunningServices(): DiscoveredService[] {
		return this.cachedServices.filter((s) => s.status === "running");
	}

	getServicesByType(type: "llm" | "stt" | "embedding"): DiscoveredService[] {
		return this.cachedServices.filter((s) => s.type === type);
	}
}

export function createDiscoveryService(options?: DiscoveryOptions): DiscoveryService {
	return new DiscoveryService(options);
}
