/**
 * Fabric Package Verification Test
 * 
 * Tests that the fabric package is correctly installed and integrated.
 * Note: Running actual patterns requires fabric --setup to be completed.
 */

import { 
  createFabricIntegration,
  createFabricCLI,
  createFabricInstaller,
  createPatternSync,
} from "@enhancement/fabric";

console.log("=== Fabric Package Integration Verification ===\n");

// Test 1: Verify all components are exported
console.log("1. Checking package exports...");
try {
  const integration = createFabricIntegration();
  const cli = createFabricCLI();
  const installer = createFabricInstaller();
  const patterns = createPatternSync();
  console.log("   ✓ All exports available");
  console.log(`   - createFabricIntegration: ${typeof createFabricIntegration}`);
  console.log(`   - createFabricCLI: ${typeof createFabricCLI}`);
  console.log(`   - createFabricInstaller: ${typeof createFabricInstaller}`);
  console.log(`   - createPatternSync: ${typeof createPatternSync}`);
} catch (err) {
  console.error("   ✗ Export check failed:", err);
  process.exit(1);
}

// Test 2: Check for existing fabric installation
console.log("\n2. Checking for Fabric CLI...");
const installer = createFabricInstaller();
const cli = createFabricCLI();

const inManaged = installer.isInstalled();
const anywhere = installer.isInstalledAnywhere();
const cliAvailable = cli.isAvailable();

console.log(`   Managed location (~/.enhancement/bin): ${inManaged ? "✓" : "✗"}`);
console.log(`   Anywhere on system: ${anywhere ? "✓" : "✗"}`);
console.log(`   CLI available: ${cliAvailable ? "✓" : "✗"}`);
console.log(`   Binary path: ${cli.getBinaryPath()}`);

// Test 3: Initialize
console.log("\n3. Testing initialization...");
const fabric = createFabricIntegration({ autoInstall: true });
const initResult = await fabric.initialize();

console.log(`   Success: ${initResult.success ? "✓" : "✗"}`);
console.log(`   Binary: ${initResult.binaryPath}`);
console.log(`   Newly installed: ${initResult.installed}`);
console.log(`   Using existing: ${initResult.usingExisting}`);

if (!initResult.success) {
  console.error(`   Error: ${initResult.error}`);
}

// Test 4: Version check
console.log("\n4. Version information...");
const version = await fabric.getVersion();
console.log(`   Version: ${version ?? "unknown (needs setup)"}`);

// Test 5: Check patterns status
console.log("\n5. Pattern status...");
const patternSync = fabric.getPatternSync();
const localPatterns = await patternSync.listLocalPatterns();
console.log(`   Local patterns: ${localPatterns.length}`);
if (localPatterns.length > 0) {
  console.log(`   Examples: ${localPatterns.slice(0, 5).join(", ")}`);
}

// Test 6: Check CLI methods
console.log("\n6. CLI capabilities...");
const fabricCLI = fabric.getCLI();
console.log(`   isAvailable: ${fabricCLI.isAvailable()}`);
console.log(`   Binary path: ${fabricCLI.getBinaryPath()}`);

// Summary
console.log("\n=== Verification Summary ===");
console.log(`Package exports: ✓`);
console.log(`Fabric installed: ${initResult.success ? "✓" : "✗"}`);
console.log(`CLI accessible: ${cliAvailable ? "✓" : "✗"}`);
console.log(`Patterns available: ${localPatterns.length > 0 ? "✓" : "needs setup"}`);

if (localPatterns.length === 0) {
  console.log("\n📋 Next steps to use patterns:");
  console.log("   1. Run: fabric --setup");
  console.log("   2. Configure an AI provider (e.g., OpenAI, Anthropic, or LM Studio)");
  console.log("   3. Patterns will be downloaded automatically during setup");
  console.log("   4. Then you can use: fabric.transformChunk(chunk, 'pattern_name')");
}

console.log("\n✓ Fabric package verification complete!");
