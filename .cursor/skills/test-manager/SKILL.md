---
name: test-manager
description: Manages testing workflows for the @enhancement/loom monorepo. Runs tests, verifies conformance, and reports results. Use when testing packages, running test suites, checking conformance, or verifying code changes in loom.
commands:
  test:
    description: Run all tests across the monorepo (bun test)
---

# Test Manager for Backend-Tools Monorepo

## Quick Reference

| Command | Purpose |
| ------- | ------- |
| `bun test` | Run all unit tests across all packages |
| `bun run e2e` | Run all end-to-end experiments |
| `bun run e2e:multi-source` | Run multi-source pipeline experiment |
| `bun run e2e:deferred` | Run deferred workflow experiment |
| `bun run e2e:parallel` | Run parallel processing experiment |
| `bun run e2e:model-pairing` | Run model endpoint pairing experiment |
| `bun run e2e:full` | Run full integration experiment |

## Test Structure

Each package follows this pattern:

```text
packages/<name>/
├── src/
│   └── index.ts          # Main exports
└── test/
    ├── <feature>.test.ts # Unit/integration tests
    └── conformance.test.ts # AGENTS spec verification
```

### Conformance Tests

Every package **must** have `conformance.test.ts` that verifies:

- All exports from AGENTS-*.md spec are present
- Type exports are valid
- Factory functions work as specified
- Core functionality meets contract

## Running Tests

### Full Test Suite

Run all tests across the monorepo:

```bash
bun test
```

### Single Package Tests

Run tests for a specific package:

```bash
# Via bun test directly
bun test packages/bus/test/
bun test packages/types/test/
bun test packages/join-synchronizer/test/
bun test packages/deferred-queue/test/
bun test packages/test-harness/test/

# Via package script
cd packages/bus && bun test
cd packages/types && bun test
```

### Via Turbo Pipeline

```bash
# Run all package tests via turbo
turbo run test

# Build first, then test
turbo run build test
```

## Test Verification Workflow

When asked to run tests or verify code:

1. **Check AGENTS spec** — Read the relevant `AGENTS-*.md` file for conformance criteria
2. **Run tests** — Execute `bun test` from loom root
3. **Verify 100% pass** — All tests must pass; any failure blocks progress
4. **Check conformance** — Ensure `conformance.test.ts` passes for the package
5. **Report results** — Summarize pass/fail counts and any issues

### Verification Checklist

```text
Test Verification:
- [ ] Read AGENTS-*.md for target package
- [ ] Run bun test from loom root
- [ ] Verify 100% pass rate (no failures tolerated)
- [ ] Check conformance.test.ts passes
- [ ] Report: X pass, Y fail, Z expect() calls
```

## Interpreting Results

### Success Output

```text
✓ packages/types/test/conformance.test.ts
✓ packages/bus/test/bus.test.ts
✓ packages/bus/test/conformance.test.ts

  96 pass
  0 fail
  215 expect() calls
Ran 96 tests across 8 files
```

### Failure Output

```text
✗ packages/bus/test/bus.test.ts
  EnhancementBus > handler errors don't crash the bus
    error: handler exploded

  95 pass
  1 fail
```

**Action on failure**: Stop and report the failure. Do not proceed until fixed.

## Packages Overview

| Package | Test Location | AGENTS Spec |
| ------- | ------------- | ----------- |
| types | `packages/types/test/` | AGENTS-TYPES.md |
| bus | `packages/bus/test/` | AGENTS-BUS.md |
| test-harness | `packages/test-harness/test/` | None (test utilities) |
| join-synchronizer | `packages/join-synchronizer/test/` | AGENTS-JOIN.md |
| deferred-queue | `packages/deferred-queue/test/` | AGENTS-DEFERRED.md |
| config | `packages/config/test/` | AGENTS-CONFIG.md |

## Test Patterns

### Bun Test Syntax

Tests use `bun:test` with `describe`/`test`/`expect`:

```typescript
import { describe, expect, test } from "bun:test";

describe("Feature Name", () => {
  test("should do something", () => {
    expect(result).toBe(expected);
    expect(list).toHaveLength(3);
    expect(fn).toThrow();
  });
});
```

### Async Tests

```typescript
test("async operation", async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### Conformance Test Template

```typescript
import { describe, expect, test } from "bun:test";

describe("@enhancement/package-name conformance", () => {
  test("exports all required types", () => {
    expect(typeof SomeType).toBe("function");
  });

  test("factory function works", () => {
    const instance = createInstance();
    expect(instance).toBeDefined();
  });
});
```

## Common Issues

### Module Not Found

If imports fail with "Cannot find module":

1. Check that dependent packages are built: `turbo run build`
2. Verify `package.json` dependencies are correct
3. Check TypeScript path mappings in `tsconfig.json`

### Type Errors in Tests

1. Ensure all source files compile: `tsc --noEmit`
2. Check that types are exported from `src/index.ts`
3. Verify test imports use `.js` extension: `from "../src/index.js"`

### Test Harness Not Available

If mocks/helpers are needed:

```typescript
import { MockDatabase, makeChunk } from "@enhancement/test-harness";
```

## Emergency Escalation

If tests fail unexpectedly:

1. Check if `AGENTS-*.md` spec has changed
2. Verify no circular dependencies were introduced
3. Ask user before modifying test files
