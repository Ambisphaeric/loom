# @enhancement/channel

Base framework for output surfaces (WhatsApp, Telegram, email, etc.) with rich content support.

## Purpose

Provides an abstraction layer for sending messages through various channels (chat apps, email, SMS). Supports rich content types (text, images, cards, buttons, locations) with channel-specific formatting and capability detection.

## Key Domain Concepts

- **Channel**: Interface for any output surface implementation.
- **BaseChannel**: Abstract base class for channel implementations.
- **ChannelManager**: Registry and factory for channel instances.
- **OutputPrimitive**: Rich content types (text, markdown, image, card, button, etc.).
- **OutputRecipient**: Target recipient (user, group, channel, broadcast).
- **ChannelCapabilities**: Feature flags for what a channel supports.
- **OutputEnvelope**: Complete message package with metadata.

## Public API

### Channel Manager

```typescript
import { createChannelManager, ChannelManagerImpl } from '@enhancement/channel';

const manager = createChannelManager();

// Register a channel factory
manager.register({
  name: "telegram",
  version: "1.0.0",
  description: "Telegram Bot API channel",
  factory: async (config) => new TelegramChannel(config),
});

// Get or create channel instance
const telegram = await manager.getOrCreate("telegram", {
  workspace: "workspace-1",
  enabled: true,
  credentials: { botToken: "..." },
});

// List supported channels
const supported = manager.getSupportedChannels(); // ["telegram", "email", ...]

// Get all active channels
const active = manager.getAll();

// Event handling
manager.onEvent((event) => {
  if (event.type === "message_sent") {
    console.log(`Sent to ${event.channel}: ${event.messageId}`);
  }
});

// Cleanup
await manager.stopAll();
```

### Sending Messages

```typescript
import type { OutputPrimitive, OutputRecipient } from '@enhancement/channel';

// Simple text
const text: OutputPrimitive = {
  kind: "text",
  content: "Hello, World!"
};

// Rich content
const card: OutputPrimitive = {
  kind: "card",
  title: "Meeting Reminder",
  description: "Team standup in 15 minutes",
  image: "https://...",
  actions: [
    { type: "url", label: "Join", value: "https://meet.example.com" },
    { type: "callback", label: "Snooze", value: "snooze-15" }
  ]
};

// Recipient definition
const recipient: OutputRecipient = {
  type: "user",
  id: "user-123",
  name: "John Doe"
};

// Send with options
const result = await channel.send(recipient, card, {
  priority: "high",
  replyTo: "message-456",
  metadata: { source: "scheduler" }
});

// Result
// { success: true, messageId: "...", channelMessageId: "...", timestamp: 1234567890 }
```

### Batch Sending

```typescript
const recipients = [
  { type: "user" as const, id: "user-1" },
  { type: "user" as const, id: "user-2" },
  { type: "user" as const, id: "user-3" },
];

const batchResult = await channel.sendBatch(recipients, content, options);
// { total: 3, succeeded: 3, failed: 0, results: [...] }
```

### Implementing a Custom Channel

```typescript
import { BaseChannel, DEFAULT_CHANNEL_CAPABILITIES } from '@enhancement/channel';
import type { OutputPrimitive, OutputRecipient, ChannelSendResult, ChannelSendOptions } from '@enhancement/channel';

class EmailChannel extends BaseChannel {
  readonly name = "email";
  readonly capabilities = {
    ...DEFAULT_CHANNEL_CAPABILITIES,
    supportsHtml: true,
    supportsMarkdown: true,
    supportsFiles: true,
    maxMessageLength: 100000,
  };

  protected async doSend(
    recipient: OutputRecipient,
    content: OutputPrimitive,
    options?: ChannelSendOptions
  ): Promise<ChannelSendResult> {
    // Convert primitive to email format
    const emailBody = this.formatForChannel(content);
    
    // Send via email API
    const messageId = await this.sendEmail(recipient.id, emailBody);
    
    return {
      success: true,
      messageId: this.generateMessageId(),
      channelMessageId: messageId,
      timestamp: Date.now(),
    };
  }

  protected async doValidateRecipient(recipient: OutputRecipient): Promise<boolean> {
    // Validate email format
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.id);
  }

  protected async doHealthCheck(): Promise<boolean> {
    // Check SMTP connection
    return this.smtpConnected;
  }
}

// Register
manager.register({
  name: "email",
  version: "1.0.0",
  factory: async (config) => new EmailChannel(),
});
```

## Output Primitives

| Kind | Description |
| ------ | ------------- |
| `text` | Plain text message |
| `markdown` | Markdown formatted text |
| `html` | HTML content |
| `image` | Image with URL and alt text |
| `file` | File attachment |
| `audio` | Audio message |
| `video` | Video message |
| `location` | Geographic coordinates |
| `contact` | Contact card |
| `card` | Rich card with title, description, actions |
| `button` | Interactive button |
| `list` | List of items |
| `template` | Predefined template with parameters |

## Design Decisions

1. **Capability-Based**: Channels declare what they support; unsupported content is automatically converted.
2. **Formatting Chain**: Content is formatted for the channel before sending (e.g., markdown → text if unsupported).
3. **Batch Support**: Channels can implement batch sending for efficiency.
4. **Validation Layer**: Recipients are validated before sending attempt.
5. **Event Notifications**: All channel operations emit events for monitoring.
6. **ULID Generation**: Message IDs use ULID for consistency across the system.

## Dependencies

- `@enhancement/types`: Core types (ContextChunk, etc.)
- `@enhancement/bus`: Event integration
- `ulidx`: ULID generation

## Package Structure

```text
packages/channel/
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Channel, OutputPrimitive, Recipient types
│   └── channel-manager.ts      # BaseChannel and ChannelManagerImpl
└── test/
    └── conformance.test.ts
```
