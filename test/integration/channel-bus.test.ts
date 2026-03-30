/**
 * Integration Test: Channel + Bus
 *
 * Tests the integration between channel manager and event bus.
 */

import { expect, test, describe, beforeEach } from "bun:test";
import { EnhancementBus } from "@enhancement/bus";
import { createChannelManager, BaseChannel } from "@enhancement/channel";
import type {
  Channel,
  ChannelConfig,
  ChannelSendResult,
  OutputRecipient,
  OutputPrimitive,
  ChannelCapabilities,
  ChannelSendOptions,
} from "@enhancement/channel";

// Mock channel for testing
class MockTestChannel extends BaseChannel {
  readonly name = "test-channel";
  readonly capabilities: ChannelCapabilities = {
    supportsText: true,
    supportsMarkdown: true,
    supportsHtml: false,
    supportsImages: true,
    supportsFiles: true,
    supportsAudio: false,
    supportsVideo: false,
    supportsLocation: false,
    supportsContacts: false,
    supportsCards: false,
    supportsButtons: false,
    supportsLists: true,
    supportsTemplates: false,
    supportsBatch: true,
  };

  sentMessages: Array<{
    recipient: OutputRecipient;
    content: OutputPrimitive;
    options?: ChannelSendOptions;
  }> = [];

  protected async doSend(
    recipient: OutputRecipient,
    content: OutputPrimitive,
    options?: ChannelSendOptions
  ): Promise<ChannelSendResult> {
    this.sentMessages.push({ recipient, content, options });
    return {
      success: true,
      messageId: `msg-${Date.now()}`,
      timestamp: Date.now(),
    };
  }

  protected async doSendBatch(
    recipients: OutputRecipient[],
    content: OutputPrimitive,
    _options?: ChannelSendOptions
  ): Promise<ChannelSendResult[]> {
    return Promise.all(
      recipients.map((r) => this.doSend(r, content, _options))
    );
  }

  protected async doValidateRecipient(recipient: OutputRecipient): Promise<boolean> {
    return recipient.id.length > 0;
  }

  protected async doHealthCheck(): Promise<boolean> {
    return this.initialized;
  }
}

describe("Channel + Bus Integration", () => {
  let bus: EnhancementBus;
  let channelManager: ReturnType<typeof createChannelManager>;
  let mockChannel: MockTestChannel;

  beforeEach(() => {
    bus = new EnhancementBus("test-workspace");
    channelManager = createChannelManager();
    mockChannel = new MockTestChannel();
  });

  test("should register and create a channel", async () => {
    channelManager.register({
      name: "test-channel",
      version: "1.0.0",
      factory: async () => mockChannel,
    });

    const channel = await channelManager.getOrCreate("test-channel", {
      workspace: "test-workspace",
      enabled: true,
    });

    expect(channel).toBeDefined();
    expect(channel?.name).toBe("test-channel");
    expect(channel?.capabilities.supportsText).toBe(true);
  });

  test("should send message through channel", async () => {
    await mockChannel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    const recipient: OutputRecipient = {
      type: "user",
      id: "user-123",
      name: "Test User",
    };

    const content: OutputPrimitive = {
      kind: "text",
      content: "Hello from bus!",
    };

    const result = await mockChannel.send(recipient, content);

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(mockChannel.sentMessages).toHaveLength(1);
    expect(mockChannel.sentMessages[0].content.content).toBe("Hello from bus!");
  });

  test("should send batch messages", async () => {
    await mockChannel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    const recipients: OutputRecipient[] = [
      { type: "user", id: "user-1" },
      { type: "user", id: "user-2" },
      { type: "user", id: "user-3" },
    ];

    const content: OutputPrimitive = {
      kind: "text",
      content: "Broadcast message",
    };

    const result = await mockChannel.sendBatch(recipients, content);

    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(mockChannel.sentMessages).toHaveLength(3);
  });

  test("should validate recipients", async () => {
    await mockChannel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    const validRecipient: OutputRecipient = { type: "user", id: "valid-user" };
    const invalidRecipient: OutputRecipient = { type: "user", id: "" };

    expect(await mockChannel.validateRecipient(validRecipient)).toBe(true);
    expect(await mockChannel.validateRecipient(invalidRecipient)).toBe(false);
  });

  test("should format content for channel capabilities", async () => {
    await mockChannel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    // Markdown is supported
    const markdownContent: OutputPrimitive = {
      kind: "markdown",
      content: "# Heading\n\nSome text",
    };

    const formatted = mockChannel.formatForChannel(markdownContent);
    expect(formatted.kind).toBe("markdown");

    // HTML is not supported - should be converted to text
    const htmlContent: OutputPrimitive = {
      kind: "html",
      content: "<h1>Heading</h1>",
    };

    const converted = mockChannel.formatForChannel(htmlContent);
    expect(converted.kind).toBe("text");
  });

  test("should handle health check", async () => {
    // Before initialization
    expect(await mockChannel.healthCheck()).toBe(false);

    // After initialization
    await mockChannel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    expect(await mockChannel.healthCheck()).toBe(true);

    // After stop
    await mockChannel.stop();
    expect(await mockChannel.healthCheck()).toBe(false);
  });

  test("should fail to send if not initialized", async () => {
    const recipient: OutputRecipient = { type: "user", id: "user-123" };
    const content: OutputPrimitive = { kind: "text", content: "Test" };

    await expect(mockChannel.send(recipient, content)).rejects.toThrow(
      "not initialized"
    );
  });

  test("should emit channel events", () => {
    const events: string[] = [];

    channelManager.onEvent((event) => {
      events.push(event.type);
    });

    channelManager.register({
      name: "test-channel",
      version: "1.0.0",
      factory: async () => mockChannel,
    });

    expect(events).toContain("channel_registered");

    channelManager.unregister("test-channel");
    expect(events).toContain("channel_unregistered");
  });

  test("should integrate bus events with channel sending", async () => {
    await mockChannel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    // Subscribe to bus events and forward to channel
    bus.subscribe("notification/send", async (chunk) => {
      const content: OutputPrimitive = {
        kind: "text",
        content: String(chunk.data),
      };

      const recipient: OutputRecipient = {
        type: "user",
        id: chunk.sessionId ?? "default-user",
      };

      await mockChannel.send(recipient, content, {
        priority: "high",
      });
    });

    // Publish a notification
    bus.publish({
      kind: "raw",
      id: `chunk-${Date.now()}`,
      source: "notification-service",
      workspace: "test-workspace",
      sessionId: "user-456",
      data: "You have a new notification!",
      contentType: "notification/send",
      timestamp: Date.now(),
      generation: 1,
    });

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockChannel.sentMessages).toHaveLength(1);
    expect(mockChannel.sentMessages[0].content.content).toBe(
      "You have a new notification!"
    );
    expect(mockChannel.sentMessages[0].options?.priority).toBe("high");
  });

  test("should get all registered channels", async () => {
    channelManager.register({
      name: "channel-1",
      version: "1.0.0",
      factory: async () => new MockTestChannel(),
    });

    channelManager.register({
      name: "channel-2",
      version: "1.0.0",
      factory: async () => new MockTestChannel(),
    });

    expect(channelManager.getSupportedChannels()).toContain("channel-1");
    expect(channelManager.getSupportedChannels()).toContain("channel-2");
  });

  test("should handle priority in send options", async () => {
    await mockChannel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    const recipient: OutputRecipient = { type: "user", id: "user-123" };
    const content: OutputPrimitive = { kind: "text", content: "Urgent!" };

    await mockChannel.send(recipient, content, {
      priority: "urgent",
      scheduledAt: Date.now() + 1000,
    });

    expect(mockChannel.sentMessages[0].options?.priority).toBe("urgent");
    expect(mockChannel.sentMessages[0].options?.scheduledAt).toBeDefined();
  });
});

describe("Channel + Bus Complex Scenarios", () => {
  test("should route different content types to appropriate channels", async () => {
    const bus = new EnhancementBus("test-workspace");
    const textChannel = new MockTestChannel();
    const imageChannel = new MockTestChannel();

    await textChannel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });
    await imageChannel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    // Subscribe to text content
    bus.subscribe("content/text", async (chunk) => {
      const content: OutputPrimitive = {
        kind: "text",
        content: String(chunk.data),
      };
      await textChannel.send({ type: "user", id: "user-123" }, content);
    });

    // Subscribe to image content
    bus.subscribe("content/image", async (chunk) => {
      const content: OutputPrimitive = {
        kind: "image",
        url: String(chunk.data),
        alt: "Image from bus",
      };
      await imageChannel.send({ type: "user", id: "user-123" }, content);
    });

    // Publish different content types
    bus.publish({
      kind: "raw",
      id: `chunk-1`,
      source: "test",
      workspace: "test-workspace",
      sessionId: "user-123",
      data: "Hello text!",
      contentType: "content/text",
      timestamp: Date.now(),
      generation: 1,
    });

    bus.publish({
      kind: "raw",
      id: `chunk-2`,
      source: "test",
      workspace: "test-workspace",
      sessionId: "user-123",
      data: "https://example.com/image.png",
      contentType: "content/image",
      timestamp: Date.now(),
      generation: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(textChannel.sentMessages).toHaveLength(1);
    expect(textChannel.sentMessages[0].content.kind).toBe("text");

    expect(imageChannel.sentMessages).toHaveLength(1);
    expect(imageChannel.sentMessages[0].content.kind).toBe("image");
  });

  test("should handle batch sending with mixed results", async () => {
    const channel = new MockTestChannel();

    // Override validation to fail for specific recipients
    channel.doValidateRecipient = async (recipient) => {
      return !recipient.id.includes("invalid");
    };

    await channel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    const recipients: OutputRecipient[] = [
      { type: "user", id: "user-valid-1" },
      { type: "user", id: "user-invalid" },
      { type: "user", id: "user-valid-2" },
    ];

    const content: OutputPrimitive = { kind: "text", content: "Test" };

    const result = await channel.sendBatch(recipients, content);

    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results.filter((r) => r.success)).toHaveLength(2);
    expect(result.results.filter((r) => !r.success)).toHaveLength(1);
  });

  test("should handle multiple bus subscriptions with channel", async () => {
    const bus = new EnhancementBus("test-workspace");
    const channel = new MockTestChannel();
    await channel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    let messageCount = 0;

    // Multiple subscribers to same content type
    bus.subscribe("notification/*", async (chunk) => {
      messageCount++;
    });

    bus.subscribe("notification/email", async (chunk) => {
      const content: OutputPrimitive = {
        kind: "text",
        content: `Email: ${chunk.data}`,
      };
      await channel.send({ type: "user", id: "user-123" }, content);
    });

    bus.subscribe("notification/sms", async (chunk) => {
      const content: OutputPrimitive = {
        kind: "text",
        content: `SMS: ${chunk.data}`,
      };
      await channel.send({ type: "user", id: "user-123" }, content);
    });

    bus.publish({
      kind: "raw",
      id: `chunk-1`,
      source: "test",
      workspace: "test-workspace",
      sessionId: "user-123",
      data: "Hello",
      contentType: "notification/email",
      timestamp: Date.now(),
      generation: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(messageCount).toBe(1);
    expect(channel.sentMessages).toHaveLength(1);
    expect(channel.sentMessages[0].content.content).toBe("Email: Hello");
  });

  test("should handle channel lifecycle with bus", async () => {
    const bus = new EnhancementBus("test-workspace");
    const channel = new MockTestChannel();

    // Initialize channel
    await channel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    // Subscribe to bus
    const unsubscribe = bus.subscribe("test/message", async (chunk) => {
      await channel.send(
        { type: "user", id: "user-123" },
        { kind: "text", content: String(chunk.data) }
      );
    });

    // Send while active
    bus.publish({
      kind: "raw",
      id: `chunk-1`,
      source: "test",
      workspace: "test-workspace",
      sessionId: "user-123",
      data: "Message 1",
      contentType: "test/message",
      timestamp: Date.now(),
      generation: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(channel.sentMessages).toHaveLength(1);

    // Stop channel
    await channel.stop();

    // Unsubscribe from bus
    unsubscribe();

    // Publish after stop (should not send)
    bus.publish({
      kind: "raw",
      id: `chunk-2`,
      source: "test",
      workspace: "test-workspace",
      sessionId: "user-123",
      data: "Message 2",
      contentType: "test/message",
      timestamp: Date.now(),
      generation: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Still 1 because we unsubscribed
    expect(channel.sentMessages).toHaveLength(1);
  });

  test("should handle reply threading", async () => {
    const channel = new MockTestChannel();
    await channel.initialize({
      workspace: "test-workspace",
      enabled: true,
    });

    const recipient: OutputRecipient = { type: "user", id: "user-123" };
    const content: OutputPrimitive = { kind: "text", content: "Reply" };

    const result = await channel.send(recipient, content, {
      replyTo: "original-msg-id",
      threadId: "thread-abc",
    });

    expect(result.success).toBe(true);
    expect(channel.sentMessages[0].options?.replyTo).toBe("original-msg-id");
    expect(channel.sentMessages[0].options?.threadId).toBe("thread-abc");
  });
});
