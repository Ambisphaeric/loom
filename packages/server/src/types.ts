import type { ContextChunk, RawChunk } from "@loomai/types";
import type { EnhancementBus } from "@loomai/bus";
import type { RecipeExecutor } from "@loomai/recipe";
import type { CredentialProvider } from "@loomai/credentials";
import type { EnhancementStore } from "@loomai/store";

// ============================================================================
// Server Configuration
// ============================================================================

export interface ServerConfig {
  httpPort: number;
  bus: EnhancementBus;
  executor: RecipeExecutor;
  credentials: CredentialProvider;
  store: EnhancementStore;
  cors: CorsConfig;
  rateLimit: RateLimitConfig;
}

export interface CorsConfig {
  origins: string[];
  credentials: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface ShutdownOptions {
  drainTimeoutMs: number;
  forceAfterMs: number;
}

// ============================================================================
// HTTP Types
// ============================================================================

export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  version: string;
  uptime: number;
  timestamp: number;
}

export interface WorkspaceCreateRequest {
  name: string;
  description?: string;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CredentialSetRequest {
  service: string;
  account?: string;
  value: string;
  metadata?: Record<string, unknown>;
}

export interface CredentialResponse {
  id: string;
  service: string;
  account: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

export interface RecipeRunRequest {
  inputs?: ContextChunk[];
  options?: {
    sessionId?: string;
    mode?: "sync" | "async";
  };
}

export interface RecipeRunResponse {
  runId: string;
  recipeId: string;
  sessionId: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface SessionResponse {
  id: string;
  workspace: string;
  recipeId?: string;
  runId?: string;
  status: "running" | "completed" | "failed" | "idle";
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface BusSubscriptionMessage {
  type: "subscribe" | "unsubscribe";
  contentTypes?: string[]; // Wildcard patterns like "notification/*"
}

export interface BusEventMessage {
  type: "chunk";
  payload: ContextChunk | RawChunk;
  workspace: string;
  timestamp: number;
}

export interface SessionUpdateMessage {
  type: "status" | "progress" | "output" | "error";
  sessionId: string;
  status?: "running" | "completed" | "failed";
  progress?: number; // 0-100
  output?: ContextChunk;
  error?: string;
  timestamp: number;
}

export interface WebSocketAuthMessage {
  type: "auth";
  token: string;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface ServerMetrics {
  httpRequestsTotal: number;
  httpRequestDuration: number; // avg ms
  websocketConnections: number;
  websocketMessagesPerSecond: number;
  activeSessions: number;
  rateLimitHits: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class AuthenticationError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(workspace: string) {
    super(`Not authorized for workspace: ${workspace}`);
    this.name = "AuthorizationError";
  }
}

export class RateLimitError extends Error {
  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter}ms`);
    this.name = "RateLimitError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}
