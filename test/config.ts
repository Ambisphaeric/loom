/**
 * Test Configuration
 *
 * Shared configuration for all E2E, integration, and simulation tests.
 */

export interface TestConfig {
  // Timeouts
  defaultTimeout: number;
  longTimeout: number;
  shortTimeout: number;

  // Retry configuration
  retries: number;
  retryDelay: number;

  // Environment detection
  isCI: boolean;
  isLocal: boolean;

  // Feature flags
  enableExternalServices: boolean;
  enableRealAIProviders: boolean;
  enableRealDatabases: boolean;

  // Test data paths
  tempDataDir: string;

  // Filter options
  tags: string[];
  categories: string[];
}

function detectCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.TRAVIS ||
    process.env.JENKINS_URL
  );
}

export function createTestConfig(overrides: Partial<TestConfig> = {}): TestConfig {
  const isCI = detectCI();

  return {
    // Timeouts
    defaultTimeout: overrides.defaultTimeout ?? (isCI ? 30000 : 10000),
    longTimeout: overrides.longTimeout ?? (isCI ? 60000 : 30000),
    shortTimeout: overrides.shortTimeout ?? 5000,

    // Retry configuration
    retries: overrides.retries ?? (isCI ? 2 : 1),
    retryDelay: overrides.retryDelay ?? 1000,

    // Environment detection
    isCI,
    isLocal: !isCI,

    // Feature flags - default to false in CI, true locally
    enableExternalServices: overrides.enableExternalServices ?? !isCI,
    enableRealAIProviders: overrides.enableRealAIProviders ?? false,
    enableRealDatabases: overrides.enableRealDatabases ?? false,

    // Test data paths
    tempDataDir: overrides.tempDataDir ?? `/tmp/enhancement-test-${Date.now()}`,

    // Filter options
    tags: overrides.tags ?? [],
    categories: overrides.categories ?? [],
  };
}

// Default configuration instance
export const defaultConfig = createTestConfig();

// Helper to check if a test should run based on tags
export function shouldRunTest(
  testTags: string[],
  filterTags: string[]
): boolean {
  if (filterTags.length === 0) return true;
  return filterTags.some((tag) => testTags.includes(tag));
}

// Helper to check if external services are available
export async function checkExternalServices(): Promise<{
  ollama: boolean;
  lmStudio: boolean;
  openai: boolean;
}> {
  const results = {
    ollama: false,
    lmStudio: false,
    openai: false,
  };

  // Check Ollama (localhost:11434)
  try {
    const response = await fetch("http://localhost:11434/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    results.ollama = response.ok;
  } catch {
    results.ollama = false;
  }

  // Check LM Studio (localhost:1234)
  try {
    const response = await fetch("http://localhost:1234/v1/models", {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    results.lmStudio = response.ok;
  } catch {
    results.lmStudio = false;
  }

  // Check OpenAI (requires API key, just check if key exists)
  results.openai = !!process.env.OPENAI_API_KEY;

  return results;
}

// Sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generate unique test ID
export function generateTestId(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
