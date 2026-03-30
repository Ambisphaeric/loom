# @enhancement/graph

Status: MERGED - Functionality moved to @enhancement/recipe.

The graph computation system has been merged into the recipe package.

## Migration Note

All graph node types are now available in `@enhancement/recipe`:

- `ComputationGraph` - DAG processing
- `MergeNode` - with strategies: zip, concat, interleave, latest, wait-all
- `SplitNode` - parallel distribution
- `ConditionalNode` - predicate-based routing

## See Also

- `packages/recipe/AGENTS.md` for graph documentation
- `AGENTS-GRAPH.md` in root for historical specification
