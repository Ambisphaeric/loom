/**
 * Fabric CLI Wrapper
 * 
 * Invokes the actual Fabric CLI tool and parses its output.
 * Provides TypeScript API over the shell command interface.
 */

import { spawn, execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { writeFile, readFile, rm } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { ulid } from "ulidx";

export interface FabricCLIOptions {
  /** Path to fabric binary (auto-detected if not provided) */
  binaryPath?: string;
  /** Working directory for patterns and config */
  fabricHome?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Whether to stream output */
  streaming?: boolean;
}

export interface PatternOptions {
  /** Pattern name (e.g., "summarize", "extract_wisdom") */
  pattern: string;
  /** Input text or file path */
  input: string;
  /** Pattern variables (-v flag) */
  variables?: Record<string, string>;
  /** Specific model to use (-m flag) */
  model?: string;
  /** Vendor to use (-V flag) */
  vendor?: string;
  /** Temperature (-t flag) */
  temperature?: number;
  /** Stream output (-s flag) */
  stream?: boolean;
  /** Context from stdin vs file */
  fromStdin?: boolean;
}

export interface FabricResult {
  success: boolean;
  output: string;
  pattern: string;
  error?: string;
  exitCode: number;
  command: string;
}

export interface FabricSetupOptions {
  /** API key for default provider */
  apiKey?: string;
  /** Default model */
  defaultModel?: string;
  /** Pattern folder path */
  patternFolder?: string;
}

export class FabricCLI {
  private binaryPath: string;
  private fabricHome: string;
  private defaultModel?: string;

  constructor(options: FabricCLIOptions = {}) {
    this.binaryPath = options.binaryPath ?? this.detectBinaryPath();
    this.fabricHome = options.fabricHome ?? join(homedir(), ".config", "fabric");
    this.defaultModel = options.defaultModel;
  }

  /**
   * Check if fabric CLI is available
   */
  isAvailable(): boolean {
    try {
      execSync(`"${this.binaryPath}" --version`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run fabric with a pattern
   * 
   * Example:
   * ```typescript
   * const result = await fabric.runPattern({
   *   pattern: "summarize",
   *   input: "Long text here...",
   *   variables: { style: "concise" }
   * });
   * ```
   */
  async runPattern(options: PatternOptions): Promise<FabricResult> {
    if (!this.isAvailable()) {
      return {
        success: false,
        output: "",
        pattern: options.pattern,
        error: `Fabric CLI not found at ${this.binaryPath}. Please run 'fabric.install()' first.`,
        exitCode: -1,
        command: "",
      };
    }

    // Build command arguments
    const args: string[] = ["--pattern", options.pattern];

    // Add model if specified
    if (options.model ?? this.defaultModel) {
      args.push("--model", options.model ?? this.defaultModel!);
    }

    // Add temperature if specified
    if (options.temperature !== undefined) {
      args.push("--temperature", options.temperature.toString());
    }

    // Add vendor if specified
    if (options.vendor) {
      args.push("--vendor", options.vendor);
    }

    // Add streaming flag if disabled
    if (options.stream === false) {
      args.push("--raw");  // Disable streaming with --raw
    }

    // Add variables
    if (options.variables) {
      for (const [key, value] of Object.entries(options.variables)) {
        args.push("--variable", `${key}:${value}`);
      }
    }

    // Build full command for logging
    const command = `"${this.binaryPath}" ${args.join(" ")}`;

    return new Promise((resolve) => {
      const isFileInput = existsSync(options.input);
      
      // If input is a file path, use it directly
      // Otherwise, pipe the text via stdin
      const child = spawn(this.binaryPath, args, {
        stdio: isFileInput ? ["pipe", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      // If not a file, write input to stdin
      if (!isFileInput && options.fromStdin !== false) {
        child.stdin?.write(options.input);
        child.stdin?.end();
      }

      child.on("close", (code) => {
        const success = code === 0;
        resolve({
          success,
          output: stdout.trim(),
          pattern: options.pattern,
          error: success ? undefined : stderr || `Exit code: ${code}`,
          exitCode: code ?? -1,
          command,
        });
      });

      child.on("error", (err) => {
        resolve({
          success: false,
          output: "",
          pattern: options.pattern,
          error: err.message,
          exitCode: -1,
          command,
        });
      });
    });
  }

  /**
   * Run fabric with input from file
   */
  async runPatternFromFile(
    pattern: string,
    filePath: string,
    options?: Omit<PatternOptions, "pattern" | "input">
  ): Promise<FabricResult> {
    return this.runPattern({
      pattern,
      input: filePath,
      fromStdin: false,
      ...options,
    });
  }

  /**
   * List available patterns
   */
  async listPatterns(): Promise<string[]> {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const output = execSync(`"${this.binaryPath}" --listpatterns`, {
        encoding: "utf8",
        timeout: 10000,
      });
      // Parse pattern list from output
      return output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));
    } catch {
      return [];
    }
  }

  /**
   * Get pattern details
   */
  async getPatternInfo(pattern: string): Promise<{ name: string; description?: string } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      // Run fabric with --listpatterns and grep for pattern
      const output = execSync(`"${this.binaryPath}" --listpatterns`, {
        encoding: "utf8",
        timeout: 10000,
      });
      
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.toLowerCase().includes(pattern.toLowerCase())) {
          return { name: pattern, description: line };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Run fabric setup to configure API keys
   */
  async setup(options: FabricSetupOptions = {}): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: "Fabric CLI not installed",
      };
    }

    try {
      // Run setup wizard
      execSync(`"${this.binaryPath}" --setup`, {
        stdio: "inherit",
        timeout: 60000,
      });

      // If API key provided, set it directly
      if (options.apiKey) {
        await this.setAPIKey(options.apiKey);
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Set API key for a provider
   * 
   * Respects existing .env file by only updating the specific key,
   * preserving all other configuration.
   */
  async setAPIKey(key: string, provider: string = "openai"): Promise<void> {
    // Fabric stores config in ~/.config/fabric/.env
    const configDir = join(homedir(), ".config", "fabric");
    mkdirSync(configDir, { recursive: true });

    const envPath = join(configDir, ".env");
    const envVar = provider === "openai" ? "OPENAI_API_KEY" : `${provider.toUpperCase()}_API_KEY`;
    
    // Read existing content if present
    let envContent = "";
    try {
      envContent = await readFile(envPath, "utf8");
    } catch {
      // File doesn't exist, start fresh
    }

    // Parse existing lines
    const lines = envContent.split("\n");
    const newLines: string[] = [];
    let found = false;

    for (const line of lines) {
      if (line.startsWith(`${envVar}=`)) {
        // Replace existing key
        newLines.push(`${envVar}=${key}`);
        found = true;
      } else if (line.trim()) {
        newLines.push(line);
      }
    }

    // Add new key if not found
    if (!found) {
      newLines.push(`${envVar}=${key}`);
    }

    await writeFile(envPath, newLines.join("\n") + "\n", "utf8");
  }

  /**
   * Get fabric version
   */
  async getVersion(): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const output = execSync(`"${this.binaryPath}" --version`, {
        encoding: "utf8",
        timeout: 5000,
      });
      const match = output.match(/version\s+v?(\d+\.\d+\.\d+)/);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Update fabric to latest version
   */
  async update(): Promise<{ success: boolean; version?: string; error?: string }> {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: "Fabric not installed",
      };
    }

    try {
      execSync(`"${this.binaryPath}" --update`, {
        stdio: "inherit",
        timeout: 120000,
      });

      const version = await this.getVersion();
      return { success: true, version: version ?? undefined };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Detect fabric binary in PATH and common locations
   */
  private detectBinaryPath(): string {
    // First, try to find in PATH using `which`
    try {
      const whichOutput = execSync("which fabric", { 
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"]
      }).trim();
      if (whichOutput && existsSync(whichOutput)) {
        return whichOutput;
      }
    } catch {
      // `which` failed, fall through to manual checks
    }

    // Try common installation locations
    const candidates = [
      // Homebrew (macOS ARM)
      "/opt/homebrew/bin/fabric",
      // Homebrew (macOS Intel)
      "/usr/local/bin/fabric",
      // User local
      join(homedir(), ".local", "bin", "fabric"),
      // Go install default
      join(homedir(), "go", "bin", "fabric"),
      // Our managed location
      join(homedir(), ".enhancement", "bin", "fabric"),
      // System paths
      "/usr/bin/fabric",
      "/bin/fabric",
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        try {
          execSync(`"${candidate}" --version`, { stdio: "ignore" });
          return candidate;
        } catch {
          continue;
        }
      }
    }

    // Return default even if not found (will fail later with clear message)
    return candidates[4]; // ~/.enhancement/bin/fabric
  }

  /**
   * Get the binary path
   */
  getBinaryPath(): string {
    return this.binaryPath;
  }
}

/**
 * Create CLI instance
 */
export function createFabricCLI(options?: FabricCLIOptions): FabricCLI {
  return new FabricCLI(options);
}

/**
 * Quick pattern execution
 */
export async function runPattern(
  pattern: string,
  input: string,
  options?: Omit<PatternOptions, "pattern" | "input">
): Promise<FabricResult> {
  const cli = createFabricCLI();
  return cli.runPattern({ pattern, input, ...options });
}
