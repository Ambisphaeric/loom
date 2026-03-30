import type { RawChunk, ContextChunk } from "../../types/src/index.js";

export function makeChunk(overrides: Partial<RawChunk> = {}): RawChunk {
	return {
		kind: "raw",
		source: "test-source",
		workspace: "test-ws",
		sessionId: "session-1",
		contentType: "text",
		data: "hello world",
		timestamp: Date.now(),
		generation: 0,
		...overrides,
	};
}

export function makeContextChunk(overrides: Partial<ContextChunk> = {}): ContextChunk {
	return {
		kind: "context",
		id: "chunk-1",
		source: "test-source",
		workspace: "test-ws",
		sessionId: "session-1",
		content: "hello world",
		contentType: "text",
		timestamp: Date.now(),
		generation: 0,
		...overrides,
	};
}
