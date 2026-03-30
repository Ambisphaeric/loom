import type {
	DiscoveredService,
	LLMDetectionResult,
	STTDetectionResult,
	DiscoveryOptions,
} from "./types.js";

const LLM_PORTS = [
	{ port: 11434, name: "ollama", type: "llm" as const },
	{ port: 1234, name: "lm-studio", type: "llm" as const },
	{ port: 8000, name: "vllm", type: "llm" as const },
	{ port: 8080, name: "llama-cpp", type: "llm" as const },
];

const STT_PORTS = [
	{ port: 8765, name: "parakeet", type: "stt" as const },
	{ port: 8766, name: "whisper", type: "stt" as const },
];

export async function detectLLM(
	provider: string,
	options: DiscoveryOptions = {}
): Promise<LLMDetectionResult> {
	const timeout = options.timeout ?? 500;

	const llmConfig = LLM_PORTS.find((p) => p.name === provider);
	if (!llmConfig) {
		return { detected: false };
	}

	const url = `http://localhost:${llmConfig.port}`;

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		const response = await fetch(`${url}/v1/models`, {
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			return { detected: false };
		}

		const data = (await response.json()) as {
			data?: Array<{ id: string }>;
		};

		const models = data.data?.map((m) => m.id) ?? [];

		return {
			detected: true,
			provider: llmConfig.name,
			models,
			url,
		};
	} catch {
		return { detected: false };
	}
}

export async function detectSTT(
	provider: string,
	options: DiscoveryOptions = {}
): Promise<STTDetectionResult> {
	const timeout = options.timeout ?? 500;

	const sttConfig = STT_PORTS.find((p) => p.name === provider);
	if (!sttConfig) {
		return { detected: false };
	}

	const url = `http://localhost:${sttConfig.port}`;

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		const response = await fetch(`${url}/health`, {
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			return { detected: false };
		}

		return {
			detected: true,
			provider: sttConfig.name,
		};
	} catch {
		return { detected: false };
	}
}

export async function detectAllServices(
	options: DiscoveryOptions = {}
): Promise<DiscoveredService[]> {
	const results: DiscoveredService[] = [];
	const timeout = options.timeout ?? 500;

	const allPorts = [...LLM_PORTS, ...STT_PORTS];

	const probes = allPorts.map(async (config) => {
		const url = `http://localhost:${config.port}`;

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			const response = await fetch(`${url}/v1/models`, {
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (response.ok) {
				const data = (await response.json()) as {
					data?: Array<{ id: string }>;
					version?: string;
				};

				results.push({
					name: config.name,
					type: config.type,
					url,
					port: config.port,
					version: data.version,
					models: data.data?.map((m) => m.id),
					status: "running",
				});
			}
		} catch {
			// Service not running
		}
	});

	await Promise.allSettled(probes);

	return results;
}

export async function probePort(port: number, path: string = "/health"): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 500);

		const response = await fetch(`http://localhost:${port}${path}`, {
			signal: controller.signal,
		});

		clearTimeout(timeoutId);
		return response.ok;
	} catch {
		return false;
	}
}
