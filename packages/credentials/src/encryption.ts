import type { EncryptionResult } from "./types.js";

const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function generateMasterKey(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
}

async function deriveKey(masterKey: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
	const importedKey = await crypto.subtle.importKey(
		"raw",
		masterKey.buffer as ArrayBuffer,
		{ name: "PBKDF2" },
		false,
		["deriveBits"]
	);

	const keyBits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
		importedKey,
		KEY_LENGTH * 8
	);

	return new Uint8Array(keyBits);
}

export async function encryptValue(
	value: string,
	masterKey: Uint8Array
): Promise<EncryptionResult> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

	const keyBits = await deriveKey(masterKey, salt);
	const key = await crypto.subtle.importKey(
		"raw",
		keyBits.buffer as ArrayBuffer,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt"]
	);

	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
		key,
		encoder.encode(value)
	);

	return {
		encrypted: Buffer.from(encrypted).toString("base64"),
		iv: Buffer.from(iv).toString("base64"),
		salt: Buffer.from(salt).toString("base64"),
	};
}

export async function decryptValue(
	encrypted: string,
	iv: string,
	salt: string,
	masterKey: Uint8Array
): Promise<string> {
	const saltBytes = Buffer.from(salt, "base64");
	const ivBytes = Buffer.from(iv, "base64");
	const encryptedBytes = Buffer.from(encrypted, "base64");

	const keyBits = await deriveKey(masterKey, new Uint8Array(saltBytes));
	const key = await crypto.subtle.importKey(
		"raw",
		keyBits.buffer as ArrayBuffer,
		{ name: "AES-GCM", length: 256 },
		false,
		["decrypt"]
	);

	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: ivBytes.buffer as ArrayBuffer },
		key,
		encryptedBytes
	);

	return decoder.decode(decrypted);
}

export function generateCredentialId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Buffer.from(bytes).toString("hex").slice(0, 32);
}

export function secureClear(buffer: Uint8Array): void {
	buffer.fill(0);
}
