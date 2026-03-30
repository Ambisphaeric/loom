// HTTP Routes for Loom Server
// Implements REST API per AGENTS-SERVER.md spec

import { Hono } from "hono";
import type { ServerConfig } from "../types.js";

export function createHttpApp(config: ServerConfig): Hono {
  const app = new Hono();

  // Health check (public)
  app.get("/health", async (c) => {
    return c.json({
      status: "ok",
      version: "0.1.0",
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  // Metrics (public, Prometheus format)
  app.get("/metrics", async (c) => {
    // TODO: Implement metrics collection
    const metrics = `# loom_server_uptime_seconds ${process.uptime()}
# loom_server_http_requests_total 0
# loom_server_websocket_connections 0
`;
    return c.text(metrics);
  });

  // API v1 routes (require auth)
  const api = new Hono();

  // Workspace management
  api.get("/workspaces", async (c) => {
    // TODO: List workspaces from store
    return c.json({ workspaces: [] });
  });

  api.post("/workspaces", async (c) => {
    const body = await c.req.json();
    // TODO: Create workspace
    return c.json({ id: "ws-1", name: body.name, createdAt: Date.now() });
  });

  api.delete("/workspaces/:id", async (c) => {
    const id = c.req.param("id");
    // TODO: Delete workspace
    return c.json({ deleted: true, id });
  });

  // Credential management
  api.get("/credentials", async (c) => {
    // TODO: List credentials for workspace
    return c.json({ credentials: [] });
  });

  api.post("/credentials", async (c) => {
    const body = await c.req.json();
    // TODO: Set credential
    return c.json({
      id: "cred-1",
      service: body.service,
      account: body.account || "default",
      createdAt: Date.now(),
    });
  });

  api.delete("/credentials/:id", async (c) => {
    const id = c.req.param("id");
    // TODO: Delete credential
    return c.json({ deleted: true, id });
  });

  // Recipe execution
  api.get("/recipes", async (c) => {
    // TODO: List available recipes from store
    return c.json({ recipes: [] });
  });

  api.post("/recipes/:id/run", async (c) => {
    const recipeId = c.req.param("id");
    const body = await c.req.json();
    // TODO: Execute recipe via executor
    return c.json({
      runId: `run-${Date.now()}`,
      recipeId,
      sessionId: body.sessionId || `session-${Date.now()}`,
      status: "running",
      startedAt: Date.now(),
    });
  });

  api.get("/recipes/:id/status", async (c) => {
    const recipeId = c.req.param("id");
    // TODO: Get recipe status from store/executor
    return c.json({
      recipeId,
      status: "idle",
      lastRunAt: null,
    });
  });

  // Session management
  api.get("/sessions", async (c) => {
    // TODO: List active sessions
    return c.json({ sessions: [] });
  });

  api.get("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    // TODO: Get session details
    return c.json({
      id,
      workspace: "default",
      status: "idle",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  api.delete("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    // TODO: Kill running session
    return c.json({ killed: true, id });
  });

  // Mount API with auth middleware
  app.route("/api/v1", api);

  return app;
}
