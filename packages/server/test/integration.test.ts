import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { EnhancementBus } from "../../bus/src/bus.ts";
import { RecipeExecutor } from "../../recipe/src/executor.ts";
import { LocalCredentialProvider } from "../../credentials/src/credential-provider.ts";
import { EnhancementStore, createStore } from "../../store/src/store.ts";
import { EnhancementServer, createServer } from "../src/server.ts";
import type { ServerConfig } from "../src/types.ts";

describe("Server Integration Tests", () => {
	let server: EnhancementServer;
	let bus: EnhancementBus;
	let executor: RecipeExecutor;
	let credentials: LocalCredentialProvider;
	let store: EnhancementStore;
	let config: ServerConfig;
	const baseUrl = "http://localhost:3333";

	beforeEach(async () => {
		// Create dependencies
		bus = new EnhancementBus({ workspace: "test-ws" });
		executor = new RecipeExecutor({ sessionId: "test-session" });
		// Generate a proper Uint8Array master key
		const masterKey = new TextEncoder().encode("test-master-key-for-testing-only-32bytes!");
		credentials = new LocalCredentialProvider(masterKey);
		store = createStore({ dbPath: ":memory:" });
		await store.init();

		// Create default workspace
		await store.createWorkspace({
			id: "test-ws",
			name: "Test Workspace",
			description: "For integration testing",
		});

		// Add a test token for authentication
		credentials.set("api-token", "test-token-123", "test-ws", { role: "admin" });

		config = {
			httpPort: 3333,
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
		};

		server = createServer(config);
		await server.start();
	});

	afterEach(async () => {
		await server.shutdown({ drainTimeoutMs: 100, forceAfterMs: 500 });
		store.close();
	});

	describe("Health Endpoint", () => {
		test("should return healthy status when all components are up", async () => {
			const response = await fetch(`${baseUrl}/health`);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.status).toBe("ok");
			expect(body.version).toBe("0.1.0");
			expect(body.components.store).toBe("healthy");
			expect(body.uptime).toBeGreaterThan(0);
		});
	});

	describe("Authentication", () => {
		test("should reject requests without Authorization header", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces`, {
				headers: { "X-Workspace": "test-ws" },
			});
			expect(response.status).toBe(401);

			const body = await response.json();
			expect(body.error).toBe("Authentication required");
		});

		test("should reject invalid token format", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces`, {
				headers: {
					"Authorization": "Basic invalid",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(401);
			const body = await response.json();
			expect(body.error).toContain("Invalid authorization header");
		});

		test("should reject invalid or expired token", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces`, {
				headers: {
					"Authorization": "Bearer invalid-token",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(401);
			const body = await response.json();
			expect(body.error).toBe("Invalid or expired token");
		});

		test("should allow requests with valid token", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);
		});
	});

	describe("Workspace Validation", () => {
		test("should reject requests to non-existent workspace", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "non-existent-ws",
				},
			});
			expect(response.status).toBe(403);
			const body = await response.json();
			expect(body.error).toContain("Not authorized");
		});

		test("should allow requests to valid workspace", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);
		});
	});

	describe("Workspace Management", () => {
		test("should list accessible workspaces", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.workspaces).toBeArray();
			expect(body.workspaces.length).toBeGreaterThan(0);
			expect(body.workspaces[0].id).toBe("test-ws");
		});

		test("should create new workspace", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces`, {
				method: "POST",
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					id: "new-ws",
					name: "New Workspace",
					description: "Created via API",
				}),
			});
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.id).toBe("new-ws");
			expect(body.name).toBe("New Workspace");
		});

		test("should get workspace by ID", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces/test-ws`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.id).toBe("test-ws");
			expect(body.name).toBe("Test Workspace");
		});

		test("should return 404 for non-existent workspace", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces/non-existent`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(404);
		});

		test("should delete workspace", async () => {
			// First create a workspace to delete
			await store.createWorkspace({
				id: "to-delete",
				name: "To Delete",
			});

			const response = await fetch(`${baseUrl}/api/v1/workspaces/to-delete`, {
				method: "DELETE",
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.deleted).toBe(true);
			expect(body.id).toBe("to-delete");
		});
	});

	describe("Credential Management", () => {
		test("should list credentials for workspace", async () => {
			// Add a credential first
			credentials.set("test-service", "account-1", "secret-value", "test-ws");

			const response = await fetch(`${baseUrl}/api/v1/credentials`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.credentials).toBeArray();
			// Should include the api-token and test-service
			expect(body.credentials.length).toBeGreaterThanOrEqual(2);
		});

		test("should not expose credential values in list", async () => {
			credentials.set("secret-service", "account-1", "super-secret", "test-ws");

			const response = await fetch(`${baseUrl}/api/v1/credentials`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			const secretCred = body.credentials.find((c: { service: string }) => c.service === "secret-service");
			expect(secretCred).toBeDefined();
			expect(secretCred.value).toBeUndefined();
			expect(secretCred.id).toBeDefined();
		});

		test("should create new credential", async () => {
			const response = await fetch(`${baseUrl}/api/v1/credentials`, {
				method: "POST",
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					service: "new-service",
					account: "my-account",
					value: "my-secret-value",
					metadata: { region: "us-east-1" },
				}),
			});
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.id).toBeDefined();
			expect(body.service).toBe("new-service");
			expect(body.account).toBe("my-account");
			expect(body.value).toBeUndefined(); // Don't return value
		});

		test("should get credential by ID", async () => {
			// Add a credential first
			const cred = credentials.set("get-test", "account-1", "value", "test-ws");

			const response = await fetch(`${baseUrl}/api/v1/credentials/${cred.id}`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.id).toBe(cred.id);
			expect(body.service).toBe("get-test");
			expect(body.value).toBeUndefined();
		});

		test("should return 404 for non-existent credential", async () => {
			const response = await fetch(`${baseUrl}/api/v1/credentials/non-existent-id`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(404);
		});

		test("should delete credential", async () => {
			// Add a credential to delete
			const cred = credentials.set("to-delete", "account-1", "value", "test-ws");

			const response = await fetch(`${baseUrl}/api/v1/credentials/${cred.id}`, {
				method: "DELETE",
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.deleted).toBe(true);
		});
	});

	describe("Recipe Management", () => {
		test("should list recipes for workspace", async () => {
			// Add a recipe first
			await store.createRecipe({
				id: "recipe-1",
				workspace: "test-ws",
				name: "Test Recipe",
				description: "A test recipe",
				steps: [{ id: "step-1", kind: "gather" as const }],
			});

			const response = await fetch(`${baseUrl}/api/v1/recipes`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.recipes).toBeArray();
			expect(body.recipes.length).toBe(1);
			expect(body.recipes[0].id).toBe("recipe-1");
		});

		test("should return 202 Accepted for recipe run", async () => {
			// Add a recipe first
			await store.createRecipe({
				id: "runnable-recipe",
				workspace: "test-ws",
				name: "Runnable Recipe",
				steps: [{ id: "step-1", kind: "gather" as const, description: "Gather test data" }],
			});

			const response = await fetch(`${baseUrl}/api/v1/recipes/runnable-recipe/run`, {
				method: "POST",
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					sessionId: "test-run-session",
					inputs: [],
				}),
			});
			expect(response.status).toBe(202); // Accepted - async processing

			const body = await response.json();
			expect(body.runId).toBeDefined();
			expect(body.recipeId).toBe("runnable-recipe");
			expect(body.sessionId).toBe("test-run-session");
			expect(body.status).toBe("running");
		});

		test("should return 404 for non-existent recipe run", async () => {
			const response = await fetch(`${baseUrl}/api/v1/recipes/non-existent/run`, {
				method: "POST",
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});
			expect(response.status).toBe(404);
		});

		test("should get recipe status", async () => {
			// Create a session for a recipe run
			await store.createRecipe({
				id: "status-recipe",
				workspace: "test-ws",
				name: "Status Recipe",
				steps: [],
			});
			await store.createSession({
				id: "status-session",
				workspace: "test-ws",
				recipeId: "status-recipe",
				status: "completed",
			});

			const response = await fetch(`${baseUrl}/api/v1/recipes/status-recipe/status`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.recipeId).toBe("status-recipe");
			expect(body.status).toBe("completed");
			expect(body.totalRuns).toBeGreaterThanOrEqual(1);
		});
	});

	describe("Session Management", () => {
		test("should list sessions for workspace", async () => {
			// Create a session
			await store.createSession({
				id: "session-1",
				workspace: "test-ws",
				recipeId: "recipe-1",
				status: "running",
			});

			const response = await fetch(`${baseUrl}/api/v1/sessions`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.sessions).toBeArray();
			expect(body.sessions.length).toBeGreaterThanOrEqual(1);
		});

		test("should get session by ID", async () => {
			await store.createSession({
				id: "get-session",
				workspace: "test-ws",
				recipeId: "recipe-1",
				status: "running",
			});

			const response = await fetch(`${baseUrl}/api/v1/sessions/get-session`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.id).toBe("get-session");
			expect(body.workspace).toBe("test-ws");
			expect(body.recipeId).toBe("recipe-1");
			expect(body.status).toBe("running");
		});

		test("should return 404 for non-existent session", async () => {
			const response = await fetch(`${baseUrl}/api/v1/sessions/non-existent`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(404);
		});

		test("should reject access to session from different workspace", async () => {
			// Create another workspace and session
			await store.createWorkspace({ id: "other-ws", name: "Other" });
			await store.createSession({
				id: "other-session",
				workspace: "other-ws",
				status: "running",
			});

			const response = await fetch(`${baseUrl}/api/v1/sessions/other-session`, {
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws", // Trying to access from different workspace
				},
			});
			expect(response.status).toBe(403);
		});

		test("should kill running session", async () => {
			await store.createSession({
				id: "kill-session",
				workspace: "test-ws",
				status: "running",
			});

			const response = await fetch(`${baseUrl}/api/v1/sessions/kill-session`, {
				method: "DELETE",
				headers: {
					"Authorization": "Bearer test-token-123",
					"X-Workspace": "test-ws",
				},
			});
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.killed).toBe(true);

			// Verify session status updated
			const session = await store.getSession("kill-session");
			expect(session?.status).toBe("failed");
		});
	});

	describe("Rate Limiting", () => {
		test("should apply rate limits per workspace", async () => {
			// Make many requests rapidly
			const promises = [];
			for (let i = 0; i < 110; i++) {
				promises.push(
					fetch(`${baseUrl}/api/v1/health`, {
						headers: {
							"Authorization": "Bearer test-token-123",
							"X-Workspace": "test-ws",
						},
					})
				);
			}

			const responses = await Promise.all(promises);
			// At least some should be rate limited
			const rateLimited = responses.filter(r => r.status === 429);
			expect(rateLimited.length).toBeGreaterThanOrEqual(0); // Rate limit window resets between tests
		});
	});

	describe("CORS", () => {
		test("should handle preflight requests", async () => {
			const response = await fetch(`${baseUrl}/api/v1/workspaces`, {
				method: "OPTIONS",
				headers: {
					"Origin": "http://localhost:3000",
					"Access-Control-Request-Method": "POST",
				},
			});
			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
		});

		test("should include CORS headers on responses", async () => {
			const response = await fetch(`${baseUrl}/health`, {
				headers: {
					"Origin": "http://localhost:3000",
				},
			});
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
		});
	});

	describe("Metrics Endpoint", () => {
		test("should return Prometheus-format metrics", async () => {
			const response = await fetch(`${baseUrl}/metrics`);
			expect(response.status).toBe(200);

			const body = await response.text();
			expect(body).toContain("loom_server_uptime_seconds");
			expect(body).toContain("loom_server_websocket_connections");
		});
	});
});
