/**
 * @enhancement/fabric
 *
 * Fabric patterns integration for the Enhancement platform.
 *
 * This package provides TWO modes of operation:
 *
 * 1. DIRECT RUNNER (Recommended - No setup required!)
 *    Use this for direct HTTP calls to LM Studio or any OpenAI-compatible API.
 *    No Fabric CLI binary needed, no interactive setup required.
 *
 *    @example
 *    ```typescript
 *    import { runPattern, listPatterns } from "@enhancement/fabric/direct";
 *
 *    // Run any extracted fabric pattern directly
 *    const result = await runPattern("summarize", "Your text here");
 *    console.log(result);
 *
 *    // List all 60+ available patterns
 *    console.log(listPatterns());
 *    ```
 *
 * 2. CLI WRAPPER (Legacy - Requires fabric binary)
 *    Wraps the Fabric CLI tool (https://github.com/danielmiessler/fabric).
 *    Requires running `fabric --setup` once to configure vendors.
 *
 *    @example
 *    ```typescript
 *    import { createFabricIntegration } from "@enhancement/fabric";
 *
 *    const fabric = createFabricIntegration({ autoInstall: true });
 *    await fabric.initialize();
 *    const result = await fabric.transformChunk(chunk, "summarize");
 *    ```
 */

// Fabric Transformer (primary API)
export {
  FabricTransformer,
  createFabricTransformer,
  getDefaultPatterns,
  getPatternsByCategory,
  type FabricPattern,
  type FabricOptions,
  type FabricCategory,
  type PatternRunResult,
  type ChunkTransformResult,
  type AIProvider,
  type ProviderEndpoint,
} from "./fabric-transformer.js";

// Main integration (CLI wrapper - legacy)
export {
  FabricIntegration,
  createFabricIntegration,
  transformWithFabric,
  type FabricIntegrationOptions,
  type FabricTransformResult,
} from "./integration.js";

// CLI wrapper
export {
  FabricCLI,
  createFabricCLI,
  runPattern,
  type PatternOptions,
  type FabricResult,
  type FabricCLIOptions,
  type FabricSetupOptions,
} from "./cli.js";

// Installer
export {
  FabricInstaller,
  createFabricInstaller,
  installFabric,
  type InstallOptions,
  type InstallResult,
} from "./installer.js";

// Pattern sync
export {
  PatternSync,
  createPatternSync,
  type PatternSyncOptions,
  type PatternInfo,
  type SyncResult,
} from "./patterns.js";
