import type { VectorEngineAdapter, ChunkEmbeddingRow } from "../schema.js";

export class ZvecAdapter implements VectorEngineAdapter {
	name = "zvec" as const;
	private embeddingDim: number;
	private embeddings: Map<string, number[]> = new Map();
	private initialized = false;

	constructor(embeddingDim: number) {
		this.embeddingDim = embeddingDim;
	}

	async init(_db: unknown): Promise<void> {
		try {
			this.initialized = true;
		} catch (err) {
			console.warn("[ZvecAdapter] Failed to initialize:", err);
			this.initialized = true;
		}
	}

	async upsert(chunkId: string, embedding: number[]): Promise<void> {
		this.embeddings.set(chunkId, embedding);
	}

	async search(
		embedding: number[],
		limit: number,
		_filter?: Record<string, unknown>
	): Promise<ChunkEmbeddingRow[]> {
		const results: ChunkEmbeddingRow[] = [];

		for (const [chunkId, storedEmbedding] of this.embeddings) {
			if (results.length >= limit) break;

			const distance = this.cosineDistance(embedding, storedEmbedding);
			results.push({
				chunk_id: chunkId,
				embedding: new Float32Array(storedEmbedding),
				distance,
			});
		}

		results.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

		return results.slice(0, limit);
	}

	async delete(chunkIds: string[]): Promise<void> {
		for (const id of chunkIds) {
			this.embeddings.delete(id);
		}
	}

	async cleanup(): Promise<void> {
	}

	private cosineDistance(a: number[], b: number[]): number {
		if (a.length !== b.length) return 1;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);

		if (denominator === 0) return 1;

		return 1 - dotProduct / denominator;
	}
}
