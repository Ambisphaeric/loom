---
name: run-tests
description: Runs tests and verifies conformance in the @enhancement/loom monorepo. Use when asked to run tests, verify code, check conformance, or when the user types '/run-tests'.
---

# Run Tests for Loom Monorepo

## Quick Commands

| Command | Purpose |
|---------|---------|
| `bun test` | Run all unit tests |
| `bun test packages/<name>/test/` | Run specific package tests |
| `turbo run test` | Run tests via turbo pipeline |
| `bun run e2e` | Run end-to-end experiments |

## Test Structure

```
packages/<name>/
├── src/
│   └── index.ts
└── test/
    ├── <feature>.test.ts
    └── conformance.test.ts
```

## Running Tests

### All Tests

```bash
bun test
```

### Single Package

```bash
bun test packages/bus/test/
bun test packages/types/test/
```

### With Build

```bash
turbo run build test
```

## Verification Workflow

1. **Read AGENTS spec** — Check `AGENTS-*.md` for criteria
2. **Run tests** — Execute `bun test`
3. **Verify 100% pass** — No failures tolerated
4. **Check conformance** — `conformance.test.ts` must pass
5. **Report results** — Pass/fail counts

### Checklist

```
- [ ] AGENTS-*.md read
- [ ] bun test executed
- [ ] 100% pass verified
- [ ] conformance.test.ts passed
- [ ] Results reported
```

## Interpreting Output

**Success:**
```
✓ packages/types/test/conformance.test.ts
  96 pass
  0 fail
```

**Failure:**
```
✗ packages/bus/test/bus.test.ts
  95 pass
  1 fail
```

**Action:** Stop and fix failures before proceeding.

## Common Issues

| Issue | Fix |
|-------|-----|
| Module not found | Run `turbo run build` |
| Type errors | Check `src/index.ts` exports |
| Import errors | Use `.js` extension in imports |

## Packages

| Package | Test Path | AGENTS Spec |
|---------|-----------|-------------|
| types | `packages/types/test/` | AGENTS-TYPES.md |
| bus | `packages/bus/test/` | AGENTS-BUS.md |
| join-synchronizer | `packages/join-synchronizer/test/` | AGENTS-JOIN.md |
| deferred-queue | `packages/deferred-queue/test/` | AGENTS-DEFERRED.md |
| config | `packages/config/test/` | AGENTS-CONFIG.md |
| test-harness | `packages/test-harness/test/` | None |
