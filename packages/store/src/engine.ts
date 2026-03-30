import type { VectorEngineAdapter, VectorEngine, Database } from "./schema.js";
import { ZvecAdapter } from "./adapters/zvec.js";
import { SqliteVecAdapter } from "./adapters/sqlite-vec.js";
import { ChromaAdapter } from "./adapters/chroma.js";

export async function createEngine(
	engine: VectorEngine,
	embeddingDim: number
): Promise<VectorEngineAdapter> {
	switch (engine) {
		case "zvec":
			return new ZvecAdapter(embeddingDim);
		case "sqlite-vec":
			return new SqliteVecAdapter(embeddingDim);
		case "chroma":
			return new ChromaAdapter(embeddingDim);
		default:
			throw new Error(`Unknown vector engine: ${engine}`);
	}
}

export function getEngineInfo(engine: VectorEngine): { name: string; description: string; default: boolean } {
	switch (engine) {
		case "zvec":
			return {
				name: "zvec",
				description: "High-performance in-process vector search (default)",
				default: true,
			};
		case "sqlite-vec":
			return {
				name: "sqlite-vec",
				description: "SQLite extension for vector search (via sqlite-vec)",
				default: false,
			};
		case "chroma":
			return {
				name: "chroma",
				description: "Chroma vector database (requires external server)",
				default: false,
			};
		default:
			throw new Error(`Unknown vector engine: ${engine}`);
	}
}
