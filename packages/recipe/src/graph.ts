import type {
	GraphNode,
	MergeNode,
	SplitNode,
	ConditionalNode,
	ComputationGraph,
	MergeStrategy,
} from "./types.js";
import type { RawChunk, ContextChunk } from "@loomai/types";

export class MergeNodeImpl implements MergeNode {
	id: string;
	type: "merge" = "merge";
	strategy: MergeStrategy;
	sources: string[];
	outputs: string[];
	inputs: string[];
	config: Record<string, unknown>;
	private buffer: Map<string, RawChunk[]> = new Map();

	constructor(
		id: string,
		strategy: MergeStrategy,
		sources: string[],
		output: string,
		config: Record<string, unknown> = {}
	) {
		this.id = id;
		this.strategy = strategy;
		this.sources = sources;
		this.inputs = sources;
		this.outputs = [output];
		this.config = config;

		for (const source of sources) {
			this.buffer.set(source, []);
		}
	}

	async merge(inputs: RawChunk[][]): Promise<RawChunk[]> {
		switch (this.strategy) {
			case "zip":
				return this.zipMerge(inputs);
			case "concat":
				return this.concatMerge(inputs);
			case "interleave":
				return this.interleaveMerge(inputs);
			case "latest":
				return this.latestMerge(inputs);
			case "wait-all":
				return this.waitAllMerge(inputs);
			default:
				throw new Error(`Unknown merge strategy: ${this.strategy}`);
		}
	}

	private zipMerge(inputs: RawChunk[][]): RawChunk[] {
		if (inputs.length === 0) return [];
		if (inputs.length === 1) return inputs[0] ?? [];

		const result: RawChunk[] = [];
		const minLength = Math.min(...inputs.map((arr) => arr.length));

		for (let i = 0; i < minLength; i++) {
			for (const input of inputs) {
				const chunk = input[i];
				if (chunk) result.push(chunk);
			}
		}

		return result;
	}

	private concatMerge(inputs: RawChunk[][]): RawChunk[] {
		return inputs.flat();
	}

	private interleaveMerge(inputs: RawChunk[][]): RawChunk[] {
		if (inputs.length === 0) return [];
		if (inputs.length === 1) return inputs[0] ?? [];

		const result: RawChunk[] = [];
		const maxLength = Math.max(...inputs.map((arr) => arr.length));

		for (let i = 0; i < maxLength; i++) {
			for (const input of inputs) {
				const chunk = input[i];
				if (chunk) result.push(chunk);
			}
		}

		return result;
	}

	private latestMerge(inputs: RawChunk[][]): RawChunk[] {
		const result: RawChunk[] = [];

		for (const input of inputs) {
			if (input.length > 0) {
				const latest = input.reduce((latest, chunk) => {
					if (chunk.timestamp > latest.timestamp) return chunk;
					if (chunk.timestamp === latest.timestamp && chunk.generation > latest.generation)
						return chunk;
					return latest;
				}, input[0]);
				result.push(latest);
			}
		}

		return result;
	}

	private waitAllMerge(inputs: RawChunk[][]): RawChunk[] {
		const hasEmpty = inputs.some((arr) => arr.length === 0);
		if (hasEmpty) return [];

		return inputs.flat();
	}
}

export class SplitNodeImpl implements SplitNode {
	id: string;
	type: "split" = "split";
	branches: string[];
	outputs: string[];
	inputs: string[] = [];

	constructor(id: string, branches: string[]) {
		this.id = id;
		this.branches = branches;
		this.outputs = branches;
		this.inputs = [];
	}

	split(input: RawChunk[]): Map<string, RawChunk[]> {
		const result = new Map<string, RawChunk[]>();

		for (const branch of this.branches) {
			result.set(branch, [...input]);
		}

		return result;
	}
}

export class ConditionalNodeImpl implements ConditionalNode {
	id: string;
	type: "conditional" = "conditional";
	condition: string;
	outputs: string[] = ["true", "false"];

	private conditionFn: (context: Map<string, unknown>) => boolean;

	constructor(id: string, condition: string, conditionFn?: (context: Map<string, unknown>) => boolean) {
		this.id = id;
		this.condition = condition;
		this.conditionFn = conditionFn ?? this.defaultCondition;
	}

	evaluate(context: Map<string, unknown>): boolean {
		return this.conditionFn(context);
	}

	private defaultCondition(context: Map<string, unknown>): boolean {
		const value = context.get(this.condition);
		if (value === undefined || value === null) return false;
		if (typeof value === "boolean") return value;
		if (typeof value === "string") return value.length > 0;
		if (Array.isArray(value)) return value.length > 0;
		return true;
	}
}

export class ComputationGraphImpl implements ComputationGraph {
	nodes: Map<string, GraphNode> = new Map();
	edges: Map<string, string[]> = new Map();

	addNode(node: GraphNode): void;
	addNode(id: string, execute: (chunks: ContextChunk[]) => Promise<ContextChunk[]>): void;
	addNode(nodeOrId: GraphNode | string, executeFn?: (chunks: ContextChunk[]) => Promise<ContextChunk[]>): void {
		if (typeof nodeOrId === "string" && executeFn) {
			// Convenience overload: addNode(id, executeFn)
			const node: GraphNode = {
				id: nodeOrId,
				type: "custom",
				inputs: [],
				outputs: [],
				execute: executeFn,
			};
			this.nodes.set(nodeOrId, node);
		} else if (typeof nodeOrId === "object") {
			// Standard overload: addNode(node)
			this.nodes.set(nodeOrId.id, nodeOrId);
		}
	}

	addEdge(from: string, to: string): void {
		if (!this.edges.has(from)) {
			this.edges.set(from, []);
		}
		this.edges.get(from)?.push(to);
	}

	getNode(id: string): GraphNode | undefined {
		return this.nodes.get(id);
	}

	getOutgoingEdges(nodeId: string): string[] {
		return this.edges.get(nodeId) ?? [];
	}

	topologicalSort(): string[] {
		const visited = new Set<string>();
		const result: string[] = [];

		const visit = (nodeId: string) => {
			if (visited.has(nodeId)) return;
			visited.add(nodeId);

			for (const outgoing of this.getOutgoingEdges(nodeId)) {
				visit(outgoing);
			}

			result.unshift(nodeId);
		};

		for (const nodeId of this.nodes.keys()) {
			visit(nodeId);
		}

		return result;
	}

	hasCycle(): boolean {
		const visited = new Set<string>();
		const recStack = new Set<string>();

		const visit = (nodeId: string): boolean => {
			visited.add(nodeId);
			recStack.add(nodeId);

			for (const outgoing of this.getOutgoingEdges(nodeId)) {
				if (!visited.has(outgoing)) {
					if (visit(outgoing)) return true;
				} else if (recStack.has(outgoing)) {
					return true;
				}
			}

			recStack.delete(nodeId);
			return false;
		};

		for (const nodeId of this.nodes.keys()) {
			if (!visited.has(nodeId)) {
				if (visit(nodeId)) return true;
			}
		}

		return false;
	}

	async execute(nodeIdOrOptions?: string | { maxConcurrency?: number }, input?: ContextChunk[]): Promise<ContextChunk[]> {
		// Overload: execute(nodeId, input) - execute specific node
		if (typeof nodeIdOrOptions === "string") {
			const node = this.nodes.get(nodeIdOrOptions);
			if (!node) {
				throw new Error(`Node not found: ${nodeIdOrOptions}`);
			}

			if (!node.execute) {
				throw new Error(`Node ${nodeIdOrOptions} does not have an execute function`);
			}

			return await node.execute(input || []);
		}

		// Overload: execute(options?) - execute entire graph
		const options = nodeIdOrOptions || {};
		const maxConcurrency = options.maxConcurrency || Infinity;
		
		// Execute nodes in topological order sequentially
		const order = this.topologicalSort();
		if (order.length === 0) {
			return [];
		}

		// Track results for each node
		const results = new Map<string, ContextChunk[]>();
		
		// Track which nodes are ready (all dependencies completed)
		const completed = new Set<string>();
		
		// Execute in batches respecting dependencies
		let remaining = [...order];
		
		while (remaining.length > 0) {
			// Find nodes that are ready (all dependencies completed or no dependencies)
			const ready: string[] = [];
			const stillWaiting: string[] = [];
			
			for (const nodeId of remaining) {
				// Find all nodes that depend on this one (incoming edges reversed)
				const dependencies: string[] = [];
				for (const [from, toList] of this.edges) {
					if (toList.includes(nodeId)) {
						dependencies.push(from);
					}
				}
				
				const allDepsCompleted = dependencies.every(dep => completed.has(dep));
				if (allDepsCompleted) {
					ready.push(nodeId);
				} else {
					stillWaiting.push(nodeId);
				}
			}
			
			if (ready.length === 0 && stillWaiting.length > 0) {
				// Cycle detected - shouldn't happen since we checked hasCycle
				throw new Error("Graph has circular dependencies");
			}
			
			// Execute ready nodes with concurrency limit
			const toExecute = ready.slice(0, maxConcurrency);
			const batchPromises = toExecute.map(async (nodeId) => {
				const node = this.nodes.get(nodeId);
				if (!node || !node.execute) return;

				// Collect inputs from dependencies
				const nodeInput: ContextChunk[] = [];
				for (const [from, toList] of this.edges) {
					if (toList.includes(nodeId)) {
						const fromResult = results.get(from);
						if (fromResult) {
							nodeInput.push(...fromResult);
						}
					}
				}

				const output = await node.execute(nodeInput);
				results.set(nodeId, output);
				completed.add(nodeId);
			});
			
			await Promise.all(batchPromises);
			
			// Update remaining for next iteration
			remaining = stillWaiting;
		}

		// Return results from all nodes
		return [...results.values()].flat();
	}
}

export function createMergeNode(
	id: string,
	strategy: MergeStrategy,
	sources: string[],
	output: string
): MergeNodeImpl {
	return new MergeNodeImpl(id, strategy, sources, output);
}

export function createSplitNode(id: string, branches: string[]): SplitNodeImpl {
	return new SplitNodeImpl(id, branches);
}

export function createConditionalNode(
	id: string,
	condition: string,
	conditionFn?: (context: Map<string, unknown>) => boolean
): ConditionalNodeImpl {
	return new ConditionalNodeImpl(id, condition, conditionFn);
}

export function createComputationGraph(): ComputationGraphImpl {
	return new ComputationGraphImpl();
}
