import type { ContextChunk, MemoryFilter, ScanResult } from "@enhancement/types";

export type VectorEngine = "zvec" | "sqlite-vec" | "chroma";

export interface ChunkRow {
	id: string;
	source: string;
	transform: string | null;
	workspace: string;
	session_id: string;
	content: string;
	content_type: string;
	timestamp: number;
	generation: number;
	ttl: number | null;
	metadata: string | null;
	created_at: number;
}

export interface ChunkEmbeddingRow {
	chunk_id: string;
	embedding: Float32Array;
	distance?: number;
}

export interface ProfileRow {
	workspace: string;
	summary: string;
	frequent_actions: string;
	dismissed_patterns: string;
	last_updated: number;
}

export interface SessionRow {
	id: string;
	workspace: string;
	type: string;
	status: string;
	started_at: number;
	ended_at: number | null;
	duration: number | null;
	chunks_captured: number;
	metadata: string | null;
}

export interface VectorIndex {
	init(db: Database): Promise<void>;
	upsertEmbedding(chunkId: string, embedding: number[]): Promise<void>;
	searchEmbedding(embedding: number[], limit: number, filter?: Record<string, unknown>): Promise<ChunkEmbeddingRow[]>;
	deleteEmbeddings(chunkIds: string[]): Promise<void>;
	deleteOrphaned(): Promise<void>;
}

export interface Database {
	exec(sql: string): void;
	prepare(sql: string): Statement;
	close(): void;
}

export interface Statement {
	run(...params: unknown[]): void;
	all(...params: unknown[]): unknown[];
	get(...params: unknown[]): unknown;
}

export interface VectorEngineAdapter {
	name: VectorEngine;
	init(db: Database): Promise<void>;
	upsert(chunkId: string, embedding: number[]): Promise<void>;
	search(embedding: number[], limit: number, filter?: Record<string, unknown>): Promise<ChunkEmbeddingRow[]>;
	delete(chunkIds: string[]): Promise<void>;
	cleanup(): Promise<void>;
}

export interface StoreOptions {
	engine?: VectorEngine;
	embeddingDim?: number;
	dbPath?: string;
}

export interface SessionStoreOptions extends StoreOptions {
	sessionId: string;
}

export interface SessionStore {
	sessionId: string;
	store(chunk: ContextChunk): Promise<void>;
	query(query: string, filter?: MemoryFilter, limit?: number): Promise<ContextChunk[]>;
	scan(cursor: string, filter?: MemoryFilter, limit?: number): Promise<ScanResult>;
	forget(filter: MemoryFilter): Promise<number>;
	addRagDocs(docs: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>): Promise<void>;
	removeRagDocs(docIds: string[]): Promise<void>;
	prune(): Promise<number>;
	getStats(): Promise<{ totalChunks: number; ragDocs: number }>;
}
