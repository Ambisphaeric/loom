import {
	BaseChannel,
	createChannelManager,
	DEFAULT_CHANNEL_CAPABILITIES,
	type OutputRecipient,
	type OutputPrimitive,
	type ChannelConfig,
	type ChannelRegistration,
} from "../src/index.js";

class ExampleChannel extends BaseChannel {
	readonly name = "example";
	readonly capabilities = {
		...DEFAULT_CHANNEL_CAPABILITIES,
		supportsMarkdown: true,
		supportsButtons: true,
		supportsLists: true,
		maxMessageLength: 4096,
	};

	private webhookUrl?: string;

	async initialize(config: ChannelConfig): Promise<void> {
		await super.initialize(config);
		this.webhookUrl = config.credentials?.webhookUrl as string | undefined;
	}

	protected async doSend(
		recipient: OutputRecipient,
		content: OutputPrimitive
	): Promise<{ success: boolean; messageId?: string; error?: string; timestamp: number }> {
		const payload = this.buildPayload(recipient, content);

		if (this.webhookUrl) {
			console.log(`[ExampleChannel] Sending to webhook: ${this.webhookUrl}`);
			console.log(`[ExampleChannel] Payload:`, JSON.stringify(payload, null, 2));
		}

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
		return Promise.all(
			recipients.map(async (recipient) => this.doSend(recipient, content))
		);
	}

	protected async doValidateRecipient(recipient: OutputRecipient): Promise<boolean> {
		return recipient.type === "user" || recipient.type === "group";
	}

	protected async doHealthCheck(): Promise<boolean> {
		return this.webhookUrl !== undefined;
	}

	private buildPayload(recipient: OutputRecipient, content: OutputPrimitive): object {
		const base = {
			recipient: {
				type: recipient.type,
				id: recipient.id,
				name: recipient.name,
			},
			timestamp: Date.now(),
		};

		switch (content.kind) {
			case "text":
				return { ...base, type: "text", text: content.content };
			case "markdown":
				return { ...base, type: "markdown", text: content.content };
			case "image":
				return { ...base, type: "image", url: content.url, alt: content.alt };
			case "card":
				return {
					...base,
					type: "card",
					title: content.title,
					description: content.description,
					image: content.image,
					actions: content.actions,
				};
			case "button":
				return { ...base, type: "button", label: content.label, value: content.value };
			default:
				return { ...base, type: "unknown", content };
		}
	}
}

async function basicDemo(): Promise<void> {
	console.log("=== Channel Package Demo ===\n");

	const manager = createChannelManager();

	manager.register({
		name: "example",
		version: "1.0.0",
		factory: async () => new ExampleChannel(),
		description: "Example webhook-based output channel",
	});

	console.log("Registered channels:", manager.getSupportedChannels());

	const channel = await manager.getOrCreate("example");
	if (!channel) {
		console.error("Failed to create channel");
		return;
	}

	await channel.initialize({
		workspace: "demo-workspace",
		enabled: true,
		credentials: { webhookUrl: "https://api.example.com/webhook" },
	});

	console.log(`\nChannel: ${channel.name}`);
	console.log(`Capabilities:`, channel.capabilities);

	const recipient: OutputRecipient = {
		type: "user",
		id: "user-123",
		name: "John Doe",
	};

	console.log("\n--- Sending text message ---");
	const textContent: OutputPrimitive = { kind: "text", content: "Hello from Enhancement!" };
	const textResult = await channel.send(recipient, textContent);
	console.log("Result:", textResult);

	console.log("\n--- Sending markdown message ---");
	const mdContent: OutputPrimitive = { kind: "markdown", content: "# Hello\nThis is **markdown**!" };
	const mdResult = await channel.send(recipient, mdContent);
	console.log("Result:", mdResult);

	console.log("\n--- Sending card message ---");
	const cardContent: OutputPrimitive = {
		kind: "card",
		title: "Suggestion Available",
		description: "A new AI suggestion has been generated for your review.",
		image: "https://example.com/suggestion.png",
		actions: [
			{ type: "url", label: "View", value: "https://app.example.com/suggestions/123" },
			{ type: "callback", label: "Dismiss", value: "dismiss:123" },
		],
	};
	const cardResult = await channel.send(recipient, cardContent);
	console.log("Result:", cardResult);

	console.log("\n--- Sending batch ---");
	const recipients: OutputRecipient[] = [
		{ type: "user", id: "user-1", name: "Alice" },
		{ type: "user", id: "user-2", name: "Bob" },
		{ type: "user", id: "user-3", name: "Charlie" },
	];
	const batchContent: OutputPrimitive = { kind: "text", content: "Batch notification!" };
	const batchResult = await channel.sendBatch(recipients, batchContent);
	console.log("Batch result:", batchResult);

	console.log("\n--- Health check ---");
	const healthy = await channel.healthCheck();
	console.log(`Channel healthy: ${healthy}`);

	await manager.stopAll();
	console.log("\n=== Demo Complete ===");
}

basicDemo().catch(console.error);
