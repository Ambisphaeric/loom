import {
  createDiscoveryService,
  detectLLM,
  detectSTT,
  detectAllServices,
  installService,
  probePort,
} from "@enhancement/discovery";
import {
  createProviderRegistry,
  OpenAICompatibleProvider,
} from "@enhancement/ai-providers";
import {
  RecipeExecutor,
} from "@enhancement/recipe";

interface SimulationResult {
  name: string;
  passed: boolean;
  duration: number;
  details: string[];
}

function generateULID(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

async function runExperiment(): Promise<SimulationResult> {
  const start = Date.now();
  const details: string[] = [];
  const name = "discovery-integration";
  
  try {
    details.push("[1/8] Creating discovery service...");
    const discovery = createDiscoveryService();
    details.push("  ✓ Discovery service created");
    
    details.push("[2/8] Detecting LLM services...");
    const llmResult = await detectLLM("openai");
    details.push(`  ✓ LLM detection completed: ${llmResult.found ? "found" : "not found"}`);
    if (llmResult.found) {
      details.push(`    - Provider: ${llmResult.provider}`);
      details.push(`    - Models: ${llmResult.models?.join(", ") || "N/A"}`);
    }
    
    details.push("[3/8] Detecting STT services...");
    const sttResult = await detectSTT("whisper");
    details.push(`  ✓ STT detection completed: ${sttResult.found ? "found" : "not found"}`);
    if (sttResult.found) {
      details.push(`    - Provider: ${sttResult.provider}`);
      details.push(`    - Model: ${sttResult.model || "default"}`);
    }
    
    details.push("[4/8] Detecting all services...");
    const allServices = await detectAllServices();
    details.push(`  ✓ Found ${allServices.length} total services`);
    
    details.push("[5/8] Probing common ports...");
    const ollamaPort = await probePort(11434, "/api/tags");
    const lmStudioPort = await probePort(1234, "/v1/models");
    details.push(`  ✓ Ollama (11434): ${ollamaPort ? "open" : "closed"}`);
    details.push(`  ✓ LM Studio (1234): ${lmStudioPort ? "open" : "closed"}`);
    
    details.push("[6/8] Creating provider registry with discovered models...");
    const registry = createProviderRegistry();
    
    if (llmResult.found && llmResult.endpoint) {
      const provider = new OpenAICompatibleProvider({
        name: llmResult.provider,
        baseUrl: llmResult.endpoint,
      });
      registry.register(provider);
      details.push(`  ✓ Registered discovered provider: ${llmResult.provider}`);
    } else {
      const fallbackProvider = new OpenAICompatibleProvider({
        name: "openai",
        baseUrl: "https://api.openai.com/v1",
      });
      registry.register(fallbackProvider);
      details.push("  ✓ Using fallback provider (no local LLM detected)");
    }
    
    details.push("[7/8] Creating recipe with discovered tools...");
    const executor = new RecipeExecutor();
    
    executor.registerHandler("detect", async (step, input) => {
      return input.map(c => ({
        ...c,
        content: `[Detected] ${c.content}`,
      }));
    });
    
    const recipe = {
      id: generateULID(),
      workspace: "discovery-workspace",
      name: "Discovery Test Recipe",
      mode: "batch" as const,
      schemaVersion: 1,
      audiences: [],
      steps: [
        {
          id: generateULID(),
          kind: "detect" as const,
          label: "Detect Content",
          description: "Process input content",
          config: {},
          trigger: { type: "manual" as const },
          enabled: true,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    details.push("  ✓ Recipe created with detect handler");
    
    details.push("[8/8] Testing installer stubs for missing tools...");
    const installResult = await installService("ollama");
    details.push(`  ✓ Ollama installer stub: ${installResult.success ? "available" : "not available"}`);
    details.push(`    Message: ${installResult.message}`);
    
    const providers = registry.list();
    details.push(`  ✓ Provider registry has ${providers.length} providers`);
    
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
  console.log(" SIMULATION: discovery-integration");
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
