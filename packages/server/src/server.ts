// Main Server Implementation
// Combines HTTP REST API and WebSocket streaming using Bun's native server

import { Hono } from "hono";
import type { ServerWebSocket } from "bun";
import type { ServerConfig, ShutdownOptions } from "./types.js";
import { createHttpApp } from "./http/routes.js";
import {
	createAuthMiddleware,
	createRateLimitMiddleware,
	createCorsMiddleware,
	errorHandler,
} from "./http/middleware.js";
import { BusHub } from "./websocket/bus-hub.js";
import { SessionHub } from "./websocket/session-hub.js";

export { type ServerConfig, type ShutdownOptions } from "./types.js";

// WebSocket data structure
interface WSData {
	url: string;
	workspace: string;
}

export class EnhancementServer {
	private config: ServerConfig;
	private httpServer?: ReturnType<typeof Bun.serve>;
	private busHub: BusHub;
	private sessionHub: SessionHub;
	private isRunning = false;

	constructor(config: ServerConfig) {
		this.config = config;
		this.busHub = new BusHub(config);
		this.sessionHub = new SessionHub(config);
	}

	/**
	 * Start the HTTP and WebSocket server
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			throw new Error("Server is already running");
		}

		const app = createHttpApp(this.config);

		// Apply middleware
		app.use("*", createCorsMiddleware(this.config));
		app.use("/api/*", createAuthMiddleware(this.config));
		app.use("/api/*", createRateLimitMiddleware(this.config));
		app.onError(errorHandler);

		// Create Bun server with WebSocket support
		this.httpServer = Bun.serve<WSData>({
			port: this.config.httpPort,
			fetch: (req: Request, server: { upgrade: (req: Request, opts?: { data?: WSData }) => boolean }) => {
				const url = new URL(req.url);

				// Handle WebSocket upgrade requests
				if (url.pathname === "/ws/bus" || url.pathname.startsWith("/ws/sessions/")) {
					const workspace = req.headers.get("X-Workspace") || "default";
					const success = server.upgrade(req, {
						data: { url: req.url, workspace },
					});
					if (success) {
						return new Response("Upgraded", { status: 101 });
					}
				}

				// Fall through to Hono app for HTTP
				return app.fetch(req, server);
			},
			websocket: {
				open: (ws: ServerWebSocket<WSData>) => {
					const data = ws.data;
					const url = new URL(data.url);
					const path = url.pathname;
					const workspace = data.workspace || "default";

					if (path === "/ws/bus") {
						this.busHub.handleConnection(ws as unknown as WebSocket, workspace);
					} else if (path.startsWith("/ws/sessions/")) {
						const sessionId = path.split("/")[3];
						this.sessionHub.handleConnection(ws as unknown as WebSocket, sessionId, workspace);
					} else {
						ws.close(1008, "Invalid WebSocket path");
					}
				},
				message: (ws: ServerWebSocket<WSData>, message: string | Uint8Array) => {
					// Handled by hub's socket event listeners
					// This receives raw messages from the client
					const data = ws.data;
					const url = new URL(data.url);
					const path = url.pathname;
					
					if (path === "/ws/bus") {
						// Forward to bus hub for subscription management
						this.busHub.handleClientMessage(ws as unknown as WebSocket, message.toString());
					}
				},
				close: (ws: ServerWebSocket<WSData>) => {
					// Handled by hub's socket event listeners
				},
			},
		});

		this.isRunning = true;
		console.log(`[Server] Running on port ${this.config.httpPort}`);
		console.log(`[Server] HTTP API: http://localhost:${this.config.httpPort}/api/v1`);
		console.log(`[Server] WebSocket: ws://localhost:${this.config.httpPort}/ws/bus`);
	}

	/**
	 * Graceful shutdown with connection draining
	 */
	async shutdown(options: ShutdownOptions): Promise<void> {
		if (!this.isRunning) return;

		const { drainTimeoutMs, forceAfterMs } = options;
		const shutdownStart = Date.now();

		console.log("[Server] Starting graceful shutdown...");

		// Stop accepting new connections
		this.isRunning = false;

		// Shutdown WebSocket hubs
		this.busHub.shutdown();
		this.sessionHub.shutdown();

		// Wait for in-flight HTTP requests
		await new Promise((resolve) => {
			const timeout = Math.min(drainTimeoutMs, forceAfterMs);
			setTimeout(resolve, timeout);
		});

		// Stop HTTP server
		this.httpServer?.stop(true);

		const duration = Date.now() - shutdownStart;
		console.log(`[Server] Shutdown complete in ${duration}ms`);
	}

	/**
	 * Get current metrics
	 */
	getMetrics() {
		return {
			httpRequestsTotal: 0, // TODO: Track
			websocketConnections: this.busHub.getConnectionCount() + this.getSessionConnections(),
			activeSessions: 0, // TODO: Track
			uptime: process.uptime(),
		};
	}

	/**
	 * Update rate limit configuration
	 */
	updateRateLimit(config: { windowMs: number; maxRequests: number }): void {
		this.config.rateLimit = config;
		console.log(`[Server] Rate limit updated: ${config.maxRequests} req/${config.windowMs}ms`);
	}

	private getSessionConnections(): number {
		// Sum across all sessions
		// TODO: Track in SessionHub
		return 0;
	}
}

/**
	 * Factory function to create server
	 */
export function createServer(config: ServerConfig): EnhancementServer {
	return new EnhancementServer(config);
}

/**
	 * Convenience function to create and start in one call
	 */
export async function startServer(config: ServerConfig): Promise<EnhancementServer> {
	const server = createServer(config);
	await server.start();
	return server;
}
