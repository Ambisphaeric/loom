// HTTP Middleware for Loom Server
// Auth, rate limiting, CORS, workspace isolation

import type { Context, Next } from "hono";
import type { ServerConfig } from "../types.js";
import { AuthenticationError, AuthorizationError, RateLimitError } from "../types.js";

// ============================================================================
// Authentication Middleware
// ============================================================================

export function createAuthMiddleware(config: ServerConfig) {
  return async function authMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header("Authorization");

    if (!authHeader) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
      return c.json({ error: "Invalid authorization header. Use 'Bearer <token>'" }, 401);
    }

    try {
      // TODO: Validate token against credentials provider
      // Extract workspace from token or use explicit header
      const workspace = c.req.header("X-Workspace") || "default";
      
      // Attach to context for downstream use
      c.set("workspace", workspace);
      c.set("token", token);
      
      await next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return c.json({ error: error.message }, 401);
      }
      if (error instanceof AuthorizationError) {
        return c.json({ error: error.message }, 403);
      }
      throw error;
    }
  };
}

// ============================================================================
// Rate Limiting Middleware
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function createRateLimitMiddleware(config: ServerConfig) {
  const { windowMs, maxRequests } = config.rateLimit;

  return async function rateLimitMiddleware(c: Context, next: Next) {
    const workspace = c.get("workspace") || "default";
    const key = `ratelimit:${workspace}`;
    
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetAt) {
      // Reset window
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
    } else {
      entry.count++;
      if (entry.count > maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return c.json(
          { error: "Rate limit exceeded", retryAfter },
          429,
          { "Retry-After": String(retryAfter) }
        );
      }
    }

    await next();
  };
}

// ============================================================================
// CORS Middleware
// ============================================================================

export function createCorsMiddleware(config: ServerConfig) {
  const { origins, credentials } = config.cors;

  return async function corsMiddleware(c: Context, next: Next) {
    const origin = c.req.header("Origin");
    
    // Check if origin is allowed
    const isAllowed = origin && origins.includes(origin);
    
    if (isAllowed) {
      c.header("Access-Control-Allow-Origin", origin);
    }
    
    if (credentials) {
      c.header("Access-Control-Allow-Credentials", "true");
    }
    
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace");

    // Handle preflight
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    await next();
  };
}

// ============================================================================
// Error Handling Middleware
// ============================================================================

export function errorHandler(err: Error, c: Context) {
  console.error(`[Server] Error:`, err);

  if (err instanceof AuthenticationError) {
    return c.json({ error: err.message }, 401);
  }

  if (err instanceof AuthorizationError) {
    return c.json({ error: err.message }, 403);
  }

  if (err instanceof RateLimitError) {
    return c.json({ error: err.message }, 429);
  }

  // Generic error
  return c.json(
    { error: "Internal server error", message: err.message },
    500
  );
}
