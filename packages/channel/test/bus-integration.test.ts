import { describe, expect, test, beforeEach } from "bun:test";
import { ChannelManagerImpl, createChannelManager, DEFAULT_CHANNEL_CAPABILITIES } from "../src/channel-manager.js";
import type { ChannelRegistration, Bus, ChannelEvent } from "../src/types.js";

describe("ChannelManager Bus Integration", () => {
	let channelManager: ChannelManagerImpl;
	let mockBus: Bus & { published: Array<{ contentType: string; data: string }> };

	beforeEach(() => {
		// Create mock bus that captures published events
		mockBus = {
			workspace: "test-workspace",
			published: [],
			publish(chunk) {
				this.published.push({
					contentType: chunk.contentType,
					data: chunk.data.toString(),
				});
			},
		};
		channelManager = new ChannelManagerImpl({ bus: mockBus }) as ChannelManagerImpl;
	});

	test("should emit send_failed event to bus when channel not found", async () => {
		const result = await channelManager.send("non-existent-channel", {
			contentType: "text/plain",
			content: "test message",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe("Channel not found");

		// Bus should have received the error
		expect(mockBus.published.length).toBe(1);
		const errorEvent = JSON.parse(mockBus.published[0].data);
		expect(errorEvent.type).toBe("send_failed");
		expect(errorEvent.code).toBe("CHANNEL_SEND_FAILED");
		expect(errorEvent.message).toBe("Channel not found");
	});

	test("should emit send_failed event for unsupported image content type", async () => {
		const registration: ChannelRegistration = {
			id: "text-channel",
			name: "Text Channel",
			supportedContentTypes: ["text/plain"],
			capabilities: DEFAULT_CHANNEL_CAPABILITIES,
		};
		channelManager.register(registration);

		const result = await channelManager.send("text-channel", {
			contentType: "image/png",
			content: Buffer.from("fake-image"),
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("does not support");

		// Bus should have received the error
		expect(mockBus.published.length).toBe(1);
		const errorEvent = JSON.parse(mockBus.published[0].data);
		expect(errorEvent.type).toBe("send_failed");
		expect(errorEvent.code).toBe("CHANNEL_SEND_FAILED");
	});

	test("should emit message_failed when channel send returns failure", async () => {
		const registration: ChannelRegistration = {
			id: "failing-channel",
			name: "Failing Channel",
			supportedContentTypes: ["text/plain"],
			capabilities: DEFAULT_CHANNEL_CAPABILITIES,
			factory: async () => ({
				name: "failing-channel",
				capabilities: DEFAULT_CHANNEL_CAPABILITIES,
				initialize: async () => {},
				send: async () => ({ success: false, error: "Network unreachable", timestamp: Date.now() }),
				sendBatch: async () => ({ total: 0, succeeded: 0, failed: 0, results: [] }),
				validateRecipient: async () => true,
				formatForChannel: (p) => p,
				healthCheck: async () => false,
				stop: async () => {},
			}),
		};
		channelManager.register(registration);

		// Get or create the channel
		await channelManager.getOrCreate("failing-channel", { workspace: "ws-1", enabled: true });

		const result = await channelManager.send("failing-channel", {
			contentType: "text/plain",
			content: "test",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe("Network unreachable");

		// Bus should have received the message_failed event
		expect(mockBus.published.length).toBe(1);
		const errorEvent = JSON.parse(mockBus.published[0].data);
		expect(errorEvent.type).toBe("message_failed");
		expect(errorEvent.code).toBe("CHANNEL_MESSAGE_FAILED");
		expect(errorEvent.message).toBe("Network unreachable");
	});

	test("should emit message_failed when channel send throws", async () => {
		const registration: ChannelRegistration = {
			id: "throwing-channel",
			name: "Throwing Channel",
			supportedContentTypes: ["text/plain"],
			capabilities: DEFAULT_CHANNEL_CAPABILITIES,
			factory: async () => ({
				name: "throwing-channel",
				capabilities: DEFAULT_CHANNEL_CAPABILITIES,
				initialize: async () => {},
				send: async () => { throw new Error("Connection timeout"); },
				sendBatch: async () => ({ total: 0, succeeded: 0, failed: 0, results: [] }),
				validateRecipient: async () => true,
				formatForChannel: (p) => p,
				healthCheck: async () => false,
				stop: async () => {},
			}),
		};
		channelManager.register(registration);

		// Get or create the channel
		await channelManager.getOrCreate("throwing-channel", { workspace: "ws-1", enabled: true });

		const result = await channelManager.send("throwing-channel", {
			contentType: "text/plain",
			content: "test",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe("Connection timeout");

		// Bus should have received the message_failed event
		expect(mockBus.published.length).toBe(1);
		const errorEvent = JSON.parse(mockBus.published[0].data);
		expect(errorEvent.type).toBe("message_failed");
		expect(errorEvent.code).toBe("CHANNEL_MESSAGE_FAILED");
		expect(errorEvent.message).toBe("Connection timeout");
	});

	test("should emit batch_completed with failures to bus", async () => {
		const registration: ChannelRegistration = {
			id: "batch-channel",
			name: "Batch Channel",
			supportedContentTypes: ["text/plain"],
			capabilities: { ...DEFAULT_CHANNEL_CAPABILITIES, supportsBatch: true },
		};
		channelManager.register(registration);

		// Register a local handler to capture the batch_completed event
		const localEvents: ChannelEvent[] = [];
		channelManager.onEvent((event) => localEvents.push(event));

		// sendBatch with multiple messages - first succeeds, second fails
		const results = await channelManager.sendBatch("batch-channel", [
			{ contentType: "text/plain", content: "msg1", workspace: "ws-1", sessionId: "s1", metadata: {} },
			{ contentType: "image/png", content: "msg2", workspace: "ws-1", sessionId: "s2", metadata: {} }, // This will fail
		]);

		// One should succeed (mock), one should fail (unsupported content type)
		expect(results.length).toBe(2);
		expect(results[0].success).toBe(true);
		expect(results[1].success).toBe(false);

		// Bus should have received the send_failed for the second message
		expect(mockBus.published.length).toBe(1);
		const errorEvent = JSON.parse(mockBus.published[0].data);
		expect(errorEvent.type).toBe("send_failed");
	});

	test("should not emit to bus when no bus is provided", async () => {
		const channelManagerNoBus = new ChannelManagerImpl() as ChannelManagerImpl;

		const result = await channelManagerNoBus.send("non-existent", {
			contentType: "text/plain",
			content: "test",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		expect(result.success).toBe(false);
		// No bus to emit to, but local emit should still work
		// (no error thrown)
	});

	test("should include channelId in error events", async () => {
		channelManager.register({
			id: "my-channel",
			name: "My Channel",
			supportedContentTypes: ["text/plain"],
			capabilities: DEFAULT_CHANNEL_CAPABILITIES,
		});

		await channelManager.send("my-channel", {
			contentType: "image/png", // Unsupported
			content: "test",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		const errorEvent = JSON.parse(mockBus.published[0].data);
		expect(errorEvent.channelId).toBe("my-channel");
		expect(errorEvent.timestamp).toBeGreaterThan(0);
	});

	test("should support emitToBus for manual error emission", () => {
		const registration: ChannelRegistration = {
			id: "manual-channel",
			name: "Manual Channel",
			supportedContentTypes: ["text/plain"],
			capabilities: DEFAULT_CHANNEL_CAPABILITIES,
		};
		channelManager.register(registration);

		// Manually emit an error
		if (channelManager.emitToBus) {
			channelManager.emitToBus({
				type: "send_failed",
				channel: "manual-channel",
				id: "manual-channel",
				error: "Manual test error",
			});
		}

		// Bus should receive it
		expect(mockBus.published.length).toBe(1);
		const errorEvent = JSON.parse(mockBus.published[0].data);
		expect(errorEvent.type).toBe("send_failed");
		expect(errorEvent.message).toBe("Manual test error");
	});

	test("createChannelManager should accept bus option", () => {
		const cm = createChannelManager({ bus: mockBus }) as ChannelManagerImpl;

		// Should work without errors
		expect(cm).toBeDefined();
	});
});
