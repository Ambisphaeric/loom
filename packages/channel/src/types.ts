// Minimal RawChunk interface for bus error emission
interface RawChunk {
	kind: "raw";
	source: string;
	workspace: string;
	sessionId: string;
	contentType: string;
	data: string | Buffer;
	timestamp: number;
	generation: number;
	metadata?: Record<string, unknown>;
}

// Bus interface for error emission (matches @loomai/types Bus interface)
export interface Bus {
	readonly workspace: string;
	publish(chunk: RawChunk): void;
}

export { type RawChunk };

export type OutputPrimitive =
	| { kind: "text"; content: string }
	| { kind: "markdown"; content: string }
	| { kind: "html"; content: string }
	| { kind: "image"; url: string; alt?: string }
	| { kind: "file"; url: string; name: string; mimeType: string }
	| { kind: "audio"; url: string; duration?: number }
	| { kind: "video"; url: string; duration?: number }
	| { kind: "location"; latitude: number; longitude: number; label?: string }
	| { kind: "contact"; name: string; phone?: string; email?: string }
	| { kind: "card"; title: string; description?: string; image?: string; actions?: OutputAction[] }
	| { kind: "button"; label: string; value: string }
	| { kind: "list"; title: string; items: OutputPrimitive[] }
	| { kind: "template"; name: string; parameters: Record<string, unknown> };

export interface OutputAction {
	type: "url" | "callback" | "reply" | "share" | "dial";
	label: string;
	value: string;
}

export interface OutputEnvelope {
	id: string;
	channel: string;
	channelId: string;
	recipient: OutputRecipient;
	content: OutputPrimitive | OutputPrimitive[];
	metadata?: Record<string, unknown>;
	priority?: "low" | "normal" | "high" | "urgent";
	scheduledAt?: number;
	expiresAt?: number;
	createdAt: number;
}

export interface OutputRecipient {
	type: "user" | "group" | "channel" | "broadcast";
	id: string;
	name?: string;
	metadata?: Record<string, unknown>;
}

export interface ChannelCapabilities {
	supportsText: boolean;
	supportsMarkdown: boolean;
	supportsHtml: boolean;
	supportsImages: boolean;
	supportsFiles: boolean;
	supportsAudio: boolean;
	supportsVideo: boolean;
	supportsLocation: boolean;
	supportsContacts: boolean;
	supportsCards: boolean;
	supportsButtons: boolean;
	supportsLists: boolean;
	supportsTemplates: boolean;
	supportsBatch: boolean;
	maxMessageLength?: number;
	maxBatchSize?: number;
}

export interface ChannelSendOptions {
	priority?: "low" | "normal" | "high" | "urgent";
	scheduledAt?: number;
	expiresAt?: number;
	replyTo?: string;
	threadId?: string;
	sessionId?: string;
	metadata?: Record<string, unknown>;
}

export interface ChannelSendResult {
	success: boolean;
	messageId?: string;
	channelMessageId?: string;
	error?: string;
	timestamp: number;
}

export interface ChannelBatchResult {
	total: number;
	succeeded: number;
	failed: number;
	results: ChannelSendResult[];
}

export interface ChannelConfig {
	workspace: string;
	enabled: boolean;
	credentials?: Record<string, unknown>;
	settings?: Record<string, unknown>;
}

export interface Channel {
	readonly name: string;
	readonly capabilities: ChannelCapabilities;

	initialize(config: ChannelConfig): Promise<void>;
	send(recipient: OutputRecipient, content: OutputPrimitive, options?: ChannelSendOptions): Promise<ChannelSendResult>;
	sendBatch(recipients: OutputRecipient[], content: OutputPrimitive, options?: ChannelSendOptions): Promise<ChannelBatchResult>;
	validateRecipient(recipient: OutputRecipient): Promise<boolean>;
	formatForChannel(primitive: OutputPrimitive): OutputPrimitive;
	healthCheck(): Promise<boolean>;
	stop(): Promise<void>;
}

export interface ChannelRegistration {
	id: string;
	name: string;
	version?: string;
	factory?: (config?: ChannelConfig) => Promise<Channel>;
	supportedContentTypes: string[];
	capabilities: ChannelCapabilities;
	renderer?: { render: (content: unknown) => Promise<string> };
	description?: string;
}

export interface ChannelManager {
	register(registration: ChannelRegistration): void;
	unregister(id: string): boolean;
	get(name: string): Channel | undefined;
	getAll(): Channel[];
	getSupportedChannels(): string[];
	onEvent(handler: ChannelEventHandler): void;
	offEvent(handler: ChannelEventHandler): void;
	send(
		channelId: string,
		message: { contentType: string; content: unknown; workspace: string; sessionId: string; metadata: Record<string, unknown> }
	): Promise<{ success: boolean; messageId?: string; error?: string }>;
	sendBatch(
		channelId: string,
		messages: Array<{ contentType: string; content: unknown; workspace: string; sessionId: string; metadata: Record<string, unknown> }>
	): Promise<Array<{ success: boolean; messageId?: string; error?: string }>>;
	/**
	 * Emit channel error events to the bus for system-wide observability.
	 * Called internally when channel operations fail.
	 */
	emitToBus?(event: ChannelEvent): void;
}

export interface ChannelManagerOptions {
	/**
	 * Optional bus instance for emitting channel error events.
	 * When provided, channel failures will be published as bus events
	 * for system-wide observability and reactive handling.
	 */
	bus?: Bus;
	/**
	 * Workspace identifier for bus events.
	 * Required when bus is provided.
	 */
	workspace?: string;
}

export type ChannelEvent =
	| { type: "message_sent"; channel: string; id: string; messageId?: string; recipientId?: string }
	| { type: "message_failed"; channel: string; id: string; error: string; recipientId?: string }
	| { type: "send_failed"; channel: string; id: string; error: string }
	| { type: "batch_completed"; channel: string; id: string; succeeded?: number; failed?: number }
	| { type: "channel_registered"; name: string; id: string }
	| { type: "channel_unregistered"; name: string; id: string };

export interface ChannelEventHandler {
	(event: ChannelEvent): void;
}
