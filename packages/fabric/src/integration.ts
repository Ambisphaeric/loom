/**
 * Fabric Integration
 * 
 * Bridges the Fabric CLI with the Enhancement platform.
 * Wraps CLI output into ContextChunks for use in recipes and workflows.
 */

import type { ContextChunk } from "@enhancement/types";
import { FabricCLI, createFabricCLI, PatternOptions, FabricResult } from "./cli.js";
import { FabricInstaller, createFabricInstaller } from "./installer.js";
import { PatternSync, createPatternSync } from "./patterns.js";
import { ulid } from "ulidx";

export interface FabricIntegrationOptions {
  /** Auto-install fabric if not present */
  autoInstall?: boolean;
  /** Path to fabric binary */
  binaryPath?: string;
  /** Default model for fabric */
  defaultModel?: string;
  /** Auto-sync patterns */
  autoSyncPatterns?: boolean;
}

export interface FabricTransformResult {
  /** Success status */
  success: boolean;
  /** The transformed chunk */
  chunk: ContextChunk;
  /** Raw CLI result */
  cliResult: FabricResult;
  /** Error if failed */
  error?: string;
}

/**
 * Fabric Integration class
 * 
 * Combines installer, CLI wrapper, and pattern sync into one interface
 * that produces Enhancement-compatible ContextChunks.
 */
export class FabricIntegration {
  private cli: FabricCLI;
  private installer: FabricInstaller;
  private patternSync: PatternSync;
  private options: FabricIntegrationOptions;

  constructor(options: FabricIntegrationOptions = {}) {
    this.options = {
      autoInstall: true,
      autoSyncPatterns: false,
      ...options,
    };

    this.installer = createFabricInstaller();
    this.cli = createFabricCLI({
      binaryPath: options.binaryPath,
      defaultModel: options.defaultModel,
    });
    this.patternSync = createPatternSync(undefined, options.binaryPath);
  }

  /**
   * Initialize fabric: install if needed, sync patterns
   * 
   * Respects existing installations:
   * - Checks PATH first for fabric binary
   * - Only installs to our managed location if not found elsewhere
   * - Never overwrites user's existing patterns (force required)
   */
  async initialize(): Promise<{ 
    success: boolean; 
    installed: boolean; 
    usingExisting: boolean;
    binaryPath: string;
    error?: string 
  }> {
    // Check if fabric is available (detects in PATH, homebrew, etc.)
    if (this.cli.isAvailable()) {
      const detectedPath = this.cli.getBinaryPath();
      const isManagedLocation = detectedPath.includes(".enhancement/bin");
      
      // Sync patterns if requested (only if none exist locally)
      if (this.options.autoSyncPatterns) {
        const localPatterns = await this.patternSync.listLocalPatterns();
        if (localPatterns.length === 0) {
          console.log("No patterns found locally. Syncing from GitHub...");
          await this.patternSync.syncAll(); // force=false = won't overwrite
        }
      }

      return { 
        success: true, 
        installed: false, 
        usingExisting: !isManagedLocation,
        binaryPath: detectedPath,
      };
    }

    // Not found anywhere - need to install
    if (!this.options.autoInstall) {
      return {
        success: false,
        installed: false,
        usingExisting: false,
        binaryPath: "",
        error: "Fabric CLI not found and autoInstall is disabled",
      };
    }

    // Install to our managed location
    console.log("Fabric CLI not found. Installing to ~/.enhancement/bin...");
    const installResult = await this.installer.install();

    if (!installResult.success) {
      return {
        success: false,
        installed: false,
        usingExisting: false,
        binaryPath: "",
        error: `Failed to install fabric: ${installResult.error}`,
      };
    }

    // Re-create CLI with newly installed binary
    this.cli = createFabricCLI({
      binaryPath: installResult.binaryPath,
      defaultModel: this.options.defaultModel,
    });

    // Sync patterns if requested (fresh install = download all)
    if (this.options.autoSyncPatterns) {
      await this.patternSync.syncAll();
    }

    return { 
      success: true, 
      installed: installResult.installed, 
      usingExisting: false,
      binaryPath: installResult.binaryPath,
    };
  }

  /**
   * Transform a chunk using a fabric pattern
   * 
   * Takes a ContextChunk, runs its content through Fabric CLI,
   * and returns a new ContextChunk with the transformed content.
   */
  async transformChunk(
    chunk: ContextChunk,
    pattern: string,
    options?: Omit<PatternOptions, "pattern" | "input">
  ): Promise<FabricTransformResult> {
    // Ensure initialized
    if (!this.cli.isAvailable()) {
      const init = await this.initialize();
      if (!init.success) {
        return {
          success: false,
          chunk: this.createErrorChunk(chunk, pattern, init.error ?? "Failed to initialize"),
          cliResult: {
            success: false,
            output: "",
            pattern,
            error: init.error,
            exitCode: -1,
            command: "",
          },
          error: init.error,
        };
      }
    }

    // Run pattern via CLI
    const result = await this.cli.runPattern({
      pattern,
      input: chunk.content,
      ...options,
    });

    // Create transformed chunk
    const transformedChunk: ContextChunk = {
      ...chunk,
      id: `fabric-${chunk.id}`,
      source: `fabric:${pattern}`,
      content: result.success ? result.output : chunk.content,
      transform: pattern,
      metadata: {
        ...chunk.metadata,
        fabricPattern: pattern,
        fabricResult: result.success,
        fabricError: result.error,
        fabricCommand: result.command,
        fabricExitCode: result.exitCode,
      },
    };

    return {
      success: result.success,
      chunk: transformedChunk,
      cliResult: result,
      error: result.error,
    };
  }

  /**
   * Transform multiple chunks
   */
  async transformChunks(
    chunks: ContextChunk[],
    pattern: string,
    options?: Omit<PatternOptions, "pattern" | "input"> & { parallel?: boolean }
  ): Promise<FabricTransformResult[]> {
    const { parallel = false, ...patternOptions } = options ?? {};

    if (parallel) {
      const promises = chunks.map((chunk) =>
        this.transformChunk(chunk, pattern, patternOptions)
      );
      return Promise.all(promises);
    }

    const results: FabricTransformResult[] = [];
    for (const chunk of chunks) {
      const result = await this.transformChunk(chunk, pattern, patternOptions);
      results.push(result);
    }
    return results;
  }

  /**
   * Get underlying CLI instance for advanced usage
   */
  getCLI(): FabricCLI {
    return this.cli;
  }

  /**
   * Get installer instance
   */
  getInstaller(): FabricInstaller {
    return this.installer;
  }

  /**
   * Get pattern sync instance
   */
  getPatternSync(): PatternSync {
    return this.patternSync;
  }

  /**
   * List available patterns (local + remote)
   */
  async listPatterns(): Promise<{
    local: string[];
    remote: string[];
    missing: string[];
  }> {
    const [local, remote] = await Promise.all([
      this.patternSync.listLocalPatterns(),
      this.patternSync.fetchPatternList(),
    ]);

    const localSet = new Set(local);
    const missing = remote.filter((r) => !localSet.has(r));

    return { local, remote, missing };
  }

  /**
   * Sync patterns from GitHub
   */
  async syncPatterns(force?: boolean): Promise<{
    success: boolean;
    downloaded: number;
    error?: string;
  }> {
    const result = await this.patternSync.syncAll({ force });
    return {
      success: result.success,
      downloaded: result.downloaded,
      error: result.errors.join("; ") || undefined,
    };
  }

  /**
   * Run setup wizard
   */
  async setup(apiKey?: string): Promise<{ success: boolean; error?: string }> {
    return this.cli.setup({ apiKey });
  }

  /**
   * Check if fabric is available
   */
  isAvailable(): boolean {
    return this.cli.isAvailable();
  }

  /**
   * Get fabric version
   */
  async getVersion(): Promise<string | null> {
    return this.cli.getVersion();
  }

  private createErrorChunk(
    original: ContextChunk,
    pattern: string,
    error: string
  ): ContextChunk {
    return {
      ...original,
      id: `fabric-error-${ulid()}`,
      source: `fabric:${pattern}:error`,
      content: original.content,
      metadata: {
        ...original.metadata,
        fabricPattern: pattern,
        fabricResult: false,
        fabricError: error,
      },
    };
  }
}

/**
 * Create fabric integration
 */
export function createFabricIntegration(options?: FabricIntegrationOptions): FabricIntegration {
  return new FabricIntegration(options);
}

/**
 * Quick transform function
 */
export async function transformWithFabric(
  chunk: ContextChunk,
  pattern: string,
  options?: FabricIntegrationOptions & Omit<PatternOptions, "pattern" | "input">
): Promise<FabricTransformResult> {
  const fabric = createFabricIntegration(options);
  return fabric.transformChunk(chunk, pattern, options);
}

export { 
  FabricCLI,
  createFabricCLI,
  runPattern,
  type PatternOptions,
  type FabricResult,
  type FabricCLIOptions,
  type FabricSetupOptions,
} from "./cli.js";
export { 
  FabricInstaller, 
  createFabricInstaller,
  installFabric,
  type InstallOptions, 
  type InstallResult 
} from "./installer.js";
export { 
  PatternSync,
  createPatternSync,
  type PatternSyncOptions,
  type PatternInfo, 
  type SyncResult 
} from "./patterns.js";
