/**
 * Fabric Pattern Sync
 * 
 * Manages pattern synchronization using Fabric's built-in commands.
 * Fabric CLI has native pattern management via --updatepatterns flag.
 * 
 * This class is a wrapper around fabric's pattern commands that:
 * 1. Respects existing fabric setups
 * 2. Uses fabric's native -U flag to update patterns
 * 3. Lists patterns using fabric's -l flag
 */

import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

export interface PatternSyncOptions {
  /** Directory to store patterns (default: detected or ~/.config/fabric/patterns) */
  patternsDir?: string;
  /** Path to fabric binary */
  binaryPath?: string;
}

export interface PatternInfo {
  name: string;
  description?: string;
  path: string;
  systemPrompt: string;
  userPrompt?: string;
}

export interface SyncResult {
  success: boolean;
  downloaded: number;
  skipped: number;
  errors: string[];
  patternsDir: string;
}

export class PatternSync {
  private patternsDir: string;
  private binaryPath: string;

  constructor(options: PatternSyncOptions = {}) {
    this.patternsDir = options.patternsDir ?? this.findPatternsDir();
    this.binaryPath = options.binaryPath ?? "fabric";
  }

  /**
   * Find fabric patterns directory
   * Checks multiple locations in order of preference
   */
  private findPatternsDir(): string {
    const candidates = [
      join(homedir(), ".config", "fabric", "patterns"),
      join(homedir(), ".fabric", "patterns"),
      join(homedir(), ".local", "share", "fabric", "patterns"),
    ];

    for (const dir of candidates) {
      if (existsSync(dir)) {
        return dir;
      }
    }

    // Default location
    return join(homedir(), ".config", "fabric", "patterns");
  }

  /**
   * Check if fabric binary is available
   */
  private isFabricAvailable(): boolean {
    try {
      execSync(`"${this.binaryPath}" --version`, { stdio: "ignore", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch list of available patterns using fabric CLI
   */
  async fetchPatternList(): Promise<string[]> {
    if (!this.isFabricAvailable()) {
      throw new Error("Fabric CLI not available");
    }

    try {
      // Use fabric -l to list patterns
      const output = execSync(`"${this.binaryPath}" -l`, {
        encoding: "utf8",
        timeout: 30000,
      });

      // Parse output - fabric lists patterns one per line
      return output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("Usage"));
    } catch (err) {
      // Fallback: scan local patterns directory
      if (existsSync(this.patternsDir)) {
        const entries = await readdir(this.patternsDir, { withFileTypes: true });
        return entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort();
      }
      throw new Error(`Failed to fetch patterns: ${err}`);
    }
  }

  /**
   * Download a specific pattern
   * Note: In Fabric, patterns are bundled - use syncAll instead
   */
  async downloadPattern(patternName: string): Promise<{ success: boolean; error?: string }> {
    // Fabric patterns come as a bundle, individual download not supported
    // User should use syncAll to get all patterns
    return {
      success: false,
      error: "Fabric patterns are bundled. Use syncAll() to download all patterns at once.",
    };
  }

  /**
   * Sync all patterns using fabric's built-in update command
   * This uses fabric -U (or --updatepatterns) which is the official way
   */
  async syncAll(options: { force?: boolean } = {}): Promise<SyncResult> {
    if (!this.isFabricAvailable()) {
      return {
        success: false,
        downloaded: 0,
        skipped: 0,
        errors: ["Fabric CLI not available"],
        patternsDir: this.patternsDir,
      };
    }

    const errors: string[] = [];
    let downloaded = 0;

    try {
      // Get count before sync
      const beforeCount = await this.countLocalPatterns();

      // Run fabric's update patterns command
      // -U or --updatepatterns flag
      execSync(`"${this.binaryPath}" --updatepatterns`, {
        stdio: "inherit",
        timeout: 120000,
      });

      // Get count after sync
      const afterCount = await this.countLocalPatterns();
      downloaded = afterCount - beforeCount;

      return {
        success: true,
        downloaded,
        skipped: 0,
        errors,
        patternsDir: this.patternsDir,
      };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return {
        success: false,
        downloaded,
        skipped: 0,
        errors,
        patternsDir: this.patternsDir,
      };
    }
  }

  /**
   * Count local patterns
   */
  private async countLocalPatterns(): Promise<number> {
    try {
      if (!existsSync(this.patternsDir)) {
        return 0;
      }
      const entries = await readdir(this.patternsDir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).length;
    } catch {
      return 0;
    }
  }

  /**
   * List patterns currently stored locally
   */
  async listLocalPatterns(): Promise<string[]> {
    try {
      if (!existsSync(this.patternsDir)) {
        return [];
      }
      const entries = await readdir(this.patternsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Load a specific pattern's details
   */
  async loadPattern(patternName: string): Promise<PatternInfo | null> {
    const patternDir = join(this.patternsDir, patternName);
    
    if (!existsSync(patternDir)) {
      return null;
    }

    try {
      const systemPath = join(patternDir, "system.md");
      const userPath = join(patternDir, "user.md");

      let systemPrompt = "";
      let userPrompt: string | undefined;

      if (existsSync(systemPath)) {
        systemPrompt = await readFile(systemPath, "utf8");
      }

      if (existsSync(userPath)) {
        userPrompt = await readFile(userPath, "utf8");
      }

      return {
        name: patternName,
        path: patternDir,
        systemPrompt,
        userPrompt,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a pattern exists locally
   */
  hasPattern(patternName: string): boolean {
    return existsSync(join(this.patternsDir, patternName));
  }

  /**
   * Get the patterns directory path
   */
  getPatternsDir(): string {
    return this.patternsDir;
  }
}

/**
 * Create pattern sync instance
 */
export function createPatternSync(
  patternsDir?: string,
  binaryPath?: string
): PatternSync {
  return new PatternSync({ patternsDir, binaryPath });
}
