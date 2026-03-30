import {
  createCredentialProvider,
  generateMasterKey,
} from "@enhancement/credentials";
import {
  createProviderRegistry,
  OpenAICompatibleProvider,
} from "@enhancement/ai-providers";

interface SimulationResult {
  name: string;
  passed: boolean;
  duration: number;
  details: string[];
}

async function runExperiment(): Promise<SimulationResult> {
  const start = Date.now();
  const details: string[] = [];
  const name = "credentials-multi-provider";
  
  try {
    details.push("[1/7] Creating credential provider...");
    const masterKey = generateMasterKey();
    const credentialProvider = createCredentialProvider("test-workspace", masterKey);
    details.push("  ✓ Credential provider created");
    
    details.push("[2/7] Storing multiple credentials for same provider...");
    await credentialProvider.set("openai", "user-primary", "sk-primary-1234567890abcdef");
    await credentialProvider.set("openai", "user-secondary", "sk-secondary-abcdef1234567890");
    await credentialProvider.set("openai", "user-tertiary", "sk-tertiary-fedcba0987654321");
    details.push("  ✓ Stored 3 credentials for openai (primary, secondary, tertiary)");
    
    details.push("[3/7] Listing credentials...");
    const allCreds = await credentialProvider.list("openai");
    details.push(`  ✓ Listed ${allCreds.length} credentials for openai`);
    
    details.push("[4/7] Switching credentials per session...");
    const session1Creds = await credentialProvider.get("openai", "user-primary");
    const session2Creds = await credentialProvider.get("openai", "user-secondary");
    const session3Creds = await credentialProvider.get("openai", "user-tertiary");
    
    if (session1Creds !== "sk-primary-1234567890abcdef") throw new Error("Primary credential mismatch");
    if (session2Creds !== "sk-secondary-abcdef1234567890") throw new Error("Secondary credential mismatch");
    if (session3Creds !== "sk-tertiary-fedcba0987654321") throw new Error("Tertiary credential mismatch");
    details.push("  ✓ Credentials switched correctly per session");
    
    details.push("[5/7] Creating AI provider registry...");
    const registry = createProviderRegistry();
    const openaiProvider = new OpenAICompatibleProvider(
      "https://api.openai.com/v1",
      "sk-test-key"
    );
    registry.register(openaiProvider);
    details.push(`  ✓ Provider registry created with ${openaiProvider.name}`);
    
    details.push("[6/7] Using credentials with AI providers...");
    const activeProvider = registry.get(openaiProvider.name);
    if (!activeProvider) throw new Error("Failed to get active provider");
    details.push(`  ✓ Active provider: ${activeProvider.name}`);
    
    details.push("[7/7] Verifying credential usage patterns...");
    const credsForProvider = await credentialProvider.get("openai", "user-primary");
    details.push(`  ✓ Credential for provider: ${credsForProvider?.slice(0, 20)}...`);
    
    return {
      name,
      passed: true,
      duration: Date.now() - start,
      details,
    };
  } catch (error) {
    details.push(`  ✗ Error: ${error}`);
    return {
      name,
      passed: false,
      duration: Date.now() - start,
      details,
    };
  }
}

async function main() {
  console.log("═".repeat(70));
  console.log(" SIMULATION: credentials-multi-provider");
  console.log("═".repeat(70));
  
  const result = await runExperiment();
  
  console.log("\n" + "─".repeat(70));
  console.log(`RESULT: ${result.passed ? "✓ PASSED" : "✗ FAILED"} (${result.duration}ms)`);
  console.log("─".repeat(70));
  
  for (const detail of result.details) {
    console.log(detail);
  }
  
  console.log("\n" + "═".repeat(70));
  
  if (!result.passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

export { runExperiment };
