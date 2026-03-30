/**
 * Fabric CLI Installer
 * 
 * Handles installing the Fabric CLI using official installation methods.
 * Respects existing installations and only installs if needed.
 * 
 * IMPORTANT: Daniel Miessler's Fabric is a Go binary, NOT a Python package.
 * The Python package "fabric" on PyPI is for SSH deployment and is WRONG.
 * 
 * Correct installation methods:
 * 1. Official install script (recommended)
 * 2. Homebrew: brew install fabric-ai (note the package name!)
 * 3. Go install: go install github.com/danielmiessler/fabric/cmd/fabric@latest
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface InstallOptions {
  /** Directory to install fabric binary (default: ~/.enhancement/bin) */
  installDir?: string;
  /** Specific version to install (default: latest) */
  version?: string;
  /** Force reinstall even if already present */
  force?: boolean;
}

export interface InstallResult {
  success: boolean;
  binaryPath: string;
  version: string;
  installed: boolean;
  error?: string;
}

export class FabricInstaller {
  private installDir: string;
  private binaryName: string;

  constructor(installDir?: string) {
    this.installDir = installDir ?? join(homedir(), ".enhancement", "bin");
    this.binaryName = process.platform === "win32" ? "fabric.exe" : "fabric";
  }

  /**
   * Check if fabric is installed in our managed location
   */
  isInstalled(): boolean {
    const binaryPath = join(this.installDir, this.binaryName);
    return existsSync(binaryPath);
  }

  /**
   * Check if fabric exists anywhere on the system (PATH, homebrew, etc.)
   */
  isInstalledAnywhere(): boolean {
    // Try `which` first
    try {
      execSync("which fabric", { stdio: "ignore" });
      return true;
    } catch {
      // Fall through to manual checks
    }

    // Check common locations
    const candidates = [
      "/opt/homebrew/bin/fabric",
      "/opt/homebrew/bin/fabric-ai",  // Homebrew on macOS ARM
      "/usr/local/bin/fabric",
      "/usr/local/bin/fabric-ai",   // Homebrew on macOS Intel
      join(homedir(), ".local", "bin", "fabric"),
      join(homedir(), "go", "bin", "fabric"),
      join(homedir(), ".enhancement", "bin", "fabric"),
      "/usr/bin/fabric",
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        try {
          execSync(`"${candidate}" --version`, { stdio: "ignore" });
          return true;
        } catch {
          continue;
        }
      }
    }

    return false;
  }

  /**
   * Get path to fabric binary in managed location
   */
  getBinaryPath(): string {
    return join(this.installDir, this.binaryName);
  }

  /**
   * Install fabric CLI
   * 
   * Tries multiple installation methods in order:
   * 1. Official install script (recommended)
   * 2. Homebrew: brew install fabric-ai
   * 3. Go install
   */
  async install(options: InstallOptions = {}): Promise<InstallResult> {
    const { force = false } = options;
    const binaryPath = this.getBinaryPath();

    // Check if already installed in our location
    if (!force && this.isInstalled()) {
      const existingVersion = await this.getInstalledVersion();
      return {
        success: true,
        binaryPath,
        version: existingVersion ?? "unknown",
        installed: false,
      };
    }

    // Ensure install directory exists
    mkdirSync(this.installDir, { recursive: true });

    // Try official install script first (handles everything)
    console.log("Attempting to install via official installer script...");
    const scriptResult = await this.installViaScript();
    if (scriptResult.success && scriptResult.binaryPath) {
      // If the script installed somewhere else, create symlink
      if (scriptResult.binaryPath !== binaryPath) {
        if (process.platform !== "win32") {
          try {
            execSync(`ln -sf "${scriptResult.binaryPath}" "${binaryPath}"`);
          } catch {
            // Use the script's location directly
            return {
              success: true,
              binaryPath: scriptResult.binaryPath,
              version: scriptResult.version ?? "latest",
              installed: true,
            };
          }
        }
      }
      
      return {
        success: true,
        binaryPath,
        version: scriptResult.version ?? "latest",
        installed: true,
      };
    }

    // Try Homebrew (note: package name is fabric-ai)
    console.log("Attempting to install via Homebrew...");
    const brewResult = await this.installViaHomebrew();
    if (brewResult.success && brewResult.binaryPath) {
      // Homebrew installs as 'fabric-ai', create symlink as 'fabric'
      if (process.platform !== "win32") {
        try {
          execSync(`ln -sf "${brewResult.binaryPath}" "${binaryPath}"`);
        } catch {
          return {
            success: true,
            binaryPath: brewResult.binaryPath,
            version: brewResult.version ?? "latest",
            installed: true,
          };
        }
      }
      
      return {
        success: true,
        binaryPath,
        version: brewResult.version ?? "latest",
        installed: true,
      };
    }

    // Try Go install
    console.log("Attempting to install via 'go install'...");
    const goResult = await this.installViaGo();
    if (goResult.success && goResult.binaryPath) {
      // Go installs to ~/go/bin/fabric
      if (goResult.binaryPath !== binaryPath) {
        if (process.platform !== "win32") {
          try {
            execSync(`ln -sf "${goResult.binaryPath}" "${binaryPath}"`);
          } catch {
            return {
              success: true,
              binaryPath: goResult.binaryPath,
              version: goResult.version ?? "latest",
              installed: true,
            };
          }
        }
      }
      
      return {
        success: true,
        binaryPath,
        version: goResult.version ?? "latest",
        installed: true,
      };
    }

    // All methods failed
    return {
      success: false,
      binaryPath,
      version: "",
      installed: false,
      error: 
        "Could not install fabric automatically. Please install manually:\n" +
        "  Option 1: curl -fsSL https://raw.githubusercontent.com/danielmiessler/fabric/main/scripts/installer/install.sh | bash\n" +
        "  Option 2: brew install fabric-ai (note: package name is fabric-ai, not fabric)\n" +
        "  Option 3: go install github.com/danielmiessler/fabric/cmd/fabric@latest\n" +
        "  Option 4: Download from https://github.com/danielmiessler/fabric/releases",
    };
  }

  /**
   * Install via official installer script
   */
  private async installViaScript(): Promise<{ success: boolean; version?: string; binaryPath?: string; error?: string }> {
    try {
      // Run the official install script with our install directory
      const cmd = `curl -fsSL https://raw.githubusercontent.com/danielmiessler/fabric/main/scripts/installer/install.sh | bash -s -- -b "${this.installDir}"`;
      
      execSync(cmd, {
        stdio: "inherit",
        timeout: 120000,
      });

      // Check if it was installed
      const installedBinary = join(this.installDir, "fabric");
      if (existsSync(installedBinary)) {
        const version = await this.getBinaryVersion(installedBinary);
        return { success: true, version: version ?? "latest", binaryPath: installedBinary };
      }

      return { success: false, error: "Installation script completed but binary not found" };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : String(err) 
      };
    }
  }

  /**
   * Install via Homebrew
   * NOTE: Package name is fabric-ai, not fabric!
   */
  private async installViaHomebrew(): Promise<{ success: boolean; version?: string; binaryPath?: string; error?: string }> {
    try {
      // Check if brew is available
      execSync("brew --version", { stdio: "ignore" });
      
      // Install fabric-ai (note the package name!)
      execSync("brew install fabric-ai", {
        stdio: "inherit",
        timeout: 120000,
      });

      // Find where it was installed
      const brewPrefix = execSync("brew --prefix", { encoding: "utf8" }).trim();
      const brewBinary = join(brewPrefix, "bin", "fabric-ai");
      
      if (existsSync(brewBinary)) {
        const version = await this.getBinaryVersion(brewBinary);
        return { success: true, version: version ?? "latest", binaryPath: brewBinary };
      }

      return { success: false, error: "Homebrew installed but binary not found" };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : String(err) 
      };
    }
  }

  /**
   * Install via go install
   */
  private async installViaGo(): Promise<{ success: boolean; version?: string; binaryPath?: string; error?: string }> {
    try {
      // Check if go is available
      execSync("go version", { stdio: "ignore" });

      // Install via go - note the /cmd/fabric path
      execSync("go install github.com/danielmiessler/fabric/cmd/fabric@latest", {
        env: { ...process.env, GOBIN: this.installDir },
        stdio: "inherit",
        timeout: 120000,
      });

      // Check if it was installed to our directory first
      const managedBinary = join(this.installDir, "fabric");
      if (existsSync(managedBinary)) {
        const version = await this.getBinaryVersion(managedBinary);
        return { success: true, version: version ?? "latest", binaryPath: managedBinary };
      }

      // Check if it was installed to ~/go/bin
      const goBinary = join(homedir(), "go", "bin", "fabric");
      if (existsSync(goBinary)) {
        const version = await this.getBinaryVersion(goBinary);
        return { success: true, version: version ?? "latest", binaryPath: goBinary };
      }

      return { success: false, error: "Go install completed but binary not found" };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : String(err) 
      };
    }
  }

  /**
   * Get version of a specific fabric binary
   */
  private async getBinaryVersion(binaryPath: string): Promise<string | null> {
    try {
      const output = execSync(`"${binaryPath}" --version`, {
        encoding: "utf8",
        timeout: 5000,
      });
      // Parse version from output like "fabric version v1.4.442"
      const match = output.match(/version\s+v?(\d+\.\d+\.\d+)/);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get version of installed fabric binary (in managed location)
   */
  async getInstalledVersion(): Promise<string | null> {
    const binaryPath = this.getBinaryPath();
    if (!existsSync(binaryPath)) {
      return null;
    }
    return this.getBinaryVersion(binaryPath);
  }

  /**
   * Uninstall fabric binary from managed location
   */
  async uninstall(): Promise<boolean> {
    const binaryPath = this.getBinaryPath();
    if (existsSync(binaryPath)) {
      await Bun.file(binaryPath).delete();
      return true;
    }
    return false;
  }
}

/**
 * Create installer instance
 */
export function createFabricInstaller(installDir?: string): FabricInstaller {
  return new FabricInstaller(installDir);
}

/**
 * Quick install function
 */
export async function installFabric(options?: InstallOptions): Promise<InstallResult> {
  const installer = createFabricInstaller(options?.installDir);
  return installer.install(options);
}
