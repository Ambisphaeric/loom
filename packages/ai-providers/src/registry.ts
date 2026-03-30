import type { AIProvider, ProviderRegistry, ModelResolution } from "./types.js";

export class EnhancementProviderRegistry implements ProviderRegistry {
	private providers = new Map<string, AIProvider>();
	private defaultProvider: string | null = null;

	register(provider: AIProvider): void {
		this.providers.set(provider.name, provider);
		if (!this.defaultProvider) {
			this.defaultProvider = provider.name;
		}
	}

	unregister(name: string): void {
		this.providers.delete(name);
		if (this.defaultProvider === name) {
			const remaining = [...this.providers.keys()];
			this.defaultProvider = remaining[0] ?? null;
		}
	}

	get(name: string): AIProvider | undefined {
		return this.providers.get(name);
	}

	list(): AIProvider[] {
		return [...this.providers.values()];
	}

	getDefault(): AIProvider | undefined {
		if (!this.defaultProvider) return undefined;
		return this.providers.get(this.defaultProvider);
	}

	setDefault(name: string): void {
		if (!this.providers.has(name)) {
			throw new Error(`Provider not found: ${name}`);
		}
		this.defaultProvider = name;
	}

	resolveModel(modelId: string): ModelResolution | null {
		for (const provider of this.providers.values()) {
			const model = provider.models.find((m) => m.id === modelId);
			if (model) {
				return {
					provider,
					model,
					endpoint: provider.defaultEndpoint,
				};
			}
		}

		const defaultProvider = this.getDefault();
		if (defaultProvider) {
			return {
				provider: defaultProvider,
				model: { id: modelId, name: modelId, purpose: "default" },
				endpoint: defaultProvider.defaultEndpoint,
			};
		}

		return null;
	}
}

export function createProviderRegistry(): ProviderRegistry {
	return new EnhancementProviderRegistry();
}
