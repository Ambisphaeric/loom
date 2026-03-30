// HTTP Routes for Loom Server
// Implements REST API per AGENTS-SERVER.md spec

import { Hono } from "hono";
import type { ServerConfig } from "../types.js";
import { SessionNotFoundError } from "../types.js";
import type { Recipe, ContextChunk } from "@loomai/types";

export function createHttpApp(config: ServerConfig): Hono {
  const app = new Hono();

  // Health check (public)
  app.get("/health", async (c) => {
    const storeHealthy = await config.store.healthCheck().catch(() => false);
    const busHealthy = true; // Bus doesn't have health check yet
    
    const status = storeHealthy && busHealthy ? "ok" : "degraded";
    
    return c.json({
      status,
      version: "0.1.0",
      uptime: process.uptime(),
      timestamp: Date.now(),
      components: {
        store: storeHealthy ? "healthy" : "unhealthy",
        bus: busHealthy ? "healthy" : "unhealthy",
      },
    });
  });

  // Metrics (public, Prometheus format)
  app.get("/metrics", async (c) => {
    const uptime = process.uptime();
    const busConnections = 0; // TODO: Get from bus hub
    
    const metrics = `# loom_server_uptime_seconds ${uptime}
# loom_server_http_requests_total 0
# loom_server_websocket_connections ${busConnections}
`;
    return c.text(metrics);
  });

  // API v1 routes (require auth)
  const api = new Hono();

  // Workspace management
  api.get("/workspaces", async (c) => {
    const workspace = c.get("workspace");
    const workspaces = await config.store.listWorkspaces();
    // Filter to only show workspaces the user has access to
    const accessibleWorkspaces = workspaces.filter(ws => ws.id === workspace || workspace === "admin");
    return c.json({ workspaces: accessibleWorkspaces });
  });

  api.post("/workspaces", async (c) => {
    const body = await c.req.json();
    const workspace = await config.store.createWorkspace({
      id: body.id || `ws-${Date.now()}`,
      name: body.name,
      description: body.description,
    });
    return c.json(workspace, 201);
  });

  api.get("/workspaces/:id", async (c) => {
    const id = c.req.param("id");
    const workspace = await config.store.getWorkspace(id);
    if (!workspace) {
      return c.json({ error: "Workspace not found" }, 404);
    }
    return c.json(workspace);
  });

  api.delete("/workspaces/:id", async (c) => {
    const id = c.req.param("id");
    await config.store.deleteWorkspace(id);
    return c.json({ deleted: true, id });
  });

  // Credential management
  api.get("/credentials", async (c) => {
    const workspace = c.get("workspace");
    const credentials = config.credentials.list(workspace);
    // Sanitize: don't return actual values
    const sanitized = credentials.map(cred => ({
      id: cred.id,
      service: cred.service,
      account: cred.account,
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
      lastUsedAt: cred.lastUsedAt,
    }));
    return c.json({ credentials: sanitized });
  });

  api.post("/credentials", async (c) => {
    const body = await c.req.json();
    const workspace = c.get("workspace");
    
    const credential = config.credentials.set(
      body.service,
      body.account || "default",
      body.value,
      workspace,
      body.metadata
    );
    
    return c.json({
      id: credential.id,
      service: credential.service,
      account: credential.account,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    }, 201);
  });

  api.get("/credentials/:id", async (c) => {
    const id = c.req.param("id");
    const workspace = c.get("workspace");
    
    // Get credential by ID - need to search in the list
    const allCreds = config.credentials.list(workspace);
    const credential = allCreds.find(cred => cred.id === id);
    
    if (!credential) {
      return c.json({ error: "Credential not found" }, 404);
    }
    
    return c.json({
      id: credential.id,
      service: credential.service,
      account: credential.account,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      lastUsedAt: credential.lastUsedAt,
    });
  });

  api.delete("/credentials/:id", async (c) => {
    const id = c.req.param("id");
    const workspace = c.get("workspace");
    
    // Find and delete the credential
    const allCreds = config.credentials.list(workspace);
    const credential = allCreds.find(cred => cred.id === id);
    
    if (!credential) {
      return c.json({ error: "Credential not found" }, 404);
    }
    
    const deleted = config.credentials.delete(credential.service, credential.account, workspace);
    return c.json({ deleted, id });
  });

  // Recipe execution
  api.get("/recipes", async (c) => {
    const workspace = c.get("workspace");
    const recipes = await config.store.listRecipes(workspace);
    return c.json({ recipes });
  });

  api.post("/recipes/:id/run", async (c) => {
    const recipeId = c.req.param("id");
    const workspace = c.get("workspace");
    const body = await c.req.json();
    
    // Get the recipe from store
    const recipe = await config.store.getRecipe(recipeId, workspace);
    if (!recipe) {
      return c.json({ error: "Recipe not found" }, 404);
    }
    
    // Prepare session ID
    const sessionId = body.sessionId || `session-${Date.now()}`;
    
    // Track the run in session store
    const runId = `run-${Date.now()}`;
    await config.store.createSession({
      id: sessionId,
      workspace,
      recipeId,
      runId,
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    // Prepare inputs
    const inputs: ContextChunk[] = body.inputs || [];
    
    // Execute the recipe asynchronously
    // Fire and forget - WebSocket will receive updates
    config.executor.runRecipe(recipe, inputs, (event) => {
      // Publish progress events to bus for WebSocket clients
      if (event.type === "step_progress" || event.type === "step_completed" || event.type === "step_failed") {
        config.bus.publish({
          kind: "raw",
          source: "recipe-executor",
          workspace,
          sessionId,
          contentType: `recipe/${event.type}`,
          data: JSON.stringify({
            runId,
            recipeId,
            ...event,
          }),
          timestamp: Date.now(),
          generation: 0,
          metadata: { sessionId, runId, recipeId },
        });
      }
      
      // Update session status on completion
      if (event.type === "run_completed") {
        config.store.updateSession(sessionId, {
          status: event.status as "completed" | "failed",
          updatedAt: Date.now(),
        });
      }
    }).then((recipeRun) => {
      // Final update with results
      config.store.updateSession(sessionId, {
        status: recipeRun.status,
        updatedAt: Date.now(),
      });
      
      // Publish completion to bus
      config.bus.publish({
        kind: "raw",
        source: "recipe-executor",
        workspace,
        sessionId,
        contentType: "recipe/completed",
        data: JSON.stringify({
          runId,
          recipeId,
          status: recipeRun.status,
          durationMs: recipeRun.completedAt ? recipeRun.completedAt - recipeRun.createdAt : 0,
        }),
        timestamp: Date.now(),
        generation: 0,
        metadata: { sessionId, runId, recipeId },
      });
    }).catch((error) => {
      // Handle execution failure
      config.store.updateSession(sessionId, {
        status: "failed",
        updatedAt: Date.now(),
      });
      
      config.bus.publish({
        kind: "raw",
        source: "recipe-executor",
        workspace,
        sessionId,
        contentType: "recipe/failed",
        data: JSON.stringify({
          runId,
          recipeId,
          error: error instanceof Error ? error.message : String(error),
        }),
        timestamp: Date.now(),
        generation: 0,
        metadata: { sessionId, runId, recipeId },
      });
    });
    
    return c.json({
      runId,
      recipeId,
      sessionId,
      status: "running",
      startedAt: Date.now(),
    }, 202); // 202 Accepted - async processing
  });

  api.get("/recipes/:id/status", async (c) => {
    const recipeId = c.req.param("id");
    const workspace = c.get("workspace");
    
    // Get recent runs for this recipe from sessions
    const sessions = await config.store.listSessions(workspace);
    const recipeRuns = sessions.filter(s => s.recipeId === recipeId);
    const lastRun = recipeRuns.sort((a, b) => b.createdAt - a.createdAt)[0];
    
    return c.json({
      recipeId,
      status: lastRun?.status || "idle",
      lastRunAt: lastRun?.createdAt || null,
      totalRuns: recipeRuns.length,
    });
  });

  // Session management
  api.get("/sessions", async (c) => {
    const workspace = c.get("workspace");
    const sessions = await config.store.listSessions(workspace);
    return c.json({ sessions });
  });

  api.get("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    const workspace = c.get("workspace");
    const session = await config.store.getSession(id);
    
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    
    if (session.workspace !== workspace) {
      return c.json({ error: "Not authorized for this session" }, 403);
    }
    
    return c.json({
      id: session.id,
      workspace: session.workspace,
      recipeId: session.recipeId,
      runId: session.runId,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  });

  api.delete("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    const workspace = c.get("workspace");
    const session = await config.store.getSession(id);
    
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    
    if (session.workspace !== workspace) {
      return c.json({ error: "Not authorized for this session" }, 403);
    }
    
    // TODO: Actually kill running session in executor
    await config.store.updateSession(id, {
      status: "failed",
      updatedAt: Date.now(),
    });
    
    return c.json({ killed: true, id });
  });

  // Mount API with auth middleware
  app.route("/api/v1", api);

  return app;
}
