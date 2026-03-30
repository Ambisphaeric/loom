import type { ContextChunk } from "@enhancement/types";

export type FabricCategory =
  | "summarize"
  | "extract"
  | "analyze"
  | "write"
  | "review"
  | "convert"
  | "improve"
  | "custom";

export interface FabricPattern {
  name: string;
  description: string;
  prompt: string;
  category: FabricCategory;
}

export interface FabricOptions {
  available: boolean;
  model?: string;
  temperature?: number;
}

export interface AIProvider {
  createChatCompletion(
    endpoint: ProviderEndpoint,
    params: {
      model: string;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
    }
  ): Promise<{ content: string; usage?: { totalTokens?: number } }>;
}

export interface ProviderEndpoint {
  url: string;
  apiKey?: string;
}

export interface PatternRunResult {
  success: boolean;
  output?: string;
  error?: string;
  pattern: string;
  tokensUsed?: number;
}

export interface ChunkTransformResult {
  chunks: ContextChunk[];
  result: PatternRunResult;
}

const DEFAULT_PATTERNS: FabricPattern[] = [
  {
    name: "summarize",
    description: "Create a concise summary of the input text",
    prompt: "Summarize the following text concisely:\n\n{{input}}",
    category: "summarize",
  },
  {
    name: "extract_wisdom",
    description: "Extract key insights and wisdom from text",
    prompt:
      "Extract the key insights and wisdom from the following text. Focus on actionable knowledge and memorable points:\n\n{{input}}",
    category: "extract",
  },
  {
    name: "key_points",
    description: "Extract the main key points from text",
    prompt: "List the main key points from the following text:\n\n{{input}}",
    category: "extract",
  },
  {
    name: "tl_dr",
    description: "Create a TL;DR summary",
    prompt: "Create a TL;DR (too long; didn't read) summary of:\n\n{{input}}",
    category: "summarize",
  },
  {
    name: "analyze_sentiment",
    description: "Analyze the sentiment of the text",
    prompt: "Analyze the sentiment of this text and explain your reasoning:\n\n{{input}}",
    category: "analyze",
  },
  {
    name: "rewrite_for_clarity",
    description: "Rewrite the text for better clarity",
    prompt: "Rewrite the following text for better clarity and readability:\n\n{{input}}",
    category: "improve",
  },
  {
    name: "expand_brief",
    description: "Expand a brief outline into detailed content",
    prompt: "Expand the following brief outline into detailed content:\n\n{{input}}",
    category: "write",
  },
  {
    name: "markdown_to_html",
    description: "Convert Markdown to HTML",
    prompt: "Convert the following Markdown to clean HTML:\n\n{{input}}",
    category: "convert",
  },
  {
    name: "html_to_markdown",
    description: "Convert HTML to Markdown",
    prompt: "Convert the following HTML to clean Markdown:\n\n{{input}}",
    category: "convert",
  },
  {
    name: "review_code",
    description: "Review code and provide feedback",
    prompt:
      "Review the following code and provide constructive feedback on quality, potential bugs, and improvements:\n\n```\n{{input}}\n```",
    category: "review",
  },
  {
    name: "explain_code",
    description: "Explain what the code does",
    prompt: "Explain what the following code does in simple terms:\n\n```\n{{input}}\n```",
    category: "analyze",
  },
  {
    name: "spelling_check",
    description: "Check and correct spelling",
    prompt: "Check the spelling in the following text and provide a corrected version:\n\n{{input}}",
    category: "improve",
  },
];

export class FabricTransformer {
  patterns = new Map<string, FabricPattern>();
  options: FabricOptions;
  provider?: AIProvider;
  endpoint?: ProviderEndpoint;

  constructor(
    options: FabricOptions,
    provider?: AIProvider,
    endpoint?: ProviderEndpoint
  ) {
    this.options = options;
    this.provider = provider;
    this.endpoint = endpoint;
    for (const pattern of DEFAULT_PATTERNS) {
      this.patterns.set(pattern.name, pattern);
    }
  }

  registerPattern(pattern: FabricPattern): void {
    this.patterns.set(pattern.name, pattern);
  }

  unregisterPattern(name: string): boolean {
    return this.patterns.delete(name);
  }

  getPattern(name: string): FabricPattern | undefined {
    return this.patterns.get(name);
  }

  getPatternsByCategory(category: FabricCategory): FabricPattern[] {
    return [...this.patterns.values()].filter((p) => p.category === category);
  }

  getAllPatterns(): FabricPattern[] {
    return [...this.patterns.values()];
  }

  listPatternNames(): string[] {
    return [...this.patterns.keys()];
  }

  async runPattern(
    patternName: string,
    input: string,
    variables?: Record<string, string>
  ): Promise<PatternRunResult> {
    const pattern = this.patterns.get(patternName);
    if (!pattern) {
      return {
        success: false,
        error: `Pattern "${patternName}" not found`,
        pattern: patternName,
      };
    }

    if (!this.options.available) {
      // Build substituted prompt for simulated output
      let substituted = pattern.prompt;
      substituted = substituted.replace("{{input}}", input);
      if (variables) {
        for (const [key, value] of Object.entries(variables)) {
          substituted = substituted.replace(`{{${key}}}`, value);
        }
      }
      return {
        success: true,
        output: `[Fabric ${patternName}] Simulated: ${substituted}`,
        pattern: patternName,
      };
    }

    try {
      let prompt = pattern.prompt;
      prompt = prompt.replace("{{input}}", input);
      if (variables) {
        for (const [key, value] of Object.entries(variables)) {
          prompt = prompt.replace(`{{${key}}}`, value);
        }
      }

      if (this.provider && this.endpoint) {
        const result = await this.provider.createChatCompletion(this.endpoint, {
          model: this.options.model ?? "gpt-4",
          messages: [{ role: "user", content: prompt }],
          temperature: this.options.temperature ?? 0.7,
        });
        return {
          success: true,
          output: result.content,
          pattern: patternName,
          tokensUsed: result.usage?.totalTokens,
        };
      }

      return {
        success: true,
        output: `[Fabric ${patternName}] Simulated: ${prompt}`,
        pattern: patternName,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        pattern: patternName,
      };
    }
  }

  async transformChunk(
    chunk: ContextChunk,
    patternName: string,
    variables?: Record<string, string>
  ): Promise<ChunkTransformResult> {
    const result = await this.runPattern(patternName, chunk.content, variables);
    const transformedChunk: ContextChunk = {
      ...chunk,
      id: `fabric-${chunk.id}`,
      source: `fabric:${patternName}`,
      content: result.success ? result.output ?? "" : chunk.content,
      transform: patternName,
      metadata: {
        ...chunk.metadata,
        fabricPattern: patternName,
        fabricResult: result.success,
        fabricError: result.error,
      },
    };
    return {
      chunks: [transformedChunk],
      result,
    };
  }

  async transformChunks(
    chunks: ContextChunk[],
    patternName: string,
    options?: { batchSize?: number; parallel?: boolean }
  ): Promise<ChunkTransformResult[]> {
    const batchSize = options?.batchSize ?? 5;
    const results: ChunkTransformResult[] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((chunk) => this.transformChunk(chunk, patternName))
      );
      results.push(...batchResults);
      if (!options?.parallel && i + batchSize < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    return results;
  }

  isAvailable(): boolean {
    return this.options.available;
  }

  updateOptions(options: Partial<FabricOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

export function createFabricTransformer(
  options: FabricOptions,
  provider?: AIProvider,
  endpoint?: ProviderEndpoint
): FabricTransformer {
  return new FabricTransformer(options, provider, endpoint);
}

export function getDefaultPatterns(): FabricPattern[] {
  return [...DEFAULT_PATTERNS];
}

export function getPatternsByCategory(
  category: FabricCategory
): FabricPattern[] {
  return DEFAULT_PATTERNS.filter((p) => p.category === category);
}
