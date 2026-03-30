# Perspective-Oriented Transformation System

A spike demonstrating the core Enhancement building blocks: **Perspective + Orientation + Input → Transformation → Output**

## Concept

This system allows you to transform content through different "lenses":

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ Perspective │ + │ Orientation │ + │    Input    │  →   │  Transform  │  →   │    Output   │
│  (5 types)  │   │  (6 types)  │   │  (content)  │      │   (LLM)     │      │  (result)   │
└─────────────┘   └─────────────┘   └─────────────┘      └─────────────┘      └─────────────┘
```

### Perspectives (Who is looking?)
1. **developer** - Software engineering lens
2. **manager** - Business/leadership lens
3. **customer** - End-user lens
4. **teacher** - Educational lens
5. **skeptic** - Critical analysis lens

### Orientations (What to do?)
1. **explain** - Break down and clarify
2. **critique** - Analyze and identify issues
3. **improve** - Suggest enhancements
4. **summarize** - Distill to essence
5. **expand** - Elaborate and develop
6. **translate** - Convert to different form

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PerspectiveOrientedTransformer                            │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Perspectives │  │  Orientations │  │    Fabric   │  │    Store     │   │
│  │    (Map)      │  │    (Map)      │  │ Transformer │  │  (persist)   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│           │                │                 │                │            │
│           └────────────────┴─────────────────┴────────────────┘            │
│                                    │                                        │
│                           ┌────────▼────────┐                              │
│                           │      Bus        │                              │
│                           │  (event flow)   │                              │
│                           └─────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components Used

| Component | Purpose |
|-----------|---------|
| `@enhancement/fabric` | Pattern-based text transformation |
| `@enhancement/ai-providers` | LLM provider abstraction |
| `@enhancement/bus` | Event-driven communication |
| `@enhancement/store` | Persistence and vector search |
| `@enhancement/types` | Type definitions |

## Usage Example

```typescript
// Initialize
const transformer = new PerspectiveOrientedTransformer(fabric, store);

// Single transformation
const result = await transformer.transform({
  perspective: "developer",
  orientation: "critique",
  input: "We need to implement CSV export...",
  context: { feature: "CSV Export" }
});

// Multi-perspective (parallel)
const results = await transformer.transformMultiPerspective(
  ["developer", "manager", "skeptic"],
  "critique",
  input
);
```

## Test Cases Included

1. **Developer + Critique** - Technical code review perspective
2. **Manager + Summarize** - Business summary perspective
3. **Customer + Explain** - User-friendly explanation
4. **Multi-Perspective** - Parallel analysis from 3 angles
5. **Teacher + Improve** - Educational improvement suggestions

## Running

```bash
cd spikes/perspective-transformer
bun install
bun test
```

## Key Features

- **Event-Driven**: Uses Bus for transformation lifecycle events
- **Persistent**: Stores all transformations for later retrieval
- **Composable**: Mix any perspective with any orientation
- **Extensible**: Easy to add new perspectives or orientations
- **Observable**: All events published to Bus for monitoring

## Potential Extensions

1. **Chain Transformations** - Output of one becomes input to next
2. **Weighted Perspectives** - Combine multiple perspectives with weights
3. **History-Aware** - Consider past transformations in context
4. **Interactive Mode** - User selects perspective/orientation via CLI
5. **Batch Processing** - Transform large documents section by section
