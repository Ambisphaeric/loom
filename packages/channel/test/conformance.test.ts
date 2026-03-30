import { describe, it, expect, beforeEach } from "bun:test";
import {
	BaseChannel,
	ChannelManagerImpl,
	createChannelManager,
	DEFAULT_CHANNEL_CAPABILITIES,
	type OutputRecipient,
	type OutputPrimitive,
	type ChannelConfig,
	type ChannelRegistration,
} from "../src/index.js";

class MockChannel extends BaseChannel {
	readonly name = "mock";
	readonly capabilities = DEFAULT_CHANNEL_CAPABILITIES;

	private sentMessages: Array<{
		recipient: OutputRecipient;
		content: OutputPrimitive;
	}> = [];

	protected async doSend(
		recipient: OutputRecipient,
		content: OutputPrimitive
	): Promise<{ success: boolean; messageId?: string; error?: string; timestamp: number }> {
		this.sentMessages.push({ recipient, content });
		return {
			success: true,
			messageId: this.generateMessageId(),
			timestamp: Date.now(),
		};
	}

	protected async doSendBatch(
		recipients: OutputRecipient[],
		content: OutputPrimitive
	): Promise<Array<{ success: boolean; messageId?: string; error?: string; timestamp: number }>> {
		return recipients.map((recipient) => {
			this.sentMessages.push({ recipient, content });
			return {
				success: true,
				messageId: this.generateMessageId(),
				timestamp: Date.now(),
			};
		});
	}

	protected async doValidateRecipient(recipient: OutputRecipient): Promise<boolean> {
		return recipient.id.startsWith("valid-");
	}

	protected async doHealthCheck(): Promise<boolean> {
		return true;
	}

	getSentMessages() {
		return this.sentMessages;
	}

	clearMessages() {
		this.sentMessages = [];
	}
}

describe("BaseChannel", () => {
	let channel: MockChannel;

	beforeEach(() => {
		channel = new MockChannel();
	});

	describe("initialization", () => {
		it("should initialize with valid config", async () => {
			const config: ChannelConfig = {
				workspace: "test-workspace",
				enabled: true,
			};

			await channel.initialize(config);
			expect(channel.healthCheck()).resolves.toBe(true);
		});

		it("should reject disabled config", async () => {
			const config: ChannelConfig = {
				workspace: "test-workspace",
				enabled: false,
			};

			await expect(channel.initialize(config)).rejects.toThrow();
		});
	});

	describe("send", () => {
		it("should send message to valid recipient", async () => {
			await channel.initialize({ workspace: "test", enabled: true });

			const recipient: OutputRecipient = {
				type: "user",
				id: "valid-user-123",
			};
			const content: OutputPrimitive = { kind: "text", content: "Hello" };

			const result = await channel.send(recipient, content);
			expect(result.success).toBe(true);
			expect(result.messageId).toBeDefined();
		});

		it("should reject invalid recipient", async () => {
			await channel.initialize({ workspace: "test", enabled: true });

			const recipient: OutputRecipient = {
				type: "user",
				id: "invalid",
			};
			const content: OutputPrimitive = { kind: "text", content: "Hello" };

			const result = await channel.send(recipient, content);
			expect(result.success).toBe(false);
			expect(result.error).toBe("Invalid recipient");
		});

		it("should throw when not initialized", async () => {
			const recipient: OutputRecipient = { type: "user", id: "valid-user" };
			const content: OutputPrimitive = { kind: "text", content: "Hello" };

			await expect(channel.send(recipient, content)).rejects.toThrow();
		});
	});

	describe("sendBatch", () => {
		it("should send to multiple recipients", async () => {
			await channel.initialize({ workspace: "test", enabled: true });

			const recipients: OutputRecipient[] = [
				{ type: "user", id: "valid-user-1" },
				{ type: "user", id: "valid-user-2" },
				{ type: "user", id: "valid-user-3" },
			];
			const content: OutputPrimitive = { kind: "text", content: "Batch message" };

			const result = await channel.sendBatch(recipients, content);

			expect(result.total).toBe(3);
			expect(result.succeeded).toBe(3);
			expect(result.failed).toBe(0);
			expect(result.results.length).toBe(3);
		});

		it("should handle partial failures in batch", async () => {
			await channel.initialize({ workspace: "test", enabled: true });

			const recipients: OutputRecipient[] = [
				{ type: "user", id: "valid-user-1" },
				{ type: "user", id: "invalid" },
				{ type: "user", id: "valid-user-3" },
			];
			const content: OutputPrimitive = { kind: "text", content: "Batch message" };

			const result = await channel.sendBatch(recipients, content);

			expect(result.total).toBe(3);
			expect(result.succeeded).toBe(2);
			expect(result.failed).toBe(1);
		});
	});

	describe("formatForChannel", () => {
		it("should convert markdown to text when not supported", async () => {
			const channel = new MockChannel();
			await channel.initialize({ workspace: "test", enabled: true });

			const markdown: OutputPrimitive = { kind: "markdown", content: "**bold**" };
			const formatted = channel.formatForChannel(markdown);

			expect(formatted.kind).toBe("text");
			expect((formatted as { content: string }).content).toBe("**bold**");
		});
	});

	describe("stop", () => {
		it("should stop channel", async () => {
			await channel.initialize({ workspace: "test", enabled: true });
			await channel.stop();

			expect(channel.healthCheck()).resolves.toBe(false);
		});
	});
});

describe("ChannelManager", () => {
	let manager: ChannelManagerImpl;

	beforeEach(() => {
		manager = createChannelManager();
	});

	describe("registration", () => {
		it("should register a channel", () => {
			const registration: ChannelRegistration = {
				id: "test-channel",
				name: "test-channel",
				version: "1.0.0",
				factory: async () => new MockChannel(),
				supportedContentTypes: ["text/plain"],
				capabilities: DEFAULT_CHANNEL_CAPABILITIES,
			};

			manager.register(registration);
			expect(manager.getSupportedChannels()).toContain("test-channel");
		});

		it("should unregister a channel", () => {
			const registration: ChannelRegistration = {
				id: "test-channel",
				name: "test-channel",
				version: "1.0.0",
				factory: async () => new MockChannel(),
				supportedContentTypes: ["text/plain"],
				capabilities: DEFAULT_CHANNEL_CAPABILITIES,
			};

			manager.register(registration);
			expect(manager.unregister("test-channel")).toBe(true);
			expect(manager.getSupportedChannels()).not.toContain("test-channel");
		});

		it("should return false when unregistering non-existent channel", () => {
			expect(manager.unregister("non-existent")).toBe(false);
		});
	});

	describe("getOrCreate", () => {
		it("should create channel from registration", async () => {
			const registration: ChannelRegistration = {
				id: "test-channel",
				name: "test-channel",
				version: "1.0.0",
				factory: async () => new MockChannel(),
				supportedContentTypes: ["text/plain"],
				capabilities: DEFAULT_CHANNEL_CAPABILITIES,
			};

			manager.register(registration);
			const channel = await manager.getOrCreate("test-channel");

			expect(channel).not.toBeNull();
			expect(channel?.name).toBe("mock");
		});

		it("should return null for unregistered channel", async () => {
			const channel = await manager.getOrCreate("non-existent");
			expect(channel).toBeNull();
		});

		it("should return existing channel on subsequent calls", async () => {
			const registration: ChannelRegistration = {
				id: "test-channel",
				name: "test-channel",
				version: "1.0.0",
				factory: async () => new MockChannel(),
				supportedContentTypes: ["text/plain"],
				capabilities: DEFAULT_CHANNEL_CAPABILITIES,
			};

			manager.register(registration);
			const channel1 = await manager.getOrCreate("test-channel");
			const channel2 = await manager.getOrCreate("test-channel");

			expect(channel1).toBe(channel2);
		});
	});

	describe("getAll", () => {
		it("should return all initialized channels", async () => {
			const registration1: ChannelRegistration = {
				id: "channel-1",
				name: "channel-1",
				version: "1.0.0",
				factory: async () => new MockChannel(),
				supportedContentTypes: ["text/plain"],
				capabilities: DEFAULT_CHANNEL_CAPABILITIES,
			};
			const registration2: ChannelRegistration = {
				id: "channel-2",
				name: "channel-2",
				version: "1.0.0",
				factory: async () => new MockChannel(),
				supportedContentTypes: ["text/plain"],
				capabilities: DEFAULT_CHANNEL_CAPABILITIES,
			};

			manager.register(registration1);
			manager.register(registration2);

			await manager.getOrCreate("channel-1");
			await manager.getOrCreate("channel-2");

			const channels = manager.getAll();
			expect(channels.length).toBe(2);
		});
	});

	describe("event handling", () => {
		it("should emit events", async () => {
			const events: Array<{ type: string }> = [];
			manager.onEvent((event) => events.push(event as { type: string }));

			const registration: ChannelRegistration = {
				id: "test-channel",
				name: "test-channel",
				version: "1.0.0",
				factory: async () => new MockChannel(),
				supportedContentTypes: ["text/plain"],
				capabilities: DEFAULT_CHANNEL_CAPABILITIES,
			};

			manager.register(registration);
			expect(events.some((e) => e.type === "channel_registered")).toBe(true);

			manager.unregister("test-channel");
			expect(events.some((e) => e.type === "channel_unregistered")).toBe(true);
		});

		it("should remove event handler", () => {
			const events: Array<{ type: string }> = [];
			const handler = (event: { type: string }) => events.push(event);

			manager.onEvent(handler);
			manager.offEvent(handler);

			manager.register({
				id: "test",
				name: "test",
				version: "1.0.0",
				factory: async () => new MockChannel(),
				supportedContentTypes: ["text/plain"],
				capabilities: DEFAULT_CHANNEL_CAPABILITIES,
			});

			expect(events.length).toBe(0);
		});
	});
});

describe("OutputPrimitive types", () => {
	it("should support text primitive", () => {
		const text: OutputPrimitive = { kind: "text", content: "Hello world" };
		expect(text.kind).toBe("text");
	});

	it("should support markdown primitive", () => {
		const md: OutputPrimitive = { kind: "markdown", content: "# Title" };
		expect(md.kind).toBe("markdown");
	});

	it("should support image primitive", () => {
		const img: OutputPrimitive = { kind: "image", url: "https://example.com/img.png", alt: "Test" };
		expect(img.kind).toBe("image");
	});

	it("should support card primitive", () => {
		const card: OutputPrimitive = {
			kind: "card",
			title: "Card Title",
			description: "Card description",
			image: "https://example.com/img.png",
			actions: [{ type: "url", label: "Click", value: "https://example.com" }],
		};
		expect(card.kind).toBe("card");
	});

	it("should support list primitive", () => {
		const list: OutputPrimitive = {
			kind: "list",
			title: "My List",
			items: [
				{ kind: "text", content: "Item 1" },
				{ kind: "text", content: "Item 2" },
			],
		};
		expect(list.kind).toBe("list");
	});

	it("should support template primitive", () => {
		const template: OutputPrimitive = {
			kind: "template",
			name: "greeting",
			parameters: { name: "John", time: "morning" },
		};
		expect(template.kind).toBe("template");
	});
});
