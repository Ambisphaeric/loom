import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	LocalCredentialProvider,
	InMemoryCredentialStore,
	createCredentialProvider,
	generateMasterKey,
	generateCredentialId,
	encryptValue,
	decryptValue,
} from "../src/index.js";

describe("Encryption", () => {
	let masterKey: Uint8Array;

	beforeEach(() => {
		masterKey = generateMasterKey();
	});

	describe("encrypt/decrypt", () => {
		it("should encrypt and decrypt a value", async () => {
			const original = "my-secret-api-key";
			const encrypted = await encryptValue(original, masterKey);

			expect(encrypted.encrypted).toBeDefined();
			expect(encrypted.iv).toBeDefined();
			expect(encrypted.salt).toBeDefined();

			const decrypted = await decryptValue(
				encrypted.encrypted,
				encrypted.iv,
				encrypted.salt,
				masterKey
			);

			expect(decrypted).toBe(original);
		});

		it("should produce different ciphertext for same input", async () => {
			const original = "same-secret";
			const encrypted1 = await encryptValue(original, masterKey);
			const encrypted2 = await encryptValue(original, masterKey);

			expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
		});
	});

	describe("generateCredentialId", () => {
		it("should generate a valid credential ID", () => {
			const id = generateCredentialId();
			expect(typeof id).toBe("string");
			expect(id.length).toBeGreaterThan(0);
		});

		it("should generate unique IDs", () => {
			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				ids.add(generateCredentialId());
			}
			expect(ids.size).toBe(100);
		});
	});
});

describe("InMemoryCredentialStore", () => {
	let store: InMemoryCredentialStore;

	beforeEach(() => {
		store = new InMemoryCredentialStore();
	});

	describe("get/getByService", () => {
		it("should return undefined for non-existent credential", () => {
			expect(store.get("nonexistent")).toBeUndefined();
			expect(store.getByService("service", "account")).toBeUndefined();
		});
	});

	describe("list", () => {
		it("should return empty array initially", () => {
			expect(store.list()).toEqual([]);
			expect(store.list("service")).toEqual([]);
		});
	});

	describe("upsert/delete", () => {
		it("should add and retrieve a credential", () => {
			store.upsert({
				id: "test-id",
				service: "openai",
				account: "default",
				credentialType: "api_key",
				encryptedValue: "encrypted",
				iv: "iv",
				salt: "salt",
				metadata: null,
				isEnabled: 1,
				workspaceAccess: "*",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				lastUsedAt: null,
			});

			const retrieved = store.get("test-id");
			expect(retrieved).toBeDefined();
			expect(retrieved?.service).toBe("openai");
		});

		it("should delete a credential", () => {
			store.upsert({
				id: "test-id",
				service: "openai",
				account: "default",
				credentialType: "api_key",
				encryptedValue: "encrypted",
				iv: "iv",
				salt: "salt",
				metadata: null,
				isEnabled: 1,
				workspaceAccess: "*",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				lastUsedAt: null,
			});

			const deleted = store.delete("test-id");
			expect(deleted).toBe(true);
			expect(store.get("test-id")).toBeUndefined();
		});
	});
});

describe("LocalCredentialProvider", () => {
	let provider: LocalCredentialProvider;
	let masterKey: Uint8Array;

	beforeEach(() => {
		masterKey = generateMasterKey();
		provider = new LocalCredentialProvider("test-workspace", masterKey);
	});

	afterEach(() => {
		provider.destroy();
	});

	describe("set/get", () => {
		it("should store and retrieve a credential", async () => {
			await provider.set("openai", "default", "sk-test123");
			const retrieved = await provider.get("openai", "default");
			expect(retrieved).toBe("sk-test123");
		});

		it("should return null for non-existent credential", async () => {
			const retrieved = await provider.get("nonexistent", "default");
			expect(retrieved).toBeNull();
		});

		it("should throw CredentialAccessError on decryption failure", async () => {
			const store = new InMemoryCredentialStore();
			
			// Create provider with correct key
			const correctKey = generateMasterKey();
			const goodProvider = new LocalCredentialProvider("test-workspace", correctKey, store);
			await goodProvider.set("openai", "default", "sk-test123");
			goodProvider.destroy();
			
			// Create a new provider with different key but same store
			const wrongKey = generateMasterKey();
			const badProvider = new LocalCredentialProvider("test-workspace", wrongKey, store);
			
			// Try to decrypt with wrong key - should throw
			await expect(badProvider.get("openai", "default")).rejects.toThrow("Credential access failed");
			await expect(badProvider.get("openai", "default")).rejects.toThrow("decryption_failed");
			
			badProvider.destroy();
		});
	});

	describe("exists", () => {
		it("should return false for non-existent credential", async () => {
			const exists = await provider.exists("nonexistent", "default");
			expect(exists).toBe(false);
		});

		it("should return true after setting credential", async () => {
			await provider.set("openai", "default", "sk-test");
			const exists = await provider.exists("openai", "default");
			expect(exists).toBe(true);
		});
	});

	describe("list", () => {
		it("should return empty array initially", async () => {
			const list = await provider.list();
			expect(list).toEqual([]);
		});

		it("should list credentials for a service", async () => {
			await provider.set("openai", "default", "sk-test1");
			await provider.set("anthropic", "default", "sk-test2");

			const openaiList = await provider.list("openai");
			expect(openaiList.length).toBe(1);
			expect(openaiList[0].service).toBe("openai");

			const allList = await provider.list();
			expect(allList.length).toBe(2);
		});
	});

	describe("delete", () => {
		it("should delete a credential", async () => {
			await provider.set("openai", "default", "sk-test");
			await provider.delete("openai", "default");

			const exists = await provider.exists("openai", "default");
			expect(exists).toBe(false);
		});
	});
});

describe("createCredentialProvider", () => {
	it("should create a credential provider", () => {
		const provider = createCredentialProvider("test-workspace");
		expect(provider).toBeDefined();
		provider.destroy();
	});
});
