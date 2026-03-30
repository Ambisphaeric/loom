import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Load extracted patterns - check multiple locations
const PATTERNS_PATHS = [
  "./fabric-patterns-extracted.json",
  "/etc/fabric-patterns/fabric-patterns-extracted.json",
  join(homedir(), ".config/fabric/patterns-extracted.json"),
];

function findPatternsPath(): string {
  for (const path of PATTERNS_PATHS) {
    if (existsSync(path)) {
      return path;
    }
  }
  throw new Error(
    `Patterns file not found. Checked: ${PATTERNS_PATHS.join(", ")}. ` +
    `Run with PATTERNS_PATH env var to specify location.`
  );
}

const PATTERNS_PATH = process.env.PATTERNS_PATH || findPatternsPath();

export interface Pattern {
  name: string;
  category: string;
  identity: string;
  steps: string;
  output_instructions: string;
}

export interface PatternsRegistry {
  patterns: Pattern[];
  total_extracted: number;
  missing_patterns: string[];
}

let patternsRegistry: PatternsRegistry | null = null;

export function loadPatterns(): PatternsRegistry {
  if (patternsRegistry) return patternsRegistry;
  
  if (!existsSync(PATTERNS_PATH)) {
    throw new Error(`Patterns file not found at ${PATTERNS_PATH}. Run extraction first.`);
  }
  
  const content = readFileSync(PATTERNS_PATH, "utf8");
  patternsRegistry = JSON.parse(content) as PatternsRegistry;
  return patternsRegistry;
}

export function listPatterns(): string[] {
  const registry = loadPatterns();
  return registry.patterns.map(p => p.name);
}

export function getPattern(name: string): Pattern | undefined {
  const registry = loadPatterns();
  return registry.patterns.find(p => p.name === name);
}

export function getPatternsByCategory(category: string): Pattern[] {
  const registry = loadPatterns();
  return registry.patterns.filter(p => p.category === category);
}

export function getAllCategories(): string[] {
  const registry = loadPatterns();
  return [...new Set(registry.patterns.map(p => p.category))];
}

/**
 * Build a system prompt from a fabric pattern
 */
export function buildSystemPrompt(patternName: string): string {
  const pattern = getPattern(patternName);
  if (!pattern) {
    throw new Error(`Pattern "${patternName}" not found. Available: ${listPatterns().join(", ")}`);
  }
  
  return `# ${pattern.name.toUpperCase()}

## IDENTITY and PURPOSE
${pattern.identity}

## STEPS
${pattern.steps}

## OUTPUT INSTRUCTIONS
${pattern.output_instructions}`;
}

/**
 * Run a fabric pattern against LM Studio using direct HTTP call via curl
 */
export async function runPattern(
  patternName: string,
  input: string,
  options: {
    model?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const {
    model = "qwen3.5-0.8b-optiq",
    baseUrl = "http://localhost:1234/v1",
    temperature = 0.7,
    maxTokens = 4000
  } = options;

  const systemPrompt = buildSystemPrompt(patternName);
  
  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input }
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false
  };

  const cmd = `curl -s ${baseUrl}/chat/completions \
    -H "Content-Type: application/json" \
    -d '${JSON.stringify(payload).replace(/'/g, "'\"'\"'")}'`;

  try {
    const result = execSync(cmd, { encoding: "utf8", timeout: 120000 });
    const response = JSON.parse(result);
    
    if (response.error) {
      throw new Error(`LM Studio error: ${response.error.message}`);
    }
    
    return response.choices?.[0]?.message?.content || "";
  } catch (err: any) {
    if (err.code === "ETIMEDOUT") {
      throw new Error("Request timed out. Check if LM Studio is running.");
    }
    throw new Error(`Failed to run pattern: ${err.message}`);
  }
}

/**
 * Run a fabric pattern with streaming response
 */
export async function runPatternStreaming(
  patternName: string,
  input: string,
  onChunk: (chunk: string) => void,
  options: {
    model?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<void> {
  const {
    model = "qwen3.5-0.8b-optiq",
    baseUrl = "http://localhost:1234/v1",
    temperature = 0.7,
    maxTokens = 4000
  } = options;

  const systemPrompt = buildSystemPrompt(patternName);
  
  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input }
    ],
    temperature,
    max_tokens: maxTokens,
    stream: true
  };

  const { spawn } = await import("child_process");
  
  const curl = spawn("curl", [
    "-s", "-N",
    `${baseUrl}/chat/completions`,
    "-H", "Content-Type: application/json",
    "-d", JSON.stringify(payload)
  ]);

  let buffer = "";
  
  curl.stdout.on("data", (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const content = line.slice(6);
        if (content === "[DONE]") return;
        
        try {
          const parsed = JSON.parse(content);
          const chunk = parsed.choices?.[0]?.delta?.content || "";
          if (chunk) onChunk(chunk);
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  });

  return new Promise((resolve, reject) => {
    curl.on("close", (code: number) => {
      if (code === 0) resolve();
      else reject(new Error(`curl exited with code ${code}`));
    });
    
    curl.on("error", (err: Error) => reject(err));
  });
}

// CLI test
if (import.meta.main) {
  console.log("=== Fabric Patterns Direct Runner ===\n");
  
  const registry = loadPatterns();
  console.log(`Loaded ${registry.patterns.length} patterns`);
  console.log("\nCategories:");
  for (const cat of getAllCategories()) {
    const count = getPatternsByCategory(cat).length;
    console.log(`  ${cat}: ${count} patterns`);
  }
  
  console.log("\nSample patterns:");
  console.log(listPatterns().slice(0, 10).join(", "));
  
  // Test extract_wisdom prompt
  console.log("\n\n=== Sample: extract_wisdom system prompt ===");
  console.log(buildSystemPrompt("extract_wisdom").slice(0, 500) + "...");
}
