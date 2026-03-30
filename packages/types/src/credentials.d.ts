export interface CredentialMetadata {
    scopes?: string[];
    expiresAt?: number;
    note?: string;
    lastRotated?: number;
    isDefault?: boolean;
}
export interface CredentialEntry {
    id: string;
    service: string;
    account: string;
    credentialType: CredentialType;
    metadata?: CredentialMetadata;
    isEnabled: boolean;
    workspaceAccess: string;
    createdAt: number;
    updatedAt: number;
    lastUsedAt?: number;
}
export type CredentialType = "api_key" | "oauth_token" | "password" | "token" | "certificate";
export interface CredentialProvider {
    get(service: string, account?: string): Promise<string | null>;
    set(service: string, account: string, value: string, metadata?: CredentialMetadata): Promise<void>;
    delete(service: string, account?: string): Promise<void>;
    list(service?: string): Promise<CredentialEntry[]>;
    exists(service: string, account?: string): Promise<boolean>;
}
export interface CredentialAccessLogEntry {
    id: number;
    credentialId: string;
    accessedBy: string;
    workspace: string;
    action: "read" | "write" | "delete";
    timestamp: number;
    success: boolean;
    errorMessage?: string;
}
export interface CredentialStorageOptions {
    workspaceAccess?: string;
    encrypt?: boolean;
    metadata?: CredentialMetadata;
}
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
export interface CredentialTestResult {
    success: boolean;
    message: string;
    latency?: number;
    details?: Record<string, unknown>;
}
//# sourceMappingURL=credentials.d.ts.map