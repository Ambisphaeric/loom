import { ulid } from "ulidx";
import type {
	Channel,
	ChannelRegistration,
	ChannelManager,
	ChannelEvent,
	ChannelEventHandler,
	OutputRecipient,
	OutputPrimitive,
	ChannelSendOptions,
	ChannelSendResult,
	ChannelBatchResult,
	ChannelConfig,
	ChannelCapabilities,
} from "./types.js";

export const DEFAULT_CHANNEL_CAPABILITIES: ChannelCapabilities = {
	supportsText: true,
	supportsMarkdown: false,
	supportsHtml: false,
	supportsImages: true,
	supportsFiles: true,
	supportsAudio: false,
	supportsVideo: false,
	supportsLocation: false,
	supportsContacts: false,
	supportsCards: false,
	supportsButtons: false,
	supportsLists: false,
	supportsTemplates: false,
	supportsBatch: true,
};

export abstract class BaseChannel implements Channel {
	abstract readonly name: string;
	abstract readonly capabilities: ChannelCapabilities;
	protected initialized = false;
	protected config?: ChannelConfig;

	async initialize(config: ChannelConfig): Promise<void> {
		if (!config.enabled) {
			throw new Error(`Channel ${this.name} is disabled`);
		}
		this.config = config;
		this.initialized = true;
	}

	async send(
		recipient: OutputRecipient,
		content: OutputPrimitive,
		options?: ChannelSendOptions
	): Promise<ChannelSendResult> {
		if (!this.initialized) {
			throw new Error(`Channel ${this.name} not initialized`);
		}

		const isValid = await this.validateRecipient(recipient);
		if (!isValid) {
			return {
				success: false,
				error: "Invalid recipient",
				timestamp: Date.now(),
			};
		}

		const formatted = this.formatForChannel(content);
		return this.doSend(recipient, formatted, options);
	}

	async sendBatch(
		recipients: OutputRecipient[],
		content: OutputPrimitive,
		options?: ChannelSendOptions
	): Promise<ChannelBatchResult> {
		if (!this.capabilities.supportsBatch) {
			throw new Error(`Channel ${this.name} does not support batch sending`);
		}

		const results: ChannelSendResult[] = [];
		let succeeded = 0;
		let failed = 0;

		for (const recipient of recipients) {
			const isValid = await this.validateRecipient(recipient);
			if (!isValid) {
				results.push({
					success: false,
					error: "Invalid recipient",
					timestamp: Date.now(),
				});
				failed++;
				continue;
			}

			const sendResult = await this.send(recipient, content, options);
			results.push(sendResult);
			if (sendResult.success) {
				succeeded++;
			} else {
				failed++;
			}
		}

		return {
			total: recipients.length,
			succeeded,
			failed,
			results,
		};
	}

	async validateRecipient(recipient: OutputRecipient): Promise<boolean> {
		if (!recipient.id || recipient.id.trim() === "") {
			return false;
		}
		return this.doValidateRecipient(recipient);
	}

	formatForChannel(primitive: OutputPrimitive): OutputPrimitive {
		if (!this.capabilities.supportsMarkdown && primitive.kind === "markdown") {
			return { kind: "text", content: primitive.content };
		}
		if (!this.capabilities.supportsHtml && primitive.kind === "html") {
			return { kind: "text", content: primitive.content };
		}
		return primitive;
	}

	async healthCheck(): Promise<boolean> {
		if (!this.initialized) return false;
		return this.doHealthCheck();
	}

	async stop(): Promise<void> {
		this.initialized = false;
		this.config = undefined;
	}

	protected abstract doSend(
		recipient: OutputRecipient,
		content: OutputPrimitive,
		options?: ChannelSendOptions
	): Promise<ChannelSendResult>;

	protected abstract doSendBatch(
		recipients: OutputRecipient[],
		content: OutputPrimitive,
		options?: ChannelSendOptions
	): Promise<ChannelSendResult[]>;

	protected abstract doValidateRecipient(recipient: OutputRecipient): Promise<boolean>;

	protected abstract doHealthCheck(): Promise<boolean>;

	protected generateMessageId(): string {
		return ulid();
	}
}

export class ChannelManagerImpl implements ChannelManager {
	private channels: Map<string, Channel> = new Map();
	private registrations: Map<string, ChannelRegistration> = new Map();
	private eventHandlers: ChannelEventHandler[] = [];

	private emit(event: ChannelEvent): void {
		for (const handler of this.eventHandlers) {
			try {
				handler(event);
			} catch {
				// Silently ignore handler errors
			}
		}
	}

	onEvent(handler: ChannelEventHandler): void {
		this.eventHandlers.push(handler);
	}

	offEvent(handler: ChannelEventHandler): void {
		const index = this.eventHandlers.indexOf(handler);
		if (index !== -1) {
			this.eventHandlers.splice(index, 1);
		}
	}

	register(registration: ChannelRegistration): void {
		this.registrations.set(registration.name, registration);
		this.emit({ type: "channel_registered", name: registration.name });
	}

	unregister(name: string): boolean {
		const channel = this.channels.get(name);
		if (channel) {
			channel.stop();
			this.channels.delete(name);
		}
		const unregistered = this.registrations.delete(name);
		if (unregistered) {
			this.emit({ type: "channel_unregistered", name });
		}
		return unregistered;
	}

	async getOrCreate(name: string, config?: ChannelConfig): Promise<Channel | null> {
		const existing = this.channels.get(name);
		if (existing) return existing;

		const registration = this.registrations.get(name);
		if (!registration) return null;

		const channel = await registration.factory(config);
		if (config) {
			await channel.initialize(config);
		}
		this.channels.set(name, channel);
		return channel;
	}

	get(name: string): Channel | undefined {
		return this.channels.get(name);
	}

	getAll(): Channel[] {
		return [...this.channels.values()];
	}

	getSupportedChannels(): string[] {
		return [...this.registrations.keys()];
	}

	async initializeAll(configs: Map<string, ChannelConfig>): Promise<void> {
		for (const [name, config] of configs) {
			const channel = await this.getOrCreate(name, config);
			if (channel) {
				await channel.initialize(config);
			}
		}
	}

	async stopAll(): Promise<void> {
		for (const channel of this.channels.values()) {
			await channel.stop();
		}
	}
}

export function createChannelManager(): ChannelManager {
	return new ChannelManagerImpl();
}
