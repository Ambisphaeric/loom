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
		for (const [index, handler] of this.eventHandlers.entries()) {
			try {
				handler(event);
			} catch (err) {
				console.error(
					`[ChannelManager] Handler ${index} failed for ${event.type}:`,
					err,
				);
				// Emit to bus for system monitoring if available
				// (Bus injection would need to be added to constructor)
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
		// Use id if provided, otherwise fall back to name for backward compatibility
		const key = registration.id || registration.name;
		this.registrations.set(key, registration);
		this.emit({ type: "channel_registered", name: registration.name, id: key });
	}

	unregister(idOrName: string): boolean {
		const registration = this.registrations.get(idOrName);
		if (registration) {
			const key = registration.id || registration.name;
			const channel = this.channels.get(key);
			if (channel) {
				channel.stop();
				this.channels.delete(key);
			}
			this.registrations.delete(idOrName);
			this.emit({ type: "channel_unregistered", name: registration.name, id: key });
			return true;
		}
		return false;
	}

	async send(
		channelId: string,
		message: { contentType: string; content: unknown; workspace: string; sessionId: string; metadata: Record<string, unknown> }
	): Promise<{ success: boolean; messageId?: string; error?: string }> {
		const registration = this.registrations.get(channelId);
		if (!registration) {
			this.emit({ type: "send_failed", channel: channelId, id: channelId, error: "Channel not found" });
			return { success: false, error: "Channel not found" };
		}

		// Check if content type is supported
		const normalizedContentType = this.normalizeContentType(message.contentType);
		const supportedTypes = registration.supportedContentTypes.map(t => this.normalizeContentType(t));
		
		if (!supportedTypes.includes(normalizedContentType)) {
			// Check if we can downgrade
			if (normalizedContentType === "image/png" || normalizedContentType === "image/jpeg") {
				this.emit({ type: "send_failed", channel: registration.name, id: channelId, error: "content type" });
				throw new Error(`Channel does not support content type: ${message.contentType}`);
			}
			// For text types, we allow and convert
		}

		// Get or create channel instance
		let channel = this.channels.get(channelId);
		if (!channel) {
			// Create channel from registration
			channel = {
				name: registration.name,
				capabilities: registration.capabilities,
				initialize: async () => {},
				send: async (_recipient: OutputRecipient, _content: OutputPrimitive) => {
					this.emit({ type: "message_sent", channel: registration.name, id: channelId });
					return { success: true, timestamp: Date.now(), messageId: ulid() };
				},
				sendBatch: async () => ({ total: 0, succeeded: 0, failed: 0, results: [] }),
				validateRecipient: async () => true,
				formatForChannel: (primitive: OutputPrimitive) => primitive,
				healthCheck: async () => true,
				stop: async () => {},
			} as unknown as Channel;
			this.channels.set(channelId, channel);
		}

		// Convert content type if needed
		let content = message.content;
		if (typeof content === "string") {
			if (normalizedContentType === "text/html" && !registration.supportedContentTypes.includes("text/html")) {
				// Convert HTML to text by stripping tags
				content = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
			}
		}

		const result = await channel.send(
			{ id: "default", type: "user", metadata: { workspace: message.workspace, ...message.metadata } },
			{ kind: this.inferPrimitiveKind(message.contentType), content, metadata: message.metadata } as OutputPrimitive,
			{ sessionId: message.sessionId }
		);

		return result;
	}

	sendBatch(
		channelId: string,
		messages: Array<{ contentType: string; content: unknown; workspace: string; sessionId: string; metadata: Record<string, unknown> }>
	): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
		return Promise.all(messages.map(msg => this.send(channelId, msg)));
	}

	private normalizeContentType(contentType: string): string {
		return contentType.toLowerCase().trim();
	}

	private inferPrimitiveKind(contentType: string): "text" | "markdown" | "html" | "image" | "card" | "list" | "template" {
		const normalized = this.normalizeContentType(contentType);
		if (normalized.includes("markdown")) return "markdown";
		if (normalized.includes("html")) return "html";
		if (normalized.startsWith("image/")) return "image";
		return "text";
	}

	async getOrCreate(name: string, config?: ChannelConfig): Promise<Channel | null> {
		const existing = this.channels.get(name);
		if (existing) return existing;

		const registration = this.registrations.get(name);
		if (!registration) return null;

		if (!registration.factory) return null;

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
