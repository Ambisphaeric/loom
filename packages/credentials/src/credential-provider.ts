import { ulid } from "ulidx";
import type {
	CredentialProvider,
	CredentialEntry,
	CredentialMetadata,
	CredentialOptions,
} from "./types.js";
import { encryptValue, decryptValue, generateCredentialId, secureClear, generateMasterKey } from "./encryption.js";

interface StoredCredential {
	id: string;
	service: string;
	account: string;
	credentialType: string;
	encryptedValue: string;
	iv: string;
	salt: string;
	metadata: string | null;
	isEnabled: number;
	workspaceAccess: string;
	createdAt: number;
	updatedAt: number;
	lastUsedAt: number | null;
}

export class CredentialAccessError extends Error {
	constructor(
		public readonly service: string,
		public readonly account: string,
		public readonly reason: "decryption_failed" | "invalid_key" | "corrupted_data",
		public readonly cause?: unknown
	) {
		super(
			`Credential access failed for ${service}/${account}: ${reason}` +
				(cause ? ` - ${String(cause)}` : "")
		);
		this.name = "CredentialAccessError";
	}
}

export interface CredentialStore {
	get(id: string): StoredCredential | undefined;
	getByService(service: string, account: string): StoredCredential | undefined;
	list(service?: string): StoredCredential[];
	upsert(credential: StoredCredential): void;
	delete(id: string): boolean;
}

export class InMemoryCredentialStore implements CredentialStore {
	private credentials = new Map<string, StoredCredential>();

	get(id: string): StoredCredential | undefined {
		return this.credentials.get(id);
	}

	getByService(service: string, account: string): StoredCredential | undefined {
		for (const cred of this.credentials.values()) {
			if (cred.service === service && cred.account === account) {
				return cred;
			}
		}
		return undefined;
	}

	list(service?: string): StoredCredential[] {
		const all = [...this.credentials.values()];
		if (service) {
			return all.filter((c) => c.service === service && c.isEnabled === 1);
		}
		return all.filter((c) => c.isEnabled === 1);
	}

	upsert(credential: StoredCredential): void {
		this.credentials.set(credential.id, credential);
	}

	delete(id: string): boolean {
		return this.credentials.delete(id);
	}

	clear(): void {
		this.credentials.clear();
	}
}

export class LocalCredentialProvider implements CredentialProvider {
	private store: CredentialStore;
	private masterKey: Uint8Array;
	private workspace: string;

	constructor(
		workspace: string,
		masterKey: Uint8Array,
		store?: CredentialStore
	) {
		this.workspace = workspace;
		this.masterKey = masterKey;
		this.store = store ?? new InMemoryCredentialStore();
	}

	async get(service: string, account: string = "default"): Promise<string | null> {
		const stored = this.store.getByService(service, account);
		if (!stored || stored.isEnabled !== 1) {
			return null;
		}

		if (stored.workspaceAccess !== "*") {
			const allowed = stored.workspaceAccess.split(",");
			if (!allowed.includes(this.workspace)) {
				throw new Error(`Workspace ${this.workspace} not authorized`);
			}
		}

		try {
			const decrypted = await decryptValue(
				stored.encryptedValue,
				stored.iv,
				stored.salt,
				this.masterKey
			);

			stored.lastUsedAt = Date.now();
			this.store.upsert(stored);

			return decrypted;
		} catch (error) {
			throw new CredentialAccessError(
				service,
				account,
				"decryption_failed",
				error
			);
		}
	}

	async set(
		service: string,
		account: string,
		value: string,
		metadata?: CredentialMetadata,
		options: CredentialOptions = {}
	): Promise<void> {
		const existing = this.store.getByService(service, account);

		const encrypted = await encryptValue(value, this.masterKey);

		const now = Date.now();
		const credential: StoredCredential = {
			id: existing?.id ?? generateCredentialId(),
			service,
			account,
			credentialType: "api_key",
			encryptedValue: encrypted.encrypted,
			iv: encrypted.iv,
			salt: encrypted.salt,
			metadata: metadata ? JSON.stringify(metadata) : null,
			isEnabled: 1,
			workspaceAccess: options.workspaceAccess ?? "*",
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			lastUsedAt: null,
		};

		this.store.upsert(credential);
	}

	async delete(service: string, account: string = "default"): Promise<void> {
		const stored = this.store.getByService(service, account);
		if (stored) {
			this.store.delete(stored.id);
		}
	}

	async list(service?: string): Promise<CredentialEntry[]> {
		const all = this.store.list(service);

		return all.map((c) => ({
			id: c.id,
			service: c.service,
			account: c.account,
			credentialType: c.credentialType as CredentialEntry["credentialType"],
			metadata: c.metadata ? JSON.parse(c.metadata) : undefined,
			isEnabled: c.isEnabled === 1,
			workspaceAccess: c.workspaceAccess,
			createdAt: c.createdAt,
			updatedAt: c.updatedAt,
			lastUsedAt: c.lastUsedAt ?? undefined,
		}));
	}

	async exists(service: string, account: string = "default"): Promise<boolean> {
		const stored = this.store.getByService(service, account);
		return !!stored && stored.isEnabled === 1;
	}

	destroy(): void {
		secureClear(this.masterKey);
	}
}

export function createCredentialProvider(
	workspace: string,
	masterKey?: Uint8Array
): CredentialProvider {
	const key = masterKey ?? generateMasterKey();
	return new LocalCredentialProvider(workspace, key);
}
