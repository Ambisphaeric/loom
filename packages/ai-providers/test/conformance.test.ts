import { describe, it, expect, beforeEach } from "bun:test";
import {
	EnhancementProviderRegistry,
	OpenAICompatibleProvider,
	createProviderRegistry,
} from "../src/index.js";

describe("ProviderRegistry", () => {
	let registry: EnhancementProviderRegistry;

	beforeEach(() => {
		registry = createProviderRegistry();
	});

	describe("register/unregister", () => {
		it("should register a provider", () => {
			const provider = new OpenAICompatibleProvider();
			registry.register(provider);
			expect(registry.get("openai-compatible")).toBeDefined();
		});

		it("should unregister a provider", () => {
			const provider = new OpenAICompatibleProvider();
			registry.register(provider);
			registry.unregister("openai-compatible");
			expect(registry.get("openai-compatible")).toBeUndefined();
		});

		it("should list all providers", () => {
			const provider1 = new OpenAICompatibleProvider("https://api.example.com/v1");
			provider1.name = "provider1";
			const provider2 = new OpenAICompatibleProvider("https://api.example2.com/v1");
			provider2.name = "provider2";

			registry.register(provider1);
			registry.register(provider2);

			const list = registry.list();
			expect(list.length).toBe(2);
		});
	});

	describe("default provider", () => {
		it("should set first provider as default", () => {
			const provider = new OpenAICompatibleProvider();
			registry.register(provider);
			expect(registry.getDefault()?.name).toBe("openai-compatible");
		});

		it("should change default provider", () => {
			const provider1 = new OpenAICompatibleProvider();
			provider1.name = "provider1";

			const provider2 = new OpenAICompatibleProvider();
			provider2.name = "provider2";

			registry.register(provider1);
			registry.register(provider2);
			registry.setDefault("provider2");

			expect(registry.getDefault()?.name).toBe("provider2");
		});

		it("should throw when setting non-existent default", () => {
			expect(() => registry.setDefault("nonexistent")).toThrow();
		});
	});

	describe("resolveModel", () => {
		it("should resolve model from registered provider", () => {
			const provider = new OpenAICompatibleProvider();
			registry.register(provider);

			const resolution = registry.resolveModel("gpt-4");
			expect(resolution).not.toBeNull();
			expect(resolution?.provider.name).toBe("openai-compatible");
			expect(resolution?.model.id).toBe("gpt-4");
		});

		it("should return null when no providers registered", () => {
			const resolution = registry.resolveModel("gpt-4");
			expect(resolution).toBeNull();
		});
	});
});

describe("OpenAICompatibleProvider", () => {
	const provider = new OpenAICompatibleProvider("https://api.openai.com/v1", "test-key");

	describe("defaultEndpoint", () => {
		it("should return default endpoint", () => {
			const endpoint = provider.defaultEndpoint;
			expect(endpoint.baseUrl).toBe("https://api.openai.com/v1");
			expect(endpoint.apiKey).toBe("test-key");
		});
	});

	describe("testConnection", () => {
		it("should return false for unreachable endpoint", async () => {
			const localProvider = new OpenAICompatibleProvider("http://localhost:99999");
			const result = await localProvider.testConnection(localProvider.defaultEndpoint);
			expect(result).toBe(false);
		});
	});
});
