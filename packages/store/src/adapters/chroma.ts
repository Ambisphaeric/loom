import type { VectorEngineAdapter, ChunkEmbeddingRow } from "../schema.js";

export interface ChromaConfig {
	baseUrl?: string;
	collectionName?: string;
}

export class ChromaAdapter implements VectorEngineAdapter {
	name = "chroma" as const;
	private embeddingDim: number;
	private collectionName: string;
	private baseUrl: string;

	constructor(embeddingDim: number, config: ChromaConfig = {}) {
		this.embeddingDim = embeddingDim;
		this.collectionName = config.collectionName ?? "enhancement";
		this.baseUrl = config.baseUrl ?? "http://localhost:8000";
	}

	async init(_db: unknown): Promise<void> {
		console.warn("[ChromaAdapter] Chroma server not connected. Using fallback mode.");
	}

	async upsert(chunkId: string, _embedding: number[]): Promise<void> {
		console.warn("[ChromaAdapter] Chroma not available. Embedding not persisted:", chunkId);
	}

	async search(
		_embedding: number[],
		limit: number,
		_filter?: Record<string, unknown>
	): Promise<ChunkEmbeddingRow[]> {
		console.warn("[ChromaAdapter] Chroma not available. Returning empty results.");
		return [];
	}

	async delete(_chunkIds: string[]): Promise<void> {
		console.warn("[ChromaAdapter] Chroma not available. No deletions performed.");
	}

	async cleanup(): Promise<void> {
	}

	getBaseUrl(): string {
		return this.baseUrl;
	}

	getCollectionName(): string {
		return this.collectionName;
	}
}
