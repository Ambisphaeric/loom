import type { RawChunk, Bus, BusHandler } from "@enhancement/types";
import type { EnhancementStore } from "@enhancement/store";
import { ScreenpipeSource, type CaptureMode, type ScreenpipeSourceOptions } from "./screenpipe-source.js";

export interface ScreenpipeOptions {
	workspace: string;
	sessionId?: string;
	port?: number;
	captureMode?: Partial<CaptureMode>;
	bus?: Bus;
	store?: EnhancementStore;
	autoPersist?: boolean;
}

export interface ScreenpipeStatus {
	running: boolean;
	port: number | null;
	isConnected: boolean;
	captureMode: CaptureMode;
	autoPersist: boolean;
	chunksCaptured: number;
}

export class ScreenpipeController {
	private source: ScreenpipeSource;
	private bus?: Bus;
	private store?: EnhancementStore;
	private autoPersist: boolean;
	private chunksCaptured = 0;
	private screenshotHandler?: BusHandler;
	private audioHandler?: BusHandler;

	constructor(options: ScreenpipeOptions) {
		const sourceOptions: ScreenpipeSourceOptions = {
			workspace: options.workspace,
			sessionId: options.sessionId,
			port: options.port,
			captureMode: options.captureMode,
		};

		this.source = new ScreenpipeSource(sourceOptions);
		this.bus = options.bus;
		this.store = options.store;
		this.autoPersist = options.autoPersist ?? false;
	}

	startCapture(): void {
		if (this.bus) {
			this.screenshotHandler = async (chunk: RawChunk) => {
				this.chunksCaptured++;
				if (this.autoPersist && this.store) {
					await this.persistChunk(chunk);
				}
			};

			this.audioHandler = async (chunk: RawChunk) => {
				this.chunksCaptured++;
				if (this.autoPersist && this.store) {
					await this.persistChunk(chunk);
				}
			};

			this.bus.subscribe("screenshot", this.screenshotHandler);
			this.bus.subscribe("audio", this.audioHandler);
		}

		this.source.stream(async (chunk: RawChunk) => {
			this.chunksCaptured++;

			if (this.bus) {
				this.bus.publish(chunk);
			}

			if (this.autoPersist && this.store) {
				await this.persistChunk(chunk);
			}
		});
	}

	stopCapture(): void {
		this.source.stop();
		if (this.bus && this.screenshotHandler) {
			this.bus.unsubscribe("screenshot", this.screenshotHandler);
			this.screenshotHandler = undefined;
		}
		if (this.bus && this.audioHandler) {
			this.bus.unsubscribe("audio", this.audioHandler);
			this.audioHandler = undefined;
		}
	}

	getStatus(): ScreenpipeStatus {
		return {
			running: this.source.isRunning(),
			port: this.source.getPort(),
			isConnected: this.source.isRunning(),
			captureMode: this.source.getCaptureMode(),
			autoPersist: this.autoPersist,
			chunksCaptured: this.chunksCaptured,
		};
	}

	setCaptureMode(mode: Partial<CaptureMode>): void {
		this.source.setCaptureMode(mode);
	}

	getCaptureMode(): CaptureMode {
		return this.source.getCaptureMode();
	}

	onCaptureModeChange(callback: () => void): () => void {
		return this.source.onModeChange(callback);
	}

	resetChunkCount(): void {
		this.chunksCaptured = 0;
	}

	private async persistChunk(chunk: RawChunk): Promise<void> {
		if (!this.store) return;

		try {
			const contextChunk = {
				kind: "context" as const,
				id: `screenpipe-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				source: chunk.source,
				workspace: chunk.workspace,
				sessionId: chunk.sessionId,
				content: typeof chunk.data === "string" 
					? chunk.data 
					: chunk.data.toString("base64"),
				contentType: chunk.contentType,
				timestamp: chunk.timestamp,
				generation: chunk.generation,
				metadata: chunk.metadata,
			};

			await this.store.store(contextChunk);
		} catch (err) {
			console.error("[Screenpipe] Failed to persist chunk:", err);
		}
	}
}

export function createScreenpipe(options: ScreenpipeOptions): ScreenpipeController {
	return new ScreenpipeController(options);
}
