import type {
	AIProvider,
	ProviderEndpoint,
	ChatCompletionOptions,
	ChatCompletionResult,
	ProviderModel,
} from "../types";

export class OpenAICompatibleProvider implements AIProvider {
	name = "openai-compatible";
	type: "local" | "cloud" = "cloud";

	defaultEndpoint: ProviderEndpoint;
	models: ProviderModel[];

	constructor(
		private defaultBaseUrl: string = "https://api.openai.com/v1",
		private defaultApiKey?: string
	) {
		this.defaultEndpoint = {
			name: "openai",
			baseUrl: this.defaultBaseUrl,
			apiKey: this.defaultApiKey,
		};

		this.models = [
			{
				id: "gpt-4",
				name: "GPT-4",
				purpose: "default",
				supportsStreaming: true,
			},
			{
				id: "gpt-3.5-turbo",
				name: "GPT-3.5 Turbo",
				purpose: "fast",
				supportsStreaming: true,
			},
		];
	}

	async createChatCompletion(
		endpoint: ProviderEndpoint,
		options: ChatCompletionOptions
	): Promise<ChatCompletionResult> {
		const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}),
				...endpoint.headers,
			},
			body: JSON.stringify({
				model: options.model,
				messages: options.messages,
				temperature: options.temperature ?? 0.7,
				max_tokens: options.maxTokens,
				stream: false,
				...(options.stop ? { stop: options.stop } : {}),
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`OpenAI API error: ${response.status} - ${error}`);
		}

		const data = (await response.json()) as {
			choices: Array<{ message: { content: string }; finish_reason: string }>;
			usage?: {
				prompt_tokens: number;
				completion_tokens: number;
				total_tokens: number;
			};
		};

		return {
			content: data.choices[0]?.message?.content ?? "",
			finishReason: data.choices[0]?.finish_reason,
			usage: data.usage
				? {
						promptTokens: data.usage.prompt_tokens,
						completionTokens: data.usage.completion_tokens,
						totalTokens: data.usage.total_tokens,
					}
				: undefined,
		};
	}

	async *createStreamingCompletion(
		endpoint: ProviderEndpoint,
		options: ChatCompletionOptions
	): AsyncIterable<string> {
		const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}),
				...endpoint.headers,
			},
			body: JSON.stringify({
				model: options.model,
				messages: options.messages,
				temperature: options.temperature ?? 0.7,
				max_tokens: options.maxTokens,
				stream: true,
				...(options.stop ? { stop: options.stop } : {}),
			}),
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.status}`);
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error("No response body");
		}

		const textDecoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += textDecoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6);
						if (data === "[DONE]") {
							return;
						}
						try {
							const parsed = JSON.parse(data) as {
								choices?: Array<{ delta?: { content?: string } }>;
							};
							const content = parsed.choices?.[0]?.delta?.content;
							if (content) {
								yield content;
							}
						} catch {
							// Skip invalid JSON
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	async createEmbedding(endpoint: ProviderEndpoint, text: string): Promise<number[]> {
		const response = await fetch(`${endpoint.baseUrl}/embeddings`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}),
				...endpoint.headers,
			},
			body: JSON.stringify({
				model: "text-embedding-3-small",
				input: text,
			}),
		});

		if (!response.ok) {
			throw new Error(`Embedding API error: ${response.status}`);
		}

		const data = (await response.json()) as {
			data: Array<{ embedding: number[] }>;
		};

		return data.data[0]?.embedding ?? [];
	}

	async testConnection(endpoint: ProviderEndpoint): Promise<boolean> {
		try {
			const response = await fetch(`${endpoint.baseUrl}/models`, {
				method: "GET",
				headers: {
					...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}),
				},
			});
			return response.ok;
		} catch {
			return false;
		}
	}
}
