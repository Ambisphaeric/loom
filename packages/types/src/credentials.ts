// ============================================================================
// Enhancement — Credential Types
// ============================================================================

// --- Credential Metadata ---

export interface CredentialMetadata {
	scopes?: string[];
	expiresAt?: number;
	note?: string;
	lastRotated?: number;
	isDefault?: boolean;
}

// --- Credential Entry (metadata only, no value) ---

export interface CredentialEntry {
	id: string;
	service: string;
	account: string;
	credentialType: CredentialType;
	metadata?: CredentialMetadata;
	isEnabled: boolean;
	workspaceAccess: string; // "*" = all, or comma-separated list
	createdAt: number;
	updatedAt: number;
	lastUsedAt?: number;
}

// --- Credential Types ---

export type CredentialType = "api_key" | "oauth_token" | "password" | "token" | "certificate";

// --- Credential Provider Interface ---

export interface CredentialProvider {
	get(service: string, account?: string): Promise<string | null>;
	set(
		service: string,
		account: string,
		value: string,
		metadata?: CredentialMetadata
	): Promise<void>;
	delete(service: string, account?: string): Promise<void>;
	list(service?: string): Promise<CredentialEntry[]>;
	exists(service: string, account?: string): Promise<boolean>;
}

// --- Credential Access Log ---

export interface CredentialAccessLogEntry {
	id: number;
	credentialId: string;
	accessedBy: string; // plugin name, recipe id, or "cli"
	workspace: string;
	action: "read" | "write" | "delete";
	timestamp: number;
	success: boolean;
	errorMessage?: string;
}

// --- Credential Storage Options ---

export interface CredentialStorageOptions {
	workspaceAccess?: string; // "*" or comma-separated workspace names
	encrypt?: boolean; // default true
	metadata?: CredentialMetadata;
}

// --- Credential Import/Export ---

export interface CredentialExportEntry {
	service: string;
	account: string;
	value: string;
	metadata?: CredentialMetadata;
}

export interface CredentialExportFormat {
	version: string;
	exportedAt: number;
	entries: CredentialExportEntry[];
}

// --- Credential Test Result ---

export interface CredentialTestResult {
	success: boolean;
	message: string;
	latency?: number;
	details?: Record<string, unknown>;
}
