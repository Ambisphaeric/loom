import type { ModelPurpose } from "@enhancement/types";

export type ProviderType = "local" | "cloud";

export interface ProviderEndpoint {
	name: string;
	baseUrl: string;
	apiKey?: string;
	headers?: Record<string, string>;
}

export interface ProviderModel {
	id: string;
	name: string;
	purpose: ModelPurpose;
	maxTokens?: number;
	supportsStreaming?: boolean;
	supportsEmbeddings?: boolean;
}

export interface AIProvider {
	name: string;
	type: ProviderType;
	defaultEndpoint: ProviderEndpoint;
	models: ProviderModel[];
	createChatCompletion(endpoint: ProviderEndpoint, options: ChatCompletionOptions): Promise<ChatCompletionResult>;
	createStreamingCompletion?(endpoint: ProviderEndpoint, options: ChatCompletionOptions): AsyncIterable<string>;
	createEmbedding?(endpoint: ProviderEndpoint, text: string): Promise<number[]>;
	testConnection(endpoint: ProviderEndpoint): Promise<boolean>;
}

export interface ChatCompletionOptions {
	model: string;
	messages: Array<{ role: string; content: string }>;
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
	stop?: string[];
}

export interface ChatCompletionResult {
	content: string;
	finishReason?: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export interface ProviderRegistry {
	register(provider: AIProvider): void;
	unregister(name: string): void;
	get(name: string): AIProvider | undefined;
	list(): AIProvider[];
	getDefault(): AIProvider | undefined;
	setDefault(name: string): void;
}

export interface ModelResolution {
	provider: AIProvider;
	model: ProviderModel;
	endpoint: ProviderEndpoint;
}
