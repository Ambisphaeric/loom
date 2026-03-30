import type {
	ContextChunk,
	MemoryFilter,
	ScanResult,
	UserProfile,
} from "@enhancement/types";
import type {
	Database,
	ChunkRow,
	VectorEngineAdapter,
	VectorEngine,
	SessionStore,
} from "./schema.js";
import { createEngine } from "./engine.js";

const DEFAULT_EMBEDDING_DIM = 384;

export class EnhancementStore {
	private db!: Database;
	private engine!: VectorEngineAdapter;
	private embeddingDim: number;
	private isInitialized = false;
	private engineType: VectorEngine;

	constructor(
		private dbPath: string = ":memory:",
		options: { engine?: VectorEngine; embeddingDim?: number } = {}
	) {
		this.engineType = options.engine ?? "zvec";
		this.embeddingDim = options.embeddingDim ?? DEFAULT_EMBEDDING_DIM;
	}

	async init(): Promise<void> {
		if (this.isInitialized) return;

		this.db = this.createDatabase(this.dbPath);
		this.engine = await createEngine(this.engineType, this.embeddingDim);
		await this.engine.init(this.db);

		this.initSchema();
		this.isInitialized = true;
	}

	private createDatabase(path: string): Database {
		if (typeof Bun !== "undefined") {
			const { Database } = require("bun:sqlite");
			const db = new Database(path);
			db.exec("PRAGMA journal_mode = WAL");
			db.exec("PRAGMA foreign_keys = ON");
			return db;
		}
		throw new Error("EnhancementStore requires Bun runtime");
	}

	private initSchema(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS chunks (
				id TEXT PRIMARY KEY,
				source TEXT NOT NULL,
				transform TEXT,
				workspace TEXT NOT NULL,
				session_id TEXT NOT NULL,
				content TEXT NOT NULL,
				content_type TEXT NOT NULL,
				timestamp INTEGER NOT NULL,
				generation INTEGER NOT NULL DEFAULT 0,
				ttl INTEGER,
				metadata TEXT,
				created_at INTEGER NOT NULL
			)
		`);

		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON chunks(workspace)
		`);
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks(session_id)
		`);
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_timestamp ON chunks(timestamp)
		`);
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_content_type ON chunks(content_type)
		`);

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS profiles (
				workspace TEXT PRIMARY KEY,
				summary TEXT NOT NULL DEFAULT '',
				frequent_actions TEXT NOT NULL DEFAULT '[]',
				dismissed_patterns TEXT NOT NULL DEFAULT '[]',
				last_updated INTEGER NOT NULL
			)
		`);

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS rag_docs (
				id TEXT PRIMARY KEY,
				session_id TEXT NOT NULL,
				content TEXT NOT NULL,
				metadata TEXT,
				created_at INTEGER NOT NULL
			)
		`);

		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON chunks(workspace)
		`);
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks(session_id)
		`);
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_timestamp ON chunks(timestamp)
		`);
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_content_type ON chunks(content_type)
		`);
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_rag_docs_session ON rag_docs(session_id)
		`);

		// Workspace management table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS workspaces (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);

		// Session management table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				workspace TEXT NOT NULL,
				recipe_id TEXT,
				run_id TEXT,
				status TEXT NOT NULL DEFAULT 'idle',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				FOREIGN KEY (workspace) REFERENCES workspaces(id) ON DELETE CASCADE
			)
		`);

		// Recipe storage table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS recipes (
				id TEXT PRIMARY KEY,
				workspace TEXT NOT NULL,
				name TEXT NOT NULL,
				description TEXT,
				steps TEXT NOT NULL, -- JSON array
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				FOREIGN KEY (workspace) REFERENCES workspaces(id) ON DELETE CASCADE
			)
		`);

		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace)
		`);
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_recipes_workspace ON recipes(workspace)
		`);
	}

	async store(chunk: ContextChunk): Promise<void> {
		if (!this.isInitialized) {
			throw new Error("Store not initialized");
		}

		const now = Date.now();

		this.db
			.prepare(
				`INSERT OR REPLACE INTO chunks (id, source, transform, workspace, session_id, content, content_type, timestamp, generation, ttl, metadata, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				chunk.id,
				chunk.source,
				chunk.transform ?? null,
				chunk.workspace,
				chunk.sessionId,
				chunk.content,
				chunk.contentType,
				chunk.timestamp,
				chunk.generation,
				chunk.ttl ?? null,
				chunk.metadata ? JSON.stringify(chunk.metadata) : null,
				now
			);

		if (chunk.embeddings) {
			await this.engine.upsert(chunk.id, chunk.embeddings);
		}
	}

	async query(
		queryText: string,
		filter: MemoryFilter = {},
		limit = 20
	): Promise<ContextChunk[]> {
		if (!this.isInitialized) {
			throw new Error("Store not initialized");
		}

		const escaped = `%${queryText.replace(/['"]/g, "")}%`;
		const conditions: string[] = ["content LIKE ?"];
		const params: unknown[] = [escaped];

		if (filter.sessionId) {
			conditions.push("session_id = ?");
			params.push(filter.sessionId);
		}
		if (filter.workspace) {
			conditions.push("workspace = ?");
			params.push(filter.workspace);
		}
		if (filter.contentType) {
			conditions.push("content_type = ?");
			params.push(filter.contentType);
		}
		if (filter.source) {
			conditions.push("source = ?");
			params.push(filter.source);
		}
		if (filter.before) {
			conditions.push("timestamp <= ?");
			params.push(filter.before);
		}
		if (filter.after) {
			conditions.push("timestamp >= ?");
			params.push(filter.after);
		}

		params.push(limit);

		const rows = this.db
			.prepare(
				`SELECT *
				 FROM chunks
				 WHERE ${conditions.join(" AND ")}
				 ORDER BY timestamp DESC
				 LIMIT ?`
			)
			.all(...params) as ChunkRow[];

		return rows.map((row) => this.rowToChunk(row));
	}

	async scan(
		cursor: string,
		filter: MemoryFilter = {},
		limit = 100
	): Promise<ScanResult> {
		const rows = this.db
			.prepare(
				`SELECT * FROM chunks
				 WHERE id > ?
				 ${filter.workspace ? "AND workspace = ?" : ""}
				 ${filter.sessionId ? "AND session_id = ?" : ""}
				 ORDER BY id ASC
				 LIMIT ?`
			)
			.all(
				cursor,
				...(filter.workspace ? [filter.workspace] : []),
				...(filter.sessionId ? [filter.sessionId] : []),
				limit
			) as ChunkRow[];

		const chunks = rows.map((row) => this.rowToChunk(row));
		const nextCursor = chunks.length > 0 ? chunks[chunks.length - 1].id : cursor;

		return { chunks, nextCursor };
	}

	async forget(filter: MemoryFilter): Promise<number> {
		if (!filter.workspace && !filter.sessionId && !filter.source && !filter.before && !filter.after && !filter.contentType) {
			throw new Error("forget() requires at least one filter");
		}

		const conditions: string[] = [];
		const params: unknown[] = [];

		if (filter.workspace) {
			conditions.push("workspace = ?");
			params.push(filter.workspace);
		}
		if (filter.sessionId) {
			conditions.push("session_id = ?");
			params.push(filter.sessionId);
		}
		if (filter.source) {
			conditions.push("source = ?");
			params.push(filter.source);
		}
		if (filter.before) {
			conditions.push("timestamp <= ?");
			params.push(filter.before);
		}
		if (filter.after) {
			conditions.push("timestamp >= ?");
			params.push(filter.after);
		}
		if (filter.contentType) {
			conditions.push("content_type = ?");
			params.push(filter.contentType);
		}

		const where = conditions.join(" AND ");

		const countResult = this.db
			.prepare(`SELECT COUNT(*) as count FROM chunks WHERE ${where}`)
			.get(...params) as { count: number };

		this.db
			.prepare(`DELETE FROM chunks WHERE ${where}`)
			.run(...params);

		return countResult.count;
	}

	async getProfile(workspace: string): Promise<UserProfile> {
		const row = this.db
			.prepare("SELECT * FROM profiles WHERE workspace = ?")
			.get(workspace) as { workspace: string; summary: string; frequent_actions: string; dismissed_patterns: string; last_updated: number } | undefined;

		if (!row) {
			return {
				workspace,
				summary: "",
				frequentActions: [],
				dismissedPatterns: [],
				lastUpdated: 0,
			};
		}

		return {
			workspace: row.workspace,
			summary: row.summary,
			frequentActions: JSON.parse(row.frequent_actions),
			dismissedPatterns: JSON.parse(row.dismissed_patterns),
			lastUpdated: row.last_updated,
		};
	}

	async updateProfile(profile: UserProfile): Promise<void> {
		this.db
			.prepare(
				`INSERT OR REPLACE INTO profiles (workspace, summary, frequent_actions, dismissed_patterns, last_updated)
				 VALUES (?, ?, ?, ?, ?)`
			)
			.run(
				profile.workspace,
				profile.summary,
				JSON.stringify(profile.frequentActions),
				JSON.stringify(profile.dismissedPatterns),
				profile.lastUpdated
			);
	}

	async prune(workspace: string): Promise<number> {
		const now = Date.now();

		const countResult = this.db
			.prepare(
				`SELECT COUNT(*) as count FROM chunks WHERE workspace = ? AND ttl IS NOT NULL AND (created_at + ttl * 1000) < ?`
			)
			.get(workspace, now) as { count: number };

		this.db
			.prepare(
				`DELETE FROM chunks WHERE workspace = ? AND ttl IS NOT NULL AND (created_at + ttl * 1000) < ?`
			)
			.run(workspace, now);

		await this.engine.cleanup();

		return countResult.count;
	}

	createSessionStore(sessionId: string): SessionStore {
		return new SessionStoreImpl(this, sessionId);
	}

	getEngineType(): VectorEngine {
		return this.engineType;
	}

	getDatabase(): Database {
		return this.db;
	}

	close(): void {
		if (this.db) {
			this.db.close();
		}
		this.isInitialized = false;
	}

	// ============================================================================
	// Workspace Management
	// ============================================================================

	async listWorkspaces(): Promise<Array<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number }>> {
		const rows = this.db.prepare(`
			SELECT id, name, description, created_at, updated_at FROM workspaces ORDER BY created_at DESC
		`).all() as Array<{ id: string; name: string; description: string | null; created_at: number; updated_at: number }>;
		
		return rows.map(row => ({
			id: row.id,
			name: row.name,
			description: row.description ?? undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
	}

	async getWorkspace(id: string): Promise<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number } | null> {
		const row = this.db.prepare(`
			SELECT id, name, description, created_at, updated_at FROM workspaces WHERE id = ?
		`).get(id) as { id: string; name: string; description: string | null; created_at: number; updated_at: number } | undefined;
		
		if (!row) return null;
		
		return {
			id: row.id,
			name: row.name,
			description: row.description ?? undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	async createWorkspace(workspace: { id: string; name: string; description?: string }): Promise<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number }> {
		const now = Date.now();
		this.db.prepare(`
			INSERT OR REPLACE INTO workspaces (id, name, description, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`).run(workspace.id, workspace.name, workspace.description ?? null, now, now);
		
		return {
			id: workspace.id,
			name: workspace.name,
			description: workspace.description,
			createdAt: now,
			updatedAt: now,
		};
	}

	async deleteWorkspace(id: string): Promise<boolean> {
		const result = this.db.prepare(`DELETE FROM workspaces WHERE id = ?`).run(id);
		return result.changes > 0;
	}

	// ============================================================================
	// Session Management
	// ============================================================================

	async listSessions(workspace?: string): Promise<Array<{ id: string; workspace: string; recipeId?: string; runId?: string; status: string; createdAt: number; updatedAt: number }>> {
		let query = `SELECT id, workspace, recipe_id, run_id, status, created_at, updated_at FROM sessions`;
		let rows: Array<{ id: string; workspace: string; recipe_id: string | null; run_id: string | null; status: string; created_at: number; updated_at: number }>;
		
		if (workspace) {
			query += ` WHERE workspace = ? ORDER BY created_at DESC`;
			rows = this.db.prepare(query).all(workspace) as typeof rows;
		} else {
			query += ` ORDER BY created_at DESC`;
			rows = this.db.prepare(query).all() as typeof rows;
		}
		
		return rows.map(row => ({
			id: row.id,
			workspace: row.workspace,
			recipeId: row.recipe_id ?? undefined,
			runId: row.run_id ?? undefined,
			status: row.status,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
	}

	async getSession(id: string): Promise<{ id: string; workspace: string; recipeId?: string; runId?: string; status: string; createdAt: number; updatedAt: number } | null> {
		const row = this.db.prepare(`
			SELECT id, workspace, recipe_id, run_id, status, created_at, updated_at FROM sessions WHERE id = ?
		`).get(id) as { id: string; workspace: string; recipe_id: string | null; run_id: string | null; status: string; created_at: number; updated_at: number } | undefined;
		
		if (!row) return null;
		
		return {
			id: row.id,
			workspace: row.workspace,
			recipeId: row.recipe_id ?? undefined,
			runId: row.run_id ?? undefined,
			status: row.status,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	async createSession(session: { id: string; workspace: string; recipeId?: string; runId?: string; status?: string }): Promise<{ id: string; workspace: string; recipeId?: string; runId?: string; status: string; createdAt: number; updatedAt: number }> {
		const now = Date.now();
		this.db.prepare(`
			INSERT OR REPLACE INTO sessions (id, workspace, recipe_id, run_id, status, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(
			session.id,
			session.workspace,
			session.recipeId ?? null,
			session.runId ?? null,
			session.status ?? "idle",
			now,
			now
		);
		
		return {
			id: session.id,
			workspace: session.workspace,
			recipeId: session.recipeId,
			runId: session.runId,
			status: session.status ?? "idle",
			createdAt: now,
			updatedAt: now,
		};
	}

	async updateSession(id: string, updates: { status?: string; recipeId?: string; runId?: string }): Promise<boolean> {
		const existing = await this.getSession(id);
		if (!existing) return false;
		
		const now = Date.now();
		this.db.prepare(`
			UPDATE sessions SET 
				recipe_id = COALESCE(?, recipe_id),
				run_id = COALESCE(?, run_id),
				status = COALESCE(?, status),
				updated_at = ?
			WHERE id = ?
		`).run(
			updates.recipeId ?? null,
			updates.runId ?? null,
			updates.status ?? null,
			now,
			id
		);
		
		return true;
	}

	async deleteSession(id: string): Promise<boolean> {
		const result = this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
		return result.changes > 0;
	}

	// ============================================================================
	// Recipe Management
	// ============================================================================

	async listRecipes(workspace: string): Promise<Array<{ id: string; workspace: string; name: string; description?: string; steps: unknown[]; createdAt: number; updatedAt: number }>> {
		const rows = this.db.prepare(`
			SELECT id, workspace, name, description, steps, created_at, updated_at 
			FROM recipes 
			WHERE workspace = ? 
			ORDER BY created_at DESC
		`).all(workspace) as Array<{ id: string; workspace: string; name: string; description: string | null; steps: string; created_at: number; updated_at: number }>;
		
		return rows.map(row => ({
			id: row.id,
			workspace: row.workspace,
			name: row.name,
			description: row.description ?? undefined,
			steps: JSON.parse(row.steps),
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
	}

	async getRecipe(id: string, workspace: string): Promise<{ id: string; workspace: string; name: string; description?: string; steps: unknown[]; createdAt: number; updatedAt: number } | null> {
		const row = this.db.prepare(`
			SELECT id, workspace, name, description, steps, created_at, updated_at 
			FROM recipes 
			WHERE id = ? AND workspace = ?
		`).get(id, workspace) as { id: string; workspace: string; name: string; description: string | null; steps: string; created_at: number; updated_at: number } | undefined;
		
		if (!row) return null;
		
		return {
			id: row.id,
			workspace: row.workspace,
			name: row.name,
			description: row.description ?? undefined,
			steps: JSON.parse(row.steps),
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	async createRecipe(recipe: { id: string; workspace: string; name: string; description?: string; steps: unknown[] }): Promise<{ id: string; workspace: string; name: string; description?: string; steps: unknown[]; createdAt: number; updatedAt: number }> {
		const now = Date.now();
		this.db.prepare(`
			INSERT OR REPLACE INTO recipes (id, workspace, name, description, steps, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(
			recipe.id,
			recipe.workspace,
			recipe.name,
			recipe.description ?? null,
			JSON.stringify(recipe.steps),
			now,
			now
		);
		
		return {
			id: recipe.id,
			workspace: recipe.workspace,
			name: recipe.name,
			description: recipe.description,
			steps: recipe.steps,
			createdAt: now,
			updatedAt: now,
		};
	}

	async deleteRecipe(id: string, workspace: string): Promise<boolean> {
		const result = this.db.prepare(`DELETE FROM recipes WHERE id = ? AND workspace = ?`).run(id, workspace);
		return result.changes > 0;
	}

	async healthCheck(): Promise<boolean> {
		try {
			this.db.prepare("SELECT 1").get();
			return true;
		} catch {
			return false;
		}
	}

	private rowToChunk(row: ChunkRow): ContextChunk {
		return {
			kind: "context",
			id: row.id,
			source: row.source,
			transform: row.transform ?? undefined,
			workspace: row.workspace,
			sessionId: row.session_id,
			content: row.content,
			contentType: row.content_type,
			timestamp: row.timestamp,
			generation: row.generation,
			ttl: row.ttl ?? undefined,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
		};
	}
}

class SessionStoreImpl implements SessionStore {
	constructor(
		private parentStore: EnhancementStore,
		public readonly sessionId: string
	) {}

	async store(chunk: ContextChunk): Promise<void> {
		await this.parentStore.store({
			...chunk,
			sessionId: this.sessionId,
		});
	}

	async query(
		queryText: string,
		filter: MemoryFilter = {},
		limit = 20
	): Promise<ContextChunk[]> {
		return this.parentStore.query(queryText, { ...filter, sessionId: this.sessionId }, limit);
	}

	async scan(
		cursor: string,
		filter: MemoryFilter = {},
		limit = 100
	): Promise<ScanResult> {
		return this.parentStore.scan(cursor, { ...filter, sessionId: this.sessionId }, limit);
	}

	async forget(filter: MemoryFilter): Promise<number> {
		return this.parentStore.forget({ ...filter, sessionId: this.sessionId });
	}

	async addRagDocs(
		docs: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>
	): Promise<void> {
		const now = Date.now();
		const db = this.parentStore.getDatabase();

		for (const doc of docs) {
			db.prepare(
				`INSERT OR REPLACE INTO rag_docs (id, session_id, content, metadata, created_at)
				 VALUES (?, ?, ?, ?, ?)`
			).run(
				doc.id,
				this.sessionId,
				doc.content,
				doc.metadata ? JSON.stringify(doc.metadata) : null,
				now
			);

			const chunk: ContextChunk = {
				kind: "context",
				id: doc.id,
				source: "rag",
				workspace: "",
				sessionId: this.sessionId,
				content: doc.content,
				contentType: "document",
				timestamp: now,
				generation: 0,
				metadata: doc.metadata,
			};

			await this.parentStore.store(chunk);
		}
	}

	async removeRagDocs(docIds: string[]): Promise<void> {
		const db = this.parentStore.getDatabase();
		const placeholders = docIds.map(() => "?").join(",");
		db.prepare(`DELETE FROM rag_docs WHERE id IN (${placeholders}) AND session_id = ?`)
			.run(...docIds, this.sessionId);

		await this.parentStore.forget({ source: "rag", sessionId: this.sessionId });
	}

	async prune(): Promise<number> {
		return this.parentStore.forget({ sessionId: this.sessionId, before: Date.now() - 7 * 24 * 60 * 60 * 1000 });
	}

	async getStats(): Promise<{ totalChunks: number; ragDocs: number }> {
		const db = this.parentStore.getDatabase();
		const chunksResult = db.prepare(`SELECT COUNT(*) as count FROM chunks WHERE session_id = ?`)
			.get(this.sessionId) as { count: number };

		const ragResult = db.prepare(`SELECT COUNT(*) as count FROM rag_docs WHERE session_id = ?`)
			.get(this.sessionId) as { count: number };

		return {
			totalChunks: chunksResult.count,
			ragDocs: ragResult.count,
		};
	}
}

export function createStore(options: { engine?: VectorEngine; dbPath?: string; embeddingDim?: number } = {}): EnhancementStore {
	const store = new EnhancementStore(options.dbPath ?? ":memory:", {
		engine: options.engine ?? "zvec",
		embeddingDim: options.embeddingDim,
	});
	return store;
}

export function createSessionStore(
	store: EnhancementStore,
	sessionId: string
): SessionStore {
	return store.createSessionStore(sessionId);
}
