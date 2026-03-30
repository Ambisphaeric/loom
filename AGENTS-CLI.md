# @enhancement/cli

Command-line interface for the Enhancement system.

## Purpose

Provides operational control over the Enhancement system through an intuitive command-line interface. Enables developers to manage workspaces, configure credentials, run recipes manually, view logs, control plugins, and debug sessions without writing code. Designed for both interactive use and shell scripting.

## Key Domain Concepts

- **Command Tree**: Hierarchical command structure organized by domain:
  - `workspace`: Workspace lifecycle management
  - `credential`: Secure credential storage and retrieval
  - `recipe`: Recipe execution and validation
  - `plugin`: Plugin lifecycle and discovery
  - `session`: Active session monitoring and control
  - `status/logs`: System observability
- **Global Flags**: Options available on all commands:
  - `--json`: Output as JSON for scripting
  - `--workspace <name>`: Target a specific workspace
  - `--config <path>`: Use alternative config file
  - `--verbose`: Detailed output
- **Interactive Mode**: Secure credential input via prompts (never in shell history)
- **Session Context**: Most commands execute within a workspace context

## Public API

### CLI Commands

```bash
# Workspace Management
enhancement workspace create <name> [--template <template>]
enhancement workspace list [--format table|json]
enhancement workspace delete <name> [--force]

# Credential Management
enhancement credential set <service> <account> [--interactive]
enhancement credential get <service> <account>
enhancement credential list [service] [--format table|json]
enhancement credential delete <service> <account>

# Recipe Execution
enhancement recipe run <recipe-id> [--workspace <name>] [--dry-run]
enhancement recipe list [--workspace <name>]
enhancement recipe validate <recipe-file>

# Plugin Management
enhancement plugin list [--loaded-only]
enhancement plugin load <path> [--workspace <name>]
enhancement plugin unload <name>

# Session Control
enhancement session list [--status active|completed|failed]
enhancement session logs <session-id> [--follow] [--lines <n>]
enhancement session kill <session-id>

# System Observability
enhancement status [--json]
enhancement logs [--follow] [--since <duration>] [--level <level>]
```

### Programmatic Usage

```typescript
import { CLI } from '@enhancement/cli';

const cli = new CLI();

// Execute a command programmatically
const result = await cli.execute([
  'recipe', 'run', 'deploy-app',
  '--workspace', 'production',
  '--json'
]);

// Parse output
const output = JSON.parse(result.stdout);
```

### Configuration File Example

```typescript
// enhancement.config.ts
import { defineConfig } from '@enhancement/cli';

export default defineConfig({
  defaultWorkspace: 'development',
  credentials: {
    storage: 'keychain', // or 'file', 'env'
    encryption: true
  },
  plugins: {
    autoLoad: ['./local-plugins'],
    registry: 'https://registry.enhancement.dev'
  },
  logging: {
    level: 'info',
    format: 'pretty'
  }
});
```

### Shell Scripting Example

```bash
#!/bin/bash

# JSON output for automation
WORKSPACE=$(enhancement workspace list --json | jq -r '.[0].name')
echo "Using workspace: $WORKSPACE"

# Run recipe and capture result
RESULT=$(enhancement recipe run deploy --workspace "$WORKSPACE" --json)
SESSION_ID=$(echo "$RESULT" | jq -r '.sessionId')

# Wait for completion
enhancement session logs "$SESSION_ID" --follow | while read line; do
  echo "$line"
  if [[ "$line" == *"complete"* ]]; then break; fi
done
```

## Design Decisions

1. **Commander.js Foundation**: Industry-standard CLI framework providing argument parsing, help generation, subcommand support, and TypeScript definitions. Mature ecosystem and excellent documentation.

2. **JSON Output Option**: All commands support `--json` flag returning machine-readable output for CI/CD pipelines, shell scripts, and automation tools. Schema-stable across versions.

3. **Global vs Workspace-Scoped Commands**:
   - Global commands operate across workspaces (list, delete, create)
   - Scoped commands target specific workspace via `--workspace` flag or default
   - Session commands track workspace context automatically

4. **Interactive Credential Input**: Credentials entered via secure prompts (inquirer) never appear in shell history. Alternative `--value` flag available only for CI environments with appropriate warnings.

5. **Configuration Hierarchy**:
   - CLI flags (highest priority)
   - Environment variables (`ENHANCEMENT_*`)
   - Workspace configuration file
   - Global configuration file
   - Built-in defaults (lowest priority)

6. **Consistent Exit Codes**:
   - `0`: Success
   - `1`: General error
   - `2`: Invalid arguments
   - `3`: Workspace not found
   - `4`: Recipe execution failed
   - `5`: Permission denied

7. **Plugin Discovery**: Plugins resolved through Node.js module resolution, supporting local paths, npm packages, and monorepo references.

## Dependencies

- `@enhancement/engine`: Core execution engine for running recipes
- `@enhancement/config`: Configuration loading and validation
- `commander`: CLI framework for command structure and parsing

## Package Structure

```text
packages/cli/
├── src/
│   ├── index.ts              # Public exports
│   ├── cli.ts                # Main CLI class
│   ├── commands/
│   │   ├── workspace.ts      # Workspace commands
│   │   ├── credential.ts     # Credential commands
│   │   ├── recipe.ts         # Recipe commands
│   │   ├── plugin.ts         # Plugin commands
│   │   ├── session.ts        # Session commands
│   │   └── system.ts         # Status/logs commands
│   ├── utils/
│   │   ├── output.ts         # Output formatting (table/json)
│   │   ├── interactive.ts    # Prompt handling
│   │   └── errors.ts         # Error formatting
│   └── config-loader.ts      # Config file handling
├── bin/
│   └── enhancement           # Executable entry point
└── test/
    └── commands/
        └── *.test.ts
```
