import { runPattern, listPatterns, getPattern } from "./direct-runner.js";

console.log("=== Testing Direct Pattern Runner with LM Studio ===\n");

// Test input
const testContent = `
Artificial intelligence has fundamentally transformed how we approach software development. 
Large language models can now generate code, debug errors, and even design system architectures.
However, this transformation brings both opportunities and challenges. Developers must learn to 
work alongside AI tools while maintaining code quality and security standards.
`;

async function main() {
  console.log("Available patterns:", listPatterns().slice(0, 10).join(", "), "...\n");
  
  // Test 1: Simple summarize
  console.log("=== Test 1: summarize pattern ===");
  try {
    const result = await runPattern("summarize", testContent, {
      model: "qwen3.5-0.8b-optiq",
      temperature: 0.3
    });
    console.log("Result:\n", result);
  } catch (err: any) {
    console.error("Error:", err.message);
  }
  
  // Test 2: extract_wisdom
  console.log("\n=== Test 2: extract_wisdom pattern ===");
  try {
    const result = await runPattern("extract_wisdom", testContent, {
      model: "qwen3.5-0.8b-optiq",
      temperature: 0.7,
      maxTokens: 2000
    });
    console.log("Result:\n", result);
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

main();
