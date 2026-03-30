import { describe, expect, test } from "bun:test";
import { EnhancementServer, createServer, AuthenticationError } from "../src/index.js";
import { EnhancementBus } from "@loomai/bus";
import { RecipeExecutor } from "@loomai/recipe";
import { EnhancementStore } from "@loomai/store";

// Import credentials types directly since credentials package needs special setup
type CredentialProvider = {
	get(service: string, account?: string): Promise<string | null>;
	set(service: string, account: string, value: string, metadata?: unknown): Promise<void>;
};

const mockCredentials: CredentialProvider = {
	async get() { return null; },
	async set() {},
};

describe("@loomai/server conformance", () => {
	test("exports EnhancementServer class", () => {
		expect(EnhancementServer).toBeDefined();
		expect(typeof EnhancementServer).toBe("function");
	});

	test("exports createServer factory function", () => {
		expect(createServer).toBeDefined();
		expect(typeof createServer).toBe("function");
	});

	test("can create server with required config", async () => {
		const bus = new EnhancementBus();
		const executor = new RecipeExecutor();
		const credentials = mockCredentials;
		const store = new EnhancementStore({
			workspace: "test",
			sessionId: "test-session",
			embeddingEngine: { engine: "zvec" },
		});

		const server = createServer({
			httpPort: 0, // Random port for testing
			bus,
			executor,
			credentials,
			store,
			cors: {
				origins: ["http://localhost:3000"],
				credentials: true,
			},
			rateLimit: {
				windowMs: 60000,
				maxRequests: 100,
			},
		});

		expect(server).toBeInstanceOf(EnhancementServer);
	});

	test("exports error types", () => {
		expect(AuthenticationError).toBeDefined();
		const err = new AuthenticationError("test");
		expect(err.name).toBe("AuthenticationError");
	});
});
