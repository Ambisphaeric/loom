# @enhancement/plugins

Plugin lifecycle management with declarative registration and capability-based discovery.

## Purpose

Provides a plugin system for loading, initializing, and managing plugins with explicit lifecycle control. Supports both file-based plugin discovery and programmatic registration with type-safe factory functions.

## Key Domain Concepts

- **PluginLoader**: Manages plugin lifecycle (load, init, start, stop, unload) with validation.
- **PluginRegistration**: Declarative plugin registration with manifest and factory function.
- **PluginManifest**: Metadata describing plugin name, version, capabilities, and dependencies.
- **CapabilityType**: Plugin capability categories (tools, trigger, action, source, fetch, transform, store, credential, modelProvider).
- **PluginStatus**: Runtime state of a plugin (loaded, enabled, capabilities).
- **PluginConfig**: Configuration passed to plugins during initialization.

## Public API

### PluginLoader

```typescript
import { PluginLoader, createPluginLoader } from '@enhancement/plugins';

// Create a loader instance
const loader = createPluginLoader({
  autoDiscover: true,
  pluginsDir: './plugins'
});

// Load plugins from filesystem
const plugin = await loader.load('./plugins/my-plugin.js');

// Or load from registration
const registered = await loader.loadFromRegistration('my-plugin');

// Lifecycle management
const config = createPluginConfig('workspace-1', {
  defaultModel: 'gpt-4',
  dataDir: '~/.enhancement'
});

const initialized = await loader.initAll([plugin], config);
await loader.startAll(initialized);
await loader.stopAll(initialized);

// Cleanup
loader.unloadAll();
```

### Plugin Registration

```typescript
import { registerPlugin, unregisterPlugin, getRegisteredPlugins, isPluginRegistered } from '@enhancement/plugins';

// Register a plugin declaratively
registerPlugin({
  manifest: {
    name: 'weather-plugin',
    version: '1.0.0',
    description: 'Provides weather data tools',
    capabilities: ['tools', 'fetch'],
    dependencies: []
  },
  factory: async () => ({
    name: 'weather-plugin',
    version: '1.0.0',
    permissions: ['network'],
    capabilities: {
      tools: {
        tools: () => [{
          name: 'get-weather',
          description: 'Get weather for a location',
          parameters: {
            location: { type: 'string', description: 'City name', required: true }
          },
          execute: async (params) => ({
            success: true,
            output: `Weather for ${params.location}: 72°F`
          })
        }]
      }
    },
    async init(config) { /* setup */ },
    async start() { /* start services */ },
    async stop() { /* cleanup */ }
  }),
  enabled: true
});

// Check registration status
console.log(isPluginRegistered('weather-plugin')); // true
console.log(getRegisteredPlugins()); // ['weather-plugin']

// Unregister when no longer needed
unregisterPlugin('weather-plugin');
```

### Plugin Configuration Factory

```typescript
import { createPluginConfig } from '@enhancement/plugins';

// Create configuration for plugin initialization
const config = createPluginConfig(
  'my-workspace',           // workspace name
  { defaultModel: 'gpt-4' }, // global configuration
  { apiKey: 'secret-key' }    // plugin-specific settings
);

// Result: PluginConfig = {
//   workspace: 'my-workspace',
//   globalConfig: { defaultModel: 'gpt-4' },
//   pluginSettings: { apiKey: 'secret-key' }
// }
```

### Capability Detection

```typescript
import { PluginLoader } from '@enhancement/plugins';

const loader = createPluginLoader();

// After loading a plugin, inspect its capabilities
const capabilities = loader.getCapabilities(plugin);
// Returns: [{ type: 'tools', available: true }, { type: 'fetch', available: true }]

// Get status of a specific plugin
const status = loader.getStatus('weather-plugin');
// Returns: { name: 'weather-plugin', loaded: true, enabled: true, capabilities: [...] }

// Get all plugin statuses
const allStatuses = loader.getAllStatuses();
```

### Plugin Manifest Structure

```typescript
import type { PluginManifest } from '@enhancement/plugins';

const manifest: PluginManifest = {
  name: 'my-plugin',           // Unique identifier
  version: '1.0.0',          // Semver version
  description: 'What it does', // Optional description
  capabilities: [            // Declared capabilities
    'tools',
    'trigger',
    'action',
    'source',
    'fetch',
    'transform',
    'store',
    'credential',
    'modelProvider'
  ],
  dependencies: []             // Other plugin names this depends on
};
```

### Plugin Implementation

```typescript
import type { Plugin, PluginConfig, Tool } from '@enhancement/types';

const myPlugin: Plugin = {
  name: 'example-plugin',
  version: '1.0.0',
  permissions: ['network', 'read_files'],
  
  capabilities: {
    tools: {
      tools: (): Tool[] => [{
        name: 'example-tool',
        description: 'An example tool',
        parameters: {},
        execute: async () => ({ success: true, output: 'Hello!' })
      }]
    },
    trigger: {
      type: 'webhook',
      config: { port: 3000 },
      start() { /* start listening */ },
      stop() { /* stop listening */ },
      onTrigger(handler) { /* register handler */ }
    }
  },
  
  async init(config: PluginConfig) {
    // Initialize with workspace and settings
    console.log('Workspace:', config.workspace);
    console.log('Settings:', config.pluginSettings);
  },
  
  async start() {
    // Begin active operation
  },
  
  async stop() {
    // Cleanup and shutdown
  }
};
```

## Design Decisions

1. **Explicit Lifecycle**: Plugins have distinct init/start/stop phases for predictable state management. Initialization receives configuration, start begins active operation, and stop handles cleanup.

2. **Capability-Based Discovery**: Plugins declare capabilities (tools, triggers, actions) rather than implementing fixed interfaces. This enables runtime discovery of what a plugin can do without loading it.

3. **Registration Pattern**: The `registerPlugin`/`unregisterPlugin` pattern with factory functions provides type safety while supporting dynamic plugin loading. Manifests enable capability inspection before instantiation.

4. **Validation on Load**: The loader validates plugins have required fields (name, version, capabilities, lifecycle methods) before accepting them, failing fast with clear errors.

5. **Graceful Error Handling**: Lifecycle methods (initAll, startAll, stopAll) catch and log errors per-plugin, allowing other plugins to continue operating even if one fails.

6. **Separation of Registration and Loading**: Plugins can be registered (declared available) without being loaded (instantiated). This supports lazy loading and dependency resolution.

## Dependencies

- `@enhancement/types`: Core type system (Plugin, PluginConfig, Tool, etc.)

## Package Structure

```text
packages/plugins/
├── src/
│   ├── index.ts          # Public exports
│   ├── plugin-loader.ts  # PluginLoader class and registration functions
│   └── types.ts          # Package-specific type definitions
├── test/
│   └── conformance.test.ts  # AGENTS spec conformance
└── demos/
    └── basic-demo.ts     # Usage demonstration
```
