import type { RawChunk, Source } from "@enhancement/types";

export interface CaptureMode {
	screen: boolean;
	mic: boolean;
	systemAudio: boolean;
}

interface ScreenpipeChunk {
	type: "screenshot" | "audio";
	data: string;
	timestamp: string;
	metadata?: {
		window_title?: string;
		app_name?: string;
		device?: string;
	};
}

export interface ScreenpipeSourceOptions {
	workspace: string;
	sessionId?: string;
	port?: number;
	captureMode?: Partial<CaptureMode>;
}

export class ScreenpipeSource implements Source {
	produces: string[] = ["screenshot", "audio"];

	private emit: ((chunk: RawChunk) => void) | null = null;
	private ws: WebSocket | null = null;
	private workspace: string;
	private sessionId: string;
	private port: number;
	private retryCount = 0;
	private maxRetries = 5;
	private captureMode: CaptureMode = {
		screen: true,
		mic: true,
		systemAudio: true,
	};
	private modeChangeCallbacks: Set<() => void> = new Set();
	private isConnected = false;

	constructor(options: ScreenpipeSourceOptions) {
		this.workspace = options.workspace;
		this.sessionId = options.sessionId ?? "default";
		this.port = options.port ?? 13030;
		if (options.captureMode) {
			this.captureMode = { ...this.captureMode, ...options.captureMode };
		}
	}

	stream(emit: (chunk: RawChunk) => void): void {
		this.emit = emit;
		this.connect();
	}

	stop(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.emit = null;
		this.retryCount = 0;
		this.isConnected = false;
	}

	setCaptureMode(mode: Partial<CaptureMode>): void {
		const previousMode = { ...this.captureMode };
		this.captureMode = { ...this.captureMode, ...mode };

		if (JSON.stringify(previousMode) !== JSON.stringify(this.captureMode)) {
			this.modeChangeCallbacks.forEach((cb) => cb());
		}
	}

	getCaptureMode(): CaptureMode {
		return { ...this.captureMode };
	}

	onModeChange(callback: () => void): () => void {
		this.modeChangeCallbacks.add(callback);
		return () => {
			this.modeChangeCallbacks.delete(callback);
		};
	}

	isRunning(): boolean {
		return this.isConnected;
	}

	getPort(): number {
		return this.port;
	}

	private shouldCapture(type: ScreenpipeChunk["type"]): boolean {
		if (type === "screenshot") {
			return this.captureMode.screen;
		}
		if (type === "audio") {
			return this.captureMode.mic || this.captureMode.systemAudio;
		}
		return true;
	}

	private connect(): void {
		const screenpipeUrl = `ws://localhost:${this.port}/stream`;

		try {
			this.ws = new WebSocket(screenpipeUrl);

			this.ws.onopen = () => {
				console.log(`[Screenpipe:${this.port}] Connected to daemon`);
				this.retryCount = 0;
				this.isConnected = true;
			};

			this.ws.onmessage = (event) => {
				if (!this.emit) return;

				try {
					const data: ScreenpipeChunk = JSON.parse(event.data);

					if (!this.shouldCapture(data.type)) {
						return;
					}

					const metadata: Record<string, unknown> = {
						...data.metadata,
						screenpipePort: this.port,
						screenpipeInstance: "enhancement-managed",
					};

					if (data.type === "audio") {
						metadata.captureMic = this.captureMode.mic;
						metadata.captureSystemAudio = this.captureMode.systemAudio;
					}

					const chunk: RawChunk = {
						kind: "raw",
						source: "screenpipe",
						workspace: this.workspace,
						sessionId: this.sessionId,
						contentType: data.type,
						data: Buffer.from(data.data, "base64"),
						timestamp: new Date(data.timestamp).getTime(),
						generation: 0,
						metadata,
					};

					this.emit(chunk);
				} catch (err) {
					console.error(`[Screenpipe:${this.port}] Failed to parse message:`, err);
				}
			};

			this.ws.onerror = (error) => {
				console.error(`[Screenpipe:${this.port}] WebSocket error:`, error);
			};

			this.ws.onclose = () => {
				console.log(`[Screenpipe:${this.port}] Disconnected`);
				this.isConnected = false;

				if (this.retryCount < this.maxRetries && this.emit) {
					this.retryCount++;
					console.log(
						`[Screenpipe:${this.port}] Reconnecting (${this.retryCount}/${this.maxRetries})...`
					);
					setTimeout(() => this.connect(), 5000);
				} else if (this.retryCount >= this.maxRetries) {
					console.error(`[Screenpipe:${this.port}] Max retries reached`);
				}
			};
		} catch (err) {
			console.error(`[Screenpipe:${this.port}] Failed to connect:`, err);
		}
	}
}
