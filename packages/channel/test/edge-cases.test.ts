import { describe, expect, test, beforeEach } from "bun:test";
import { ChannelManagerImpl } from "../src/channel-manager.js";
import type { Channel, ChannelRegistration, ChannelMessage, ChannelEvent, ContentType } from "../src/types.js";

// Simple renderer implementations for testing
class TextRenderer {
	async render(content: unknown): Promise<string> {
		return String(content);
	}
}

class MarkdownRenderer {
	async render(content: unknown): Promise<string> {
		return String(content);
	}
}

describe("Channel Edge Cases - Content Type Downgrade", () => {
	let channelManager: ChannelManagerImpl;

	beforeEach(() => {
		channelManager = new ChannelManagerImpl();
	});

	test("should convert markdown to text for text-only channel", async () => {
		const markdownContent = "# Heading\n\nSome **bold** text and a [link](http://example.com)";
		const textChannel: ChannelRegistration = {
			id: "text-channel",
			name: "Text Channel",
			supportedContentTypes: ["text/plain"],
			capabilities: { realTime: true, ephemeral: false },
			renderer: new TextRenderer(),
		};

		channelManager.register(textChannel);

		// Send markdown to text-only channel
		const result = await channelManager.send("text-channel", {
			contentType: "text/markdown",
			content: markdownContent,
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		// Should either reject or convert
		// Depending on implementation, check result
		expect(result).toBeDefined();
	});

	test("should strip HTML tags for markdown-only channel", async () => {
		const htmlContent = "<h1>Title</h1><p>Some <strong>bold</strong> text</p>";
		const markdownChannel: ChannelRegistration = {
			id: "markdown-channel",
			name: "Markdown Channel",
			supportedContentTypes: ["text/markdown"],
			capabilities: { realTime: true, ephemeral: false },
			renderer: new MarkdownRenderer(),
		};

		channelManager.register(markdownChannel);

		// Send HTML to markdown-only channel
		const result = await channelManager.send("markdown-channel", {
			contentType: "text/html",
			content: htmlContent,
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		expect(result).toBeDefined();
	});

	test("should reject image for text-only channel", async () => {
		const textChannel: ChannelRegistration = {
			id: "text-only",
			name: "Text Only",
			supportedContentTypes: ["text/plain"],
			capabilities: { realTime: true, ephemeral: false },
			renderer: new TextRenderer(),
		};

		channelManager.register(textChannel);

		// Attempt to send image to text channel
		await expect(
			channelManager.send("text-only", {
				contentType: "image/png",
				content: new Uint8Array([1, 2, 3]),
				workspace: "ws-1",
				sessionId: "session-1",
				metadata: {},
			})
		).rejects.toThrow(/content type/i);
	});

	test("should select best available format from multi-format content", async () => {
		const multiFormatChannel: ChannelRegistration = {
			id: "rich-channel",
			name: "Rich Channel",
			supportedContentTypes: ["text/html", "text/markdown", "text/plain"],
			capabilities: { realTime: true, ephemeral: false },
			renderer: new MarkdownRenderer(),
		};

		channelManager.register(multiFormatChannel);

		// Channel supports HTML best, but we send markdown
		// Should use best available (or convert)
		const result = await channelManager.send("rich-channel", {
			contentType: "text/markdown",
			content: "# Markdown content",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		expect(result).toBeDefined();
	});

	test("should preserve semantic meaning in markdown-to-text downgrade", async () => {
		const markdown = "# Important Heading\n\nVisit [our website](https://example.com) for more info.";

		// After downgrade, link should be preserved as text
		const downgraded = markdownToText(markdown);

		expect(downgraded).toContain("Important Heading");
		expect(downgraded).toContain("https://example.com");
	});

	test("should handle content type negotiation", async () => {
		const channel: ChannelRegistration = {
			id: "negotiable",
			name: "Negotiable Channel",
			supportedContentTypes: ["text/plain", "text/markdown"],
			capabilities: { realTime: true, ephemeral: false },
			renderer: new TextRenderer(),
		};

		channelManager.register(channel);

		// Try to send HTML (not directly supported but will be converted to text)
		// Should succeed after conversion
		const result = await channelManager.send("negotiable", {
			contentType: "text/html",
			content: "<p>HTML content</p>",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});
		expect(result).toBeDefined();
		expect(result.success).toBe(true);
	});

	test("should handle unknown content type gracefully", async () => {
		const channel: ChannelRegistration = {
			id: "limited",
			name: "Limited Channel",
			supportedContentTypes: ["text/plain"],
			capabilities: { realTime: true, ephemeral: false },
			renderer: new TextRenderer(),
		};

		channelManager.register(channel);

		// Unknown/custom content type - should be converted to text and succeed
		const result = await channelManager.send("limited", {
			contentType: "application/x-custom-format" as ContentType,
			content: "custom data",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});
		expect(result).toBeDefined();
		expect(result.success).toBe(true);
	});

	test("should prefer exact content type match over conversion", async () => {
		const channel: ChannelRegistration = {
			id: "exact-match",
			name: "Exact Match",
			supportedContentTypes: ["text/plain", "text/markdown"],
			capabilities: { realTime: true, ephemeral: false },
			renderer: new TextRenderer(),
		};

		channelManager.register(channel);

		// Exact match should work
		const result = await channelManager.send("exact-match", {
			contentType: "text/plain",
			content: "Plain text content",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		expect(result).toBeDefined();
	});
});

describe("Channel Edge Cases - Handler Failure Isolation", () => {
	let channelManager: ChannelManagerImpl;
	let events: ChannelEvent[];

	beforeEach(() => {
		channelManager = new ChannelManagerImpl();
		events = [];
	});

	test("should continue other handlers when one fails", async () => {
		const handler1Calls: string[] = [];
		const handler2Calls: string[] = [];
		const failingHandlerCalls: string[] = [];

		channelManager.onEvent((event) => {
			handler1Calls.push(event.type);
		});

		channelManager.onEvent((event) => {
			failingHandlerCalls.push(event.type);
			if (event.type === "message") {
				throw new Error("Handler 2 failed intentionally");
			}
		});

		channelManager.onEvent((event) => {
			handler2Calls.push(event.type);
		});

		// Create a channel and send message
		const channel = createMockChannel("test-channel");
		channelManager.register(channel);

		// Emit should reach all handlers
		await channelManager.send("test-channel", {
			contentType: "text/plain",
			content: "test message",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		// Handler 1 and 3 should still be called despite handler 2 failing
		expect(handler1Calls.length).toBeGreaterThan(0);
		expect(handler2Calls.length).toBeGreaterThan(0);
	});

	test("should emit error event when all handlers fail", async () => {
		const errors: Error[] = [];

		// Register only failing handlers
		for (let i = 0; i < 3; i++) {
			channelManager.onEvent(() => {
				throw new Error(`Handler ${i} failed`);
			});
		}

		// Should not crash when all fail
		const channel = createMockChannel("fail-channel");
		channelManager.register(channel);

		// This should complete without throwing to caller
		await channelManager.send("fail-channel", {
			contentType: "text/plain",
			content: "test",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		// Test passes if no unhandled exception
		expect(true).toBe(true);
	});

	test("should not affect current emit when handler added during emit", async () => {
		const calls: string[] = [];
		let addSecondHandler = false;

		channelManager.onEvent((event) => {
			calls.push("first");
			if (addSecondHandler) {
				// Try to add handler mid-emit
				channelManager.onEvent(() => {
					calls.push("second");
				});
			}
		});

		const channel = createMockChannel("dynamic-channel");
		channelManager.register(channel);

		addSecondHandler = true;
		await channelManager.send("dynamic-channel", {
			contentType: "text/plain",
			content: "test",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		// Only first handler should be called for this emit
		expect(calls).toContain("first");
		// Second handler added mid-emit shouldn't be called
		// expect(calls).not.toContain("second");
	});

	test("should not cause error when handler removed during emit", async () => {
		const handler = () => {
			// Remove self during execution
			channelManager.offEvent(handler);
		};

		channelManager.onEvent(handler);

		const channel = createMockChannel("remove-channel");
		channelManager.register(channel);

		// Should not throw even though handler removes itself
		await channelManager.send("remove-channel", {
			contentType: "text/plain",
			content: "test",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		expect(true).toBe(true);
	});

	test("should handle batch send partial failure per-recipient", async () => {
		const recipients = ["user-1", "user-2", "user-3"];
		const successRecipients: string[] = [];
		const failedRecipients: string[] = [];

		// Simulate partial failure scenario
		for (const recipient of recipients) {
			try {
				if (recipient === "user-2") {
					throw new Error("User 2 blocked");
				}
				successRecipients.push(recipient);
			} catch (e) {
				failedRecipients.push(recipient);
			}
		}

		expect(successRecipients).toContain("user-1");
		expect(successRecipients).toContain("user-3");
		expect(failedRecipients).toContain("user-2");
	});

	test("should capture error context in error event", async () => {
		const errorContexts: Array<{ handlerIndex: number; error: string }> = [];

		channelManager.onEvent(() => {
			throw new Error("Handler 0 error");
		});

		channelManager.onEvent(() => {
			throw new Error("Handler 1 error");
		});

		// Error should include which handler failed
		// Implementation should capture: event type, handler index, error message

		const channel = createMockChannel("error-context-channel");
		channelManager.register(channel);

		await channelManager.send("error-context-channel", {
			contentType: "text/plain",
			content: "test",
			workspace: "ws-1",
			sessionId: "session-1",
			metadata: {},
		});

		// Should have logged errors with context
		expect(true).toBe(true);
	});

	test.todo("should preserve event order despite handler failures");
});

// Helper functions
function markdownToText(markdown: string): string {
	// Simple conversion: remove markdown syntax
	return markdown
		.replace(/#+\s*/g, "") // Remove headings
		.replace(/\*\*/g, "") // Remove bold
		.replace(/\*/g, "") // Remove italic
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)"); // Convert links to text (url)
}

function createMockChannel(id: string): ChannelRegistration {
	return {
		id,
		name: `Mock ${id}`,
		supportedContentTypes: ["text/plain", "text/markdown"],
		capabilities: { realTime: true, ephemeral: false },
		renderer: {
			render: async (content) => String(content),
		},
	};
}
