/**
 * Direct Pattern Runner for @enhancement/fabric
 * 
 * This is the RECOMMENDED way to use fabric patterns - no CLI binary required!
 * Runs extracted fabric patterns directly against LM Studio or any OpenAI-compatible API.
 * 
 * @example
 * ```typescript
 * import { runPattern, listPatterns, getPattern } from "@enhancement/fabric/direct";
 * 
 * // List all 76 available patterns
 * const patterns = listPatterns();
 * console.log(patterns);
 * 
 * // Run a pattern
 * const result = await runPattern("summarize", "Your text to summarize");
 * console.log(result);
 * 
 * // Get pattern details
 * const pattern = getPattern("extract_wisdom");
 * console.log(pattern.identity);
 * console.log(pattern.steps);
 * ```
 */

export {
  // Core functions
  runPattern,
  runPatternStreaming,
  buildSystemPrompt,
  
  // Pattern registry
  listPatterns,
  getPattern,
  getPatternsByCategory,
  getAllCategories,
  loadPatterns,
  
  // Types
  type Pattern,
  type PatternsRegistry,
} from "./direct-runner.js";
