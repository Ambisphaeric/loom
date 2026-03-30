import type { VectorEngineAdapter, ChunkEmbeddingRow } from "../schema.js";

export class SqliteVecAdapter implements VectorEngineAdapter {
	name = "sqlite-vec" as const;
	private embeddingDim: number;

	constructor(embeddingDim: number) {
		this.embeddingDim = embeddingDim;
	}

	async init(_db: unknown): Promise<void> {
		console.warn("[SqliteVecAdapter] sqlite-vec requires native module. Using fallback mode.");
	}

	async upsert(chunkId: string, embedding: number[]): Promise<void> {
		console.warn("[SqliteVecAdapter] sqlite-vec not available. Embedding not persisted:", chunkId);
	}

	async search(
		_embedding: number[],
		limit: number,
		_filter?: Record<string, unknown>
	): Promise<ChunkEmbeddingRow[]> {
		console.warn("[SqliteVecAdapter] sqlite-vec not available. Returning empty results.");
		return [];
	}

	async delete(_chunkIds: string[]): Promise<void> {
		console.warn("[SqliteVecAdapter] sqlite-vec not available. No deletions performed.");
	}

	async cleanup(): Promise<void> {
	}
}
